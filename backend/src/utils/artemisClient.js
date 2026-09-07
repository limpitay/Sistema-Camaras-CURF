const https = require('https');
const crypto = require('crypto');

// Cliente minimo para la API abierta de HikCentral (Artemis). Firma cada
// pedido con HMAC-SHA256 (AppKey/AppSecret), igual que el script de
// pre-request de Postman que ya prueba Sistemas contra el servidor.
function leerConfig() {
  const host = process.env.ARTEMIS_HOST;
  const appKey = process.env.ARTEMIS_APP_KEY;
  const appSecret = process.env.ARTEMIS_APP_SECRET;
  if (!host || !appKey || !appSecret) {
    throw new Error('Integracion con HikCentral no configurada (falta ARTEMIS_HOST, ARTEMIS_APP_KEY o ARTEMIS_APP_SECRET en .env)');
  }
  // El servidor de HikCentral en la LAN usa certificado autofirmado -> por
  // default no se valida TLS contra el (ARTEMIS_VERIFY_SSL=false).
  const verifySsl = process.env.ARTEMIS_VERIFY_SSL === 'true';
  return { host, appKey, appSecret, verifySsl };
}

function firmar(method, path, appKey, appSecret) {
  const timestamp = Date.now().toString();
  const stringToSign = [
    method,
    'application/json',
    'application/json',
    `x-ca-key:${appKey}`,
    `x-ca-timestamp:${timestamp}`,
    path,
  ].join('\n');
  const signature = crypto.createHmac('sha256', appSecret).update(stringToSign).digest('base64');
  return { timestamp, signature };
}

function artemisPost(path, body) {
  const { host, appKey, appSecret, verifySsl } = leerConfig();
  const { timestamp, signature } = firmar('POST', path, appKey, appSecret);
  const payload = JSON.stringify(body || {});
  const url = new URL(path, host);

  const opciones = {
    hostname: url.hostname,
    port: url.port || 443,
    path: url.pathname,
    method: 'POST',
    rejectUnauthorized: verifySsl,
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
      'x-ca-key': appKey,
      'x-ca-timestamp': timestamp,
      'x-ca-signature-headers': 'x-ca-key,x-ca-timestamp',
      'x-ca-signature': signature,
    },
  };

  if (process.env.ARTEMIS_DEBUG === 'true') {
    console.error('[artemis debug] host=%s port=%s path=%s', opciones.hostname, opciones.port, opciones.path);
    console.error('[artemis debug] headers=%o', opciones.headers);
    console.error('[artemis debug] body=%s', payload);
  }

  return new Promise((resolve, reject) => {
    const req = https.request(opciones, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const texto = Buffer.concat(chunks).toString('utf8');
        try {
          resolve(JSON.parse(texto));
        } catch {
          reject(new Error(`Respuesta no-JSON de HikCentral (HTTP ${res.statusCode}): ${texto.slice(0, 200)}`));
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

// Descarga los bytes de una foto ya capturada (picUrl que devuelve el
// endpoint de captura), respetando el mismo criterio de TLS autofirmado.
function descargarImagen(picUrl) {
  const { verifySsl } = leerConfig();
  return new Promise((resolve, reject) => {
    const req = https.get(picUrl, { rejectUnauthorized: verifySsl }, (res) => {
      if (res.statusCode !== 200) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode} al descargar la foto`));
        return;
      }
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
    });
    req.on('error', reject);
  });
}

// Trae todas las camaras dadas de alta en HikCentral, paginando (la API
// limita pageSize a 1000 por pedido).
async function listarCamarasArtemis() {
  const camaras = [];
  let pageNo = 1;
  const pageSize = 100;
  for (;;) {
    const data = await artemisPost('/artemis/api/resource/v1/cameras', { pageNo, pageSize });
    if (data.code !== '0') {
      throw new Error(`codigo ${data.code}: ${data.msg}`);
    }
    const lista = data.data?.list || [];
    camaras.push(...lista);
    if (lista.length < pageSize) break;
    pageNo += 1;
  }
  return camaras;
}

// Pide a HikCentral que capture una foto en vivo de la camara indicada y
// devuelve la URL temporal (picUrl) donde queda disponible.
async function capturarFoto(cameraIndexCode) {
  const data = await artemisPost('/artemis/api/video/v1/cameras/capture', { cameraIndexCode });
  if (data.code !== '0') {
    throw new Error(`codigo ${data.code}: ${data.msg}`);
  }
  const picUrl = data.data?.picUrl;
  if (!picUrl) throw new Error('HikCentral no devolvio picUrl');
  return picUrl;
}

module.exports = { listarCamarasArtemis, capturarFoto, descargarImagen };
