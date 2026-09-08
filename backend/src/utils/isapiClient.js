const http = require('http');
const crypto = require('crypto');
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser();

function md5(texto) {
  return crypto.createHash('md5').update(texto).digest('hex');
}

// ISAPI (los NVR/DVR Hikvision, a diferencia de HikCentral/Artemis) exige
// Digest Auth, no Basic ni firma HMAC — RFC 2617 clasico: primer pedido sin
// credenciales, el dispositivo responde 401 con los parametros del desafio
// en WWW-Authenticate, y recien ahi se arma la respuesta con esos datos.
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

// GET o POST a un path ISAPI de un NVR, con el ida-y-vuelta de Digest Auth.
// `nvr` necesita `ip`, `usuario`, `contrasena` (ver migracion 028). El primer
// pedido (el que va a rebotar con 401 para conseguir el desafio) se manda
// SIN el body: mandarlo en las dos vueltas confunde el parser XML de estos
// NVR, que llega a leer los dos bodies pegados y tira "two root tags" —
// mismo criterio que usa curl --digest con -d.
async function isapiRequest(nvr, method, path, body) {
  if (!nvr.ip || !nvr.usuario || !nvr.contrasena) {
    throw new Error(`El NVR "${nvr.hostname}" no tiene IP/usuario/contrasena ISAPI cargados`);
  }
  const headersBase = body ? { 'Content-Type': 'application/xml' } : {};

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

  if (process.env.ISAPI_DEBUG === 'true') {
    console.error('[isapi debug] enviando method=%s path=%s headers=%o body=%s', method, path, headersFinales, JSON.stringify(body));
  }

  return pedido({ hostname: nvr.ip, port: 80, path, method, headers: headersFinales }, body);
}

async function isapiXml(nvr, method, path, body) {
  const respuesta = await isapiRequest(nvr, method, path, body);
  if (respuesta.status === 401) {
    throw new Error(`Usuario/contrasena ISAPI rechazados por el NVR "${nvr.hostname}"`);
  }
  if (respuesta.status < 200 || respuesta.status >= 300) {
    if (process.env.ISAPI_DEBUG === 'true') {
      console.error(`[isapi debug] HTTP ${respuesta.status} body=%s`, respuesta.body);
    }
    throw new Error(`El NVR "${nvr.hostname}" respondio HTTP ${respuesta.status}`);
  }
  return parser.parse(respuesta.body);
}

// GET /ISAPI/System/deviceInfo — modelo, firmware, numero de serie.
async function obtenerInfoDispositivo(nvr) {
  const data = await isapiXml(nvr, 'GET', '/ISAPI/System/deviceInfo');
  const info = data.DeviceInfo || {};
  return {
    nombre: info.deviceName,
    modelo: info.model,
    firmware: info.firmwareVersion,
    numeroSerie: info.serialNumber,
  };
}

// GET /ISAPI/ContentMgmt/Storage — capacidad/libre de cada disco.
async function obtenerEstadoDiscos(nvr) {
  const data = await isapiXml(nvr, 'GET', '/ISAPI/ContentMgmt/Storage');
  const lista = data.storage?.hddList?.hdd;
  const discos = Array.isArray(lista) ? lista : (lista ? [lista] : []);
  return discos.map((d) => ({
    id: d.id,
    capacidadMb: Number(d.capacity) || 0,
    libreMb: Number(d.freeSpace) || 0,
    estado: d.status,
    propiedad: d.property,
  }));
}

// GET /ISAPI/ContentMgmt/InputProxy/channels/status — online/offline de cada
// canal IP (los canales de un NVR conectados a camaras IP son "InputProxy"),
// mas la IP real de la camara conectada (sirve para matchear contra el
// inventario local) y si HikCentral detecto password debil/de riesgo.
async function obtenerEstadoCanales(nvr) {
  const data = await isapiXml(nvr, 'GET', '/ISAPI/ContentMgmt/InputProxy/channels/status');
  const lista = data.InputProxyChannelStatusList?.InputProxyChannelStatus;
  const canales = Array.isArray(lista) ? lista : (lista ? [lista] : []);
  return canales.map((c) => ({
    canal: Number(c.id),
    online: c.online === 'true' || c.online === true,
    ip: c.sourceInputPortDescriptor?.ipAddress || null,
    passwordEstado: c.SecurityStatus?.PasswordStatus || null,
  }));
}

// GET /ISAPI/ContentMgmt/InputProxy/channels — nombre configurado de cada
// canal (el mismo que se ve en HikCentral > Dispositivo > Camara > Nombre;
// se carga/edita ahi o en el propio NVR, esto solo lo lee).
async function obtenerNombresCanales(nvr) {
  const data = await isapiXml(nvr, 'GET', '/ISAPI/ContentMgmt/InputProxy/channels');
  const lista = data.InputProxyChannelList?.InputProxyChannel;
  const canales = Array.isArray(lista) ? lista : (lista ? [lista] : []);
  return canales.map((c) => ({ canal: Number(c.id), nombre: c.name || null }));
}

// GET /ISAPI/Streaming/channels/<canal*100+1> — resolucion/codec/bitrate real
// configurado en el stream principal de un canal. System/Video/inputs/channels
// (la fuente "oficial" para esto) da 403 en NVRs 100% IP como este, que no
// tienen entradas analogicas -- este es el reemplazo que si funciona.
async function obtenerParametrosVideoCanal(nvr, canal) {
  const data = await isapiXml(nvr, 'GET', `/ISAPI/Streaming/channels/${canal * 100 + 1}`);
  const v = data.StreamingChannel?.Video || {};
  return {
    codec: v.videoCodecType || null,
    ancho: Number(v.videoResolutionWidth) || null,
    alto: Number(v.videoResolutionHeight) || null,
    bitrateMaxKbps: Number(v.vbrUpperCap) || null,
  };
}

// POST /ISAPI/ContentMgmt/search — busca la grabacion mas antigua de un
// canal (trackID = canal*100+1, stream principal) para estimar la
// retencion real de grabacion disponible en ese canal.
//
// Dos detalles no documentados que hacen falta para que este NVR (firmware
// V4.84.100) acepte el body -- sin ellos tira "badXmlContent" pase lo que
// pase con el resto del XML (probado directo en Postman tambien, no es un
// problema del cliente): searchID tiene que ser un UUID valido (no un string
// cualquiera), y metadataDescriptor tiene que ser exactamente
// "//metadata.psia.org/VideoMotion".
async function buscarGrabacionMasAntigua(nvr, canal) {
  const trackId = canal * 100 + 1;
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<CMSearchDescription>
  <searchID>${crypto.randomUUID().toUpperCase()}</searchID>
  <trackList>
    <trackID>${trackId}</trackID>
  </trackList>
  <timeSpanList>
    <timeSpan>
      <startTime>2000-01-01T00:00:00Z</startTime>
      <endTime>${new Date().toISOString().replace(/\.\d{3}Z$/, 'Z')}</endTime>
    </timeSpan>
  </timeSpanList>
  <contentTypeList>
    <contentType>video</contentType>
  </contentTypeList>
  <maxResults>1</maxResults>
  <searchResultPostion>0</searchResultPostion>
  <metadataList>
    <metadataDescriptor>//metadata.psia.org/VideoMotion</metadataDescriptor>
  </metadataList>
</CMSearchDescription>`;

  const data = await isapiXml(nvr, 'POST', '/ISAPI/ContentMgmt/search', body);
  const resultado = data.CMSearchResult;
  if (!resultado || resultado.numOfMatches === 0 || resultado.numOfMatches === '0') {
    return null;
  }
  const item = Array.isArray(resultado.matchList?.searchMatchItem)
    ? resultado.matchList.searchMatchItem[0]
    : resultado.matchList?.searchMatchItem;
  return item?.timeSpan?.startTime || null;
}

module.exports = {
  obtenerInfoDispositivo,
  obtenerEstadoDiscos,
  obtenerEstadoCanales,
  obtenerNombresCanales,
  obtenerParametrosVideoCanal,
  buscarGrabacionMasAntigua,
  // Solo para el script de prueba (_test_isapi.js) mientras se ajustan
  // nombres de campo reales contra el equipo -- no lo usan las rutas.
  isapiXml,
};
