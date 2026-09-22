// Recursos > Camaras (hostname/ip) vs. lo que reportan en vivo los NVR
// Hikvision por ISAPI -- logica pura, sin I/O, para poder testearla sin
// pegarle a un NVR real (ver sincronizarIps.test.js). El I/O (consultar cada
// NVR, leer/escribir la tabla camaras) vive en routes/nvrs.js.
//
// Dos formas de encontrar que fila de "camaras" corresponde a que canal en
// vivo, en orden de confianza:
//   1) Por POSICION (camara.nvr_id + camara.canal): el NVR es la fuente de
//      verdad de esa posicion, asi que si matchea por ahi se sincroniza
//      hostname Y ip con lo que reporta.
//   2) Por NOMBRE (fallback, cuando el canal todavia no esta cargado a mano
//      en el inventario): el nombre ES la clave para encontrar la fila, asi
//      que ahi solo se puede confiar en corregir ip/nvr_id/canal -- el
//      hostname no puede "corregirse" contra si mismo. Si el mismo nombre
//      aparece en mas de un canal en vivo, es ambiguo y no se toca nada.
function normalizarNombreCanal(nombre) {
  return (nombre || '').trim().toUpperCase();
}

// canalesEnVivo: [{ nvrId, nvr, canal, ip, nombre }] ya aplanado entre todos
// los NVR Hikvision consultados (nombre puede venir null si el canal esta
// vacio). camaras: filas de la tabla `camaras` con marca='Hikvision'
// (id, hostname, descripcion, ip, nvr_id, canal).
function calcularSincronizacion({ canalesEnVivo, camaras }) {
  const porPosicion = new Map();
  const ocurrenciasPorNombre = new Map();

  for (const c of canalesEnVivo) {
    if (!c.ip) continue;
    porPosicion.set(`${c.nvrId}:${c.canal}`, c);
    const nombreNorm = normalizarNombreCanal(c.nombre);
    if (!nombreNorm) continue;
    const lista = ocurrenciasPorNombre.get(nombreNorm) || [];
    lista.push(c);
    ocurrenciasPorNombre.set(nombreNorm, lista);
  }

  const actualizar = [];
  const ambiguos = [];
  const nombresYaListados = new Set();
  let sinCambios = 0;

  for (const camara of camaras) {
    let match = null;
    let matchPor = null;

    if (camara.nvr_id != null && camara.canal != null) {
      const porPos = porPosicion.get(`${camara.nvr_id}:${camara.canal}`);
      if (porPos) { match = porPos; matchPor = 'canal'; }
    }

    if (!match) {
      const nombreNorm = normalizarNombreCanal(camara.hostname);
      if (!nombreNorm) continue;
      const lista = ocurrenciasPorNombre.get(nombreNorm) || [];
      if (lista.length > 1) {
        if (!nombresYaListados.has(nombreNorm)) {
          nombresYaListados.add(nombreNorm);
          ambiguos.push({
            hostname: nombreNorm,
            ocurrencias: lista.map((o) => ({ nvr: o.nvr, canal: o.canal, ip: o.ip })),
          });
        }
        continue;
      }
      if (lista.length === 1) { match = lista[0]; matchPor = 'nombre'; }
    }

    if (!match) continue;

    const hostnameNuevo = (matchPor === 'canal' ? match.nombre?.trim() : null) || camara.hostname;
    const sinCambiosFila = camara.ip === match.ip
      && camara.nvr_id === match.nvrId
      && camara.canal === match.canal
      && normalizarNombreCanal(hostnameNuevo) === normalizarNombreCanal(camara.hostname);

    if (sinCambiosFila) { sinCambios += 1; continue; }

    actualizar.push({
      camaraId: camara.id,
      hostname: camara.hostname,
      hostnameNuevo,
      descripcion: camara.descripcion,
      ipActual: camara.ip,
      ipNueva: match.ip,
      nvr: match.nvr,
      nvrIdNuevo: match.nvrId,
      canal: match.canal,
      matchPor,
    });
  }

  return { actualizar, ambiguos, sinCambios };
}

module.exports = { normalizarNombreCanal, calcularSincronizacion };
