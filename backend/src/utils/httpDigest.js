const http = require('http');
const https = require('https');
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

function construirAuthorization({ usuario, contrasena, method, uri, body, desafio }) {
  const ha1 = md5(`${usuario}:${desafio.realm}:${contrasena}`);
  // El desafio puede ofrecer varios qop juntos (ej. qop="auth,auth-int") --
  // hay que elegir UNO solo para el header de respuesta (RFC 2617), no
  // mandar la lista cruda. Se prefiere "auth" (no necesita hash del body),
  // pero si el NVR solo ofrece "auth-int" hay que respetarlo -- HA2 se
  // calcula distinto en ese caso (incluye el hash del body, ver abajo).
  // Sin nada de esto, un NVR que ofrece mas de un qop, o solo auth-int,
  // rechaza la respuesta con 401 aunque el usuario/contrasena sean
  // correctos -- Python's requests hace la misma eleccion de qop.
  const opciones = desafio.qop ? desafio.qop.split(',').map((s) => s.trim()) : [];
  const qop = opciones.includes('auth') ? 'auth' : (opciones[0] || null);
  const ha2 = qop === 'auth-int' ? md5(`${method}:${uri}:${md5(body || '')}`) : md5(`${method}:${uri}`);
  let response;
  let extra = '';
  if (qop) {
    const nc = '00000001';
    const cnonce = crypto.randomBytes(8).toString('hex');
    response = md5(`${ha1}:${desafio.nonce}:${nc}:${cnonce}:${qop}:${ha2}`);
    extra = `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`;
  } else {
    response = md5(`${ha1}:${desafio.nonce}:${ha2}`);
  }
  const opaque = desafio.opaque ? `, opaque="${desafio.opaque}"` : '';
  return `Digest username="${usuario}", realm="${desafio.realm}", nonce="${desafio.nonce}", uri="${uri}", response="${response}"${extra}${opaque}`;
}

// Algunos NVR (ej. un DHI-NVR1108HS-S3/H) tienen el puerto 80 apagado del
// todo y redirigen (301/302) directo a HTTPS -- certificado autofirmado del
// propio equipo, por eso rejectUnauthorized:false (mismo criterio que un
// curl -k contra un dispositivo de LAN interna, no un sitio publico).
function pedido({ protocolo = 'http', ...opciones }, body) {
  const transporte = protocolo === 'https' ? https : http;
  const opcionesFinales = protocolo === 'https' ? { ...opciones, rejectUnauthorized: false } : opciones;
  return new Promise((resolve, reject) => {
    const req = transporte.request(opcionesFinales, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString('utf8') }));
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

const CODIGOS_REDIRECT = [301, 302, 303, 307, 308];

// GET o POST a un path cualquiera de un NVR con Digest Auth. `nvr` necesita
// `ip`, `usuario`, `contrasena` (migracion 028). El primer pedido (el que va
// a rebotar con 401 para conseguir el desafio) se manda SIN el body:
// mandarlo en las dos vueltas confunde el parser de algunos NVR, que llegan
// a leer los dos bodies pegados — mismo criterio que usa curl --digest -d.
//
// `destino` es el protocolo/host/puerto donde efectivamente se manda el
// pedido -- arranca en http/80 (nvr.ip), pero si ese puerto redirige a
// HTTPS (ver CODIGOS_REDIRECT) se sigue una sola vez contra el destino real,
// sin reiniciar el ida-y-vuelta del Digest desde cero mas de una vez.
async function pedidoDigest(nvr, method, path, body, { contentType } = {}, destino = { protocolo: 'http', host: nvr.ip, port: 80 }, siguioRedirect = false) {
  if (!nvr.ip || !nvr.usuario || !nvr.contrasena) {
    throw new Error(`El NVR "${nvr.hostname}" no tiene IP/usuario/contrasena cargados`);
  }
  // DIGEST_DEBUG traza las DOS vueltas completas (status/headers de cada
  // una), no solo el caso "401 rechazado" -- asi sirve tambien para
  // diagnosticar un NVR que ni siquiera llega a ofrecer el desafio (ej. un
  // 302 antes de eso) sin tener que adivinar cual de las dos vueltas fallo.
  const debug = process.env.DIGEST_DEBUG === 'true';
  const headersBase = body && contentType ? { 'Content-Type': contentType } : {};
  const opcionesBase = { protocolo: destino.protocolo, hostname: destino.host, port: destino.port, path, method };

  if (debug) console.error('[digest debug] %s -> %s://%s:%s%s (usuario=%s)', nvr.hostname, destino.protocolo, destino.host, destino.port, path, nvr.usuario);

  let primeraRespuesta;
  try {
    primeraRespuesta = await pedido({ ...opcionesBase, headers: headersBase });
  } catch (err) {
    // Error de red (timeout, conexion rechazada, etc.) -- sin esto no queda
    // ningun rastro en el log de que el pedido ni siquiera llego a tener
    // respuesta HTTP.
    if (debug) console.error('[digest debug] error de red en la 1ra vuelta: %s', err.message);
    throw err;
  }
  if (debug) {
    console.error(
      '[digest debug] 1ra respuesta: status=%s www-authenticate=%s location=%s',
      primeraRespuesta.status, primeraRespuesta.headers['www-authenticate'] || '(ninguno)', primeraRespuesta.headers.location || '(ninguno)'
    );
  }

  if (CODIGOS_REDIRECT.includes(primeraRespuesta.status) && primeraRespuesta.headers.location && !siguioRedirect) {
    const destinoUrl = new URL(primeraRespuesta.headers.location);
    const nuevoDestino = {
      protocolo: destinoUrl.protocol.replace(':', ''),
      host: destinoUrl.hostname,
      port: destinoUrl.port || (destinoUrl.protocol === 'https:' ? 443 : 80),
    };
    if (debug) console.error('[digest debug] siguiendo redirect a %s', primeraRespuesta.headers.location);
    return pedidoDigest(nvr, method, destinoUrl.pathname + destinoUrl.search, body, { contentType }, nuevoDestino, true);
  }

  if (primeraRespuesta.status !== 401) {
    return primeraRespuesta;
  }

  const desafio = parsearDesafioDigest(primeraRespuesta.headers['www-authenticate']);
  if (!desafio) {
    throw new Error(`El NVR "${nvr.hostname}" devolvio 401 sin desafio Digest valido`);
  }
  const authorization = construirAuthorization({ usuario: nvr.usuario, contrasena: nvr.contrasena, method, uri: path, body, desafio });
  const headersFinales = { ...headersBase, Authorization: authorization };
  if (body) headersFinales['Content-Length'] = Buffer.byteLength(body);

  if (debug) console.error('[digest debug] authorization enviado=%s', authorization);

  const segunda = await pedido({ ...opcionesBase, headers: headersFinales }, body);
  if (debug) console.error('[digest debug] 2da respuesta: status=%s www-authenticate=%s', segunda.status, segunda.headers['www-authenticate'] || '(ninguno)');
  return segunda;
}

module.exports = { pedidoDigest };
