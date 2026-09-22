const db = require('../db');
const { capturarEstadoNvr } = require('./historialNvr');

// Panel NVR > Metricas: antes el historial (nvr_historial_diario) solo
// sumaba un punto cuando alguien entraba al panel y apretaba "Actualizar" --
// si nadie lo hacia un dia, ese dia quedaba sin dato. Este scheduler corre
// una vez cada 24hs (de madrugada, hora Argentina, fuera del horario de uso)
// y consulta cada NVR el solo, secuencial -- mismo patron ya usado por
// "Actualizar todo" en el frontend, asi que no suma carga nueva sobre los
// equipos embebidos, solo la mueve a un horario fijo y la hace no depender
// de que un humano entre a la pantalla.
const HORA_ARG = 3; // 3am ARG (UTC-3)
const UN_DIA_MS = 24 * 60 * 60 * 1000;

function msHastaProximaCorrida() {
  const ahora = new Date();
  const offsetMs = 3 * 60 * 60 * 1000;
  const argAhora = new Date(ahora.getTime() - offsetMs);
  const proximaEnArg = new Date(Date.UTC(
    argAhora.getUTCFullYear(), argAhora.getUTCMonth(), argAhora.getUTCDate(), HORA_ARG, 0, 0, 0
  ));
  let proximaReal = new Date(proximaEnArg.getTime() + offsetMs);
  if (proximaReal <= ahora) proximaReal = new Date(proximaReal.getTime() + UN_DIA_MS);
  return proximaReal.getTime() - ahora.getTime();
}

async function capturarTodosLosNvr() {
  const nvrs = db.prepare(
    'SELECT * FROM nvrs WHERE ip IS NOT NULL AND usuario IS NOT NULL AND contrasena IS NOT NULL'
  ).all();
  for (const nvr of nvrs) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await capturarEstadoNvr(nvr, 'Automatico (24hs)');
    } catch (err) {
      console.error(`[historial-nvr] No se pudo consultar ${nvr.hostname}: ${err.message}`);
    }
  }
}

function iniciarSchedulerHistorial() {
  const correrYReprogramar = async () => {
    await capturarTodosLosNvr();
    setTimeout(correrYReprogramar, UN_DIA_MS).unref();
  };
  setTimeout(correrYReprogramar, msHastaProximaCorrida()).unref();
}

module.exports = { iniciarSchedulerHistorial };
