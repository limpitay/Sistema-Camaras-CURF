const db = require('../db');
const isapiClient = require('./isapiClient');
const dahuaClient = require('./dahuaClient');

// Hikvision habla ISAPI, Dahua habla su propio CGI (ver dahuaClient.js) --
// mismo criterio que clienteDeNvr en routes/nvrs.js (compartido aca para que
// el scheduler de historial pueda usarlo sin importar la ruta).
function clienteDeNvr(nvr) {
  return /hikvision/i.test(nvr.marca || '') ? isapiClient : dahuaClient;
}

// Cache compartido del Panel NVR (migracion 029): lo que trae una consulta
// (manual o del scheduler) se guarda aca para que cualquier usuario que entre
// despues lo vea tal cual quedo, sin pegarle de nuevo al NVR.
function guardarEstadoSnapshot(nvrId, estado, actualizadoPor) {
  db.prepare(`
    INSERT INTO nvr_snapshots (nvr_id, estado_json, canales_json, actualizado_en, actualizado_por)
    VALUES (?, ?, 'null', ?, ?)
    ON CONFLICT (nvr_id) DO UPDATE SET estado_json = excluded.estado_json,
      actualizado_en = excluded.actualizado_en, actualizado_por = excluded.actualizado_por
  `).run(nvrId, JSON.stringify(estado), new Date().toISOString(), actualizadoPor || null);
}

function guardarCanalesSnapshot(nvrId, canales, actualizadoPor) {
  db.prepare(`
    INSERT INTO nvr_snapshots (nvr_id, estado_json, canales_json, actualizado_en, actualizado_por)
    VALUES (?, 'null', ?, ?, ?)
    ON CONFLICT (nvr_id) DO UPDATE SET canales_json = excluded.canales_json,
      actualizado_en = excluded.actualizado_en, actualizado_por = excluded.actualizado_por
  `).run(nvrId, JSON.stringify(canales), new Date().toISOString(), actualizadoPor || null);
}

// Panel NVR > Metricas (migracion 030): un punto por NVR por dia (hora
// Argentina, fija en UTC-3) con el espacio ocupado. Se pisa si ya habia un
// punto hoy -- varias corridas el mismo dia (manual + scheduler) no duplican,
// solo refrescan el valor.
function fechaArgentinaHoy() {
  return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

function guardarHistorialDiario(nvrId, estado) {
  const discos = estado?.discos || [];
  if (!discos.length) return;
  const capacidadMb = discos.reduce((a, d) => a + (d.capacidadMb || 0), 0);
  const libreMb = discos.reduce((a, d) => a + (d.libreMb || 0), 0);
  if (!capacidadMb) return;
  db.prepare(`
    INSERT INTO nvr_historial_diario (nvr_id, fecha, ocupado_gb, capacidad_gb)
    VALUES (?, ?, ?, ?)
    ON CONFLICT (nvr_id, fecha) DO UPDATE SET ocupado_gb = excluded.ocupado_gb, capacidad_gb = excluded.capacidad_gb
  `).run(nvrId, fechaArgentinaHoy(), (capacidadMb - libreMb) / 1024, capacidadMb / 1024);
}

// Consulta el estado (dispositivo + discos) de un NVR y guarda snapshot +
// punto de historial diario -- usado tanto por GET /:id/estado (disparado a
// mano) como por el scheduler de historial (automatico cada 24hs, ver
// historialScheduler.js).
async function capturarEstadoNvr(nvr, actualizadoPor) {
  const cliente = clienteDeNvr(nvr);
  const [dispositivo, discos] = await Promise.all([
    cliente.obtenerInfoDispositivo(nvr),
    cliente.obtenerEstadoDiscos(nvr),
  ]);
  const estado = { dispositivo, discos };
  guardarEstadoSnapshot(nvr.id, estado, actualizadoPor || null);
  guardarHistorialDiario(nvr.id, estado);
  return estado;
}

module.exports = {
  clienteDeNvr,
  guardarEstadoSnapshot,
  guardarCanalesSnapshot,
  guardarHistorialDiario,
  capturarEstadoNvr,
};
