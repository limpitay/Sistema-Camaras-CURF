const http = require('http');
const crypto = require('crypto');

function md5(texto) {
  return crypto.createHash('md5').update(texto).digest('hex');
}

// Digest Auth (RFC 2617) — primer pedido sin credenciales, el dispositivo
// responde 401 con los parametros del desafio en WWW-Authenticate, y recien
// ahi se arma la respuesta con esos datos. Compartido entre ISAPI (Hikvision)
// y CGI (Dahua): el mecanismo de auth es identico en los dos, solo cambia el
// formato de body/respuesta de cada protocolo (eso lo parsea cada cliente
// por separado, ver isapiClient.js / dahuaClient.js).
function parsearDesafioDigest(header) {
  if (!header || !header.startsWith('Digest ')) return null;
  const params = {};
  const regex = /(\w+)=(?:"([^"]*)"|([^,]+))/g;
  let m;
  while ((m = regex.exec(header))) {
    params[m[1]] = m[2] !== undefined ? m[2] : m[3];
  }
  return params;
}

function construirAuthorization({ usuario, contrasena, method, uri, desafio }) {
  const ha1 = md5(`${usuario}:${desafio.realm}:${contrasena}`);
  const ha2 = md5(`${method}:${uri}`);
  let response;
  let extra = '';
  if (desafio.qop) {
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    response = md5(`${ha1}:${desafio.nonce}:${nc}:${cnonce}:${desafio.qop}:${ha2}`);
    extra = `, qop=${desafio.qop}, nc=${nc}, cnonce="${cnonce}"`;
  } else {
    response = md5(`${ha1}:${desafio.nonce}:${ha2}`);
  }
  const opaque = desafio.opaque ? `, opaque="${desafio.opaque}"` : '';
  return `Digest username="${usuario}", realm="${desafio.realm}", nonce="${desafio.nonce}", uri="${uri}", response="${response}"${extra}${opaque}`;
}

function pedido(opciones, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(opciones, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// GET o POST a un path cualquiera de un NVR con Digest Auth. `nvr` necesita
// `ip`, `usuario`, `contrasena` (migracion 028). El primer pedido (el que va
// a rebotar con 401 para conseguir el desafio) se manda SIN el body:
// mandarlo en las dos vueltas confunde el parser de algunos NVR, que llegan
// a leer los dos bodies pegados — mismo criterio que usa curl --digest -d.
async function pedidoDigest(nvr, method, path, body, { contentType } = {}) {
  if (!nvr.ip || !nvr.usuario || !nvr.contrasena) {
    throw new Error(`El NVR "${nvr.hostname}" no tiene IP/usuario/contrasena cargados`);
  }
  const headersBase = body && contentType ? { 'Content-Type': contentType } : {};

  const primeraRespuesta = await pedido({ hostname: nvr.ip, port: 80, path, method, headers: headersBase });
  if (primeraRespuesta.status !== 401) {
    return primeraRespuesta;
  }

  const desafio = parsearDesafioDigest(primeraRespuesta.headers['www-authenticate']);
  if (!desafio) {
    throw new Error(`El NVR "${nvr.hostname}" devolvio 401 sin desafio Digest valido`);
  }
  const authorization = construirAuthorization({ usuario: nvr.usuario, contrasena: nvr.contrasena, method, uri: path, desafio });
  const headersFinales = { ...headersBase, Authorization: authorization };
  if (body) headersFinales['Content-Length'] = Buffer.byteLength(body);

  return pedido({ hostname: nvr.ip, port: 80, path, method, headers: headersFinales }, body);
}

module.exports = { pedidoDigest };
