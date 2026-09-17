// Cliente para los NVR Dahua del inventario -- misma Digest Auth que ISAPI
// (ver httpDigest.js) pero protocolo CGI propio de Dahua: texto plano
// "clave=valor" por linea (nada de XML), y endpoints totalmente distintos.
//
// Cobertura mas chica que isapiClient.js a proposito: solo discos y estado
// de canales, que es lo unico diagnosticado y confirmado contra un NVR real
// (DHI-NVR4232-4KS2, ver los scripts dahua_*.py que probaron estos campos).
// Todavia no hay endpoint de busqueda de grabaciones ni de bitrate por canal
// para Dahua, asi que el Panel NVR muestra esos datos en null para estos NVR
// hasta que se agreguen.
const { pedidoDigest } = require('./httpDigest');

// El path CGI real va antes de la query (ej. /cgi-bin/storageDevice.cgi),
// pero pedidoDigest firma la URI completa (path+query) para el digest, asi
// que arma el path entero de una para no firmar algo distinto de lo que
// despues manda `http.request`.
async function dahuaCgi(nvr, endpoint, params) {
  const qs = new URLSearchParams(params).toString();
  const path = `/cgi-bin/${endpoint}${qs ? `?${qs}` : ''}`;
  const respuesta = await pedidoDigest(nvr, 'GET', path, null);
  if (respuesta.status === 401) {
    throw new Error(`Usuario/contrasena rechazados por el NVR "${nvr.hostname}"`);
  }
  if (respuesta.status < 200 || respuesta.status >= 300) {
    throw new Error(`El NVR "${nvr.hostname}" respondio HTTP ${respuesta.status}`);
  }
  return respuesta.body;
}

function parseKV(raw) {
  const resultado = {};
  for (const linea of raw.trim().split(/\r?\n/)) {
    const idx = linea.indexOf('=');
    if (idx === -1) continue;
    resultado[linea.slice(0, idx).trim()] = linea.slice(idx + 1).trim();
  }
  return resultado;
}

// storageDevice.cgi?action=getDeviceAllInfo -- lineas tipo:
//   list.info[0].Name=/dev/sda
//   list.info[0].State=Success
//   list.info[0].Detail[0].TotalBytes=...  (particiones/volumenes del disco)
const LINEA_DISCO_RE = /^list\.info\[(\d+)]\.(?:Detail\[(\d+)]\.(\w+)|(\w+))$/;

function parseDiscos(raw) {
  const discos = {};
  for (const linea of raw.trim().split(/\r?\n/)) {
    const idx = linea.indexOf('=');
    if (idx === -1) continue;
    const clave = linea.slice(0, idx).trim();
    const valor = linea.slice(idx + 1).trim();
    const m = clave.match(LINEA_DISCO_RE);
    if (!m) continue;
    const [, iDisco, iParte, campoParte, campo] = m;
    const disco = (discos[iDisco] ||= { particiones: {} });
    if (iParte !== undefined) disco.particiones[iParte] = { ...disco.particiones[iParte], [campoParte]: valor };
    else disco[campo] = valor;
  }
  return discos;
}

// Solo se cuenta la particion "0" de cada disco fisico (la de grabacion real
// -- las demas suelen ser metadata/indices internos), mismo criterio que
// dahua_NVR_status.py. Bytes -> MB (/1024/1024) para usar la misma unidad
// que ISAPI (capacidadMb/libreMb) en el resto de la app.
async function obtenerEstadoDiscos(nvr) {
  const raw = await dahuaCgi(nvr, 'storageDevice.cgi', { action: 'getDeviceAllInfo' });
  const discos = parseDiscos(raw);
  return Object.entries(discos).map(([id, disco]) => {
    const p0 = disco.particiones['0'] || {};
    const totalBytes = Number(p0.TotalBytes) || 0;
    const usadoBytes = Number(p0.UsedBytes) || 0;
    return {
      id: disco.Name || id,
      capacidadMb: totalBytes / 1024 / 1024,
      libreMb: (totalBytes - usadoBytes) / 1024 / 1024,
      estado: disco.State || null,
      propiedad: null,
    };
  });
}

// LogicDeviceManager.cgi?action=getCameraAll -- lineas tipo:
//   camera[0].Enable=true                                    (asignado/ocupado)
//   camera[0].DeviceInfo.Address=192.168.24.5                (ip de la camara)
//   camera[0].DeviceInfo.Name=3F01306PAA00053                (nombre/serie)
//   camera[0].DeviceInfo.VideoInputs[0].Name=JO-Sala Espera x Ingreso
const LINEA_CAMARA_RE = /^camera\[(\d+)]\.(?:DeviceInfo\.VideoInputs\[0]\.(\w+)|DeviceInfo\.(\w+)|(\w+))$/;

function parseCamaras(raw) {
  const camaras = {};
  for (const linea of raw.trim().split(/\r?\n/)) {
    const idx = linea.indexOf('=');
    if (idx === -1) continue;
    const clave = linea.slice(0, idx).trim();
    const valor = linea.slice(idx + 1).trim();
    const m = clave.match(LINEA_CAMARA_RE);
    if (!m) continue;
    const [, iCam, campoVideoInput, campoDeviceInfo, campo] = m;
    const cam = (camaras[iCam] ||= {});
    if (campoVideoInput !== undefined) cam.videoInput = { ...cam.videoInput, [campoVideoInput]: valor };
    else if (campoDeviceInfo !== undefined) cam.deviceInfo = { ...cam.deviceInfo, [campoDeviceInfo]: valor };
    else cam[campo] = valor;
  }
  return camaras;
}

// "online" aca es en realidad "Enable" (canal asignado/configurado) -- Dahua
// no expone por este endpoint si la camara esta conectada de verdad en este
// momento, a diferencia de ISAPI. Se mapea igual a `online` para reusar el
// resto del Panel NVR sin bifurcar por marca, pero el badge en estos NVR
// significa "asignado", no "conectado ahora".
async function obtenerEstadoCanales(nvr) {
  const raw = await dahuaCgi(nvr, 'LogicDeviceManager.cgi', { action: 'getCameraAll' });
  const camaras = parseCamaras(raw);
  return Object.entries(camaras).map(([idx, cam]) => ({
    canal: Number(idx) + 1,
    online: (cam.Enable || 'false').toLowerCase() === 'true',
    ip: cam.deviceInfo?.Address || null,
    passwordEstado: null,
  }));
}

async function obtenerNombresCanales(nvr) {
  const raw = await dahuaCgi(nvr, 'LogicDeviceManager.cgi', { action: 'getCameraAll' });
  const camaras = parseCamaras(raw);
  return Object.entries(camaras).map(([idx, cam]) => ({
    canal: Number(idx) + 1,
    nombre: cam.videoInput?.Name || cam.deviceInfo?.Name || null,
  }));
}

// magicBox.cgi?action=getDeviceType -- una linea simple ("type=NVR4xxx...").
// No hay (todavia) un endpoint confirmado con firmware/numero de serie del
// NVR en si, asi que esos quedan en null.
async function obtenerInfoDispositivo(nvr) {
  const raw = await dahuaCgi(nvr, 'magicBox.cgi', { action: 'getDeviceType' });
  const kv = parseKV(raw);
  return { nombre: null, modelo: kv.type || null, firmware: null, numeroSerie: null };
}

module.exports = {
  obtenerInfoDispositivo,
  obtenerEstadoDiscos,
  obtenerEstadoCanales,
  obtenerNombresCanales,
};
