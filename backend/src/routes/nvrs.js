const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { listarCamarasArtemis } = require('../utils/artemisClient');
const isapiClient = require('../utils/isapiClient');
const { calcularSincronizacion } = require('../utils/sincronizarIps');
const {
  clienteDeNvr,
  guardarCanalesSnapshot,
  capturarEstadoNvr,
} = require('../utils/historialNvr');

const router = express.Router();

// clienteDeNvr (Hikvision/ISAPI vs Dahua/CGI), guardarEstadoSnapshot,
// guardarCanalesSnapshot, guardarHistorialDiario y capturarEstadoNvr viven en
// utils/historialNvr.js -- compartidos con el scheduler automatico de
// historial (ver historialScheduler.js) para no duplicar esa logica entre
// la ruta disparada a mano y la corrida cada 24hs.

// Un NVR agrupa muchas camaras (RF-04): cantidad_camaras se calcula al
// vuelo aca, no se guarda como columna, para que nunca quede desactualizada.
const SELECT_BASE = `
  SELECT n.*, e.nombre AS edificio, p.nombre AS piso,
    (SELECT COUNT(*) FROM camaras c WHERE c.nvr_id = n.id) AS cantidad_camaras
  FROM nvrs n
  LEFT JOIN edificios e ON e.id = n.edificio_id
  LEFT JOIN pisos p ON p.id = n.piso_id
`;

// usuario/contrasena son el login ISAPI del propio NVR (migracion 028) — no
// tienen por que llegar a mando_medio/direccion, que hoy no tienen pantalla
// que los use pero si pueden pegarle a este endpoint directo con su sesion.
// Mismo criterio que CAMPOS_MANDO_MEDIO en camaras.js.
function ocultarCredenciales(row) {
  // eslint-disable-next-line no-unused-vars
  const { usuario, contrasena, ...resto } = row;
  return resto;
}

function seleccionarCampos(row, rol) {
  return ['admin', 'avanzado', 'sistemas_lectura'].includes(rol) ? row : ocultarCredenciales(row);
}

// GB/dia estimado a partir del bitrate maximo CONFIGURADO del stream
// principal (ISAPI Streaming/channels) -- no es trafico medido byte a byte,
// que el NVR no expone por API, pero es un valor real del equipo (no
// inventado) y sirve para proyectar consumo/retencion en el Panel NVR.
function gbDiaDesdeBitrate(bitrateMaxKbps) {
  if (!bitrateMaxKbps) return null;
  return (bitrateMaxKbps * 1000 / 8 * 86400) / 1e9;
}

// GET /api/nvrs
router.get('/', auth, (req, res) => {
  const filas = db.prepare(`${SELECT_BASE} ORDER BY n.hostname`).all();
  res.json(filas.map((row) => seleccionarCampos(row, req.user.rol)));
});

// El nombre "de verdad" (curado, el que se ve en HikCentral > Dispositivo >
// Camara > Nombre) no vive en el NVR -- HikCentral lo devuelve como
// "<nombre curado> (<hostname crudo>)", asi que se cruza por ese hostname
// crudo entre parentesis contra el nombre que da el NVR por ISAPI. Si
// Artemis no esta configurado o falla, se sigue con el nombre crudo nomas.
async function obtenerDescripcionPorHostname() {
  try {
    const camarasArtemis = await listarCamarasArtemis();
    return new Map(
      camarasArtemis
        .map((c) => [c.cameraName?.match(/\(([^)]+)\)\s*$/)?.[1], c.cameraName])
        .filter(([hostname]) => hostname)
    );
  } catch {
    return new Map();
  }
}

// GET /api/nvrs/camaras-en-vivo — Panel NVR: junta los canales de TODOS los
// NVR con login ISAPI cargado en una sola lista (hostname/IP/marca/estado en
// vivo), espejo liviano de Recursos > Camaras pero consultando el equipo
// real en vez del inventario local. Registrada antes de "/:id" a proposito
// -- si no, Express la matchearia como si "camaras-en-vivo" fuera un :id.
router.get('/camaras-en-vivo', auth, requireRole('admin', 'avanzado', 'sistemas_lectura'), async (req, res) => {
  const nvrs = db.prepare(
    'SELECT * FROM nvrs WHERE ip IS NOT NULL AND usuario IS NOT NULL AND contrasena IS NOT NULL AND canales_totales IS NOT NULL'
  ).all();

  const descripcionPorHostname = await obtenerDescripcionPorHostname();

  const camaras = [];
  const errores = [];
  // Secuencial entre NVR y entre canales: son equipos embebidos, bombardear
  // varios a la vez (o varios canales del mismo NVR) los hace rechazar
  // conexiones -- ver mismo criterio en /:id/canales.
  for (const nvr of nvrs) {
    const cliente = clienteDeNvr(nvr);
    let estadoPorCanal;
    try {
      estadoPorCanal = new Map((await cliente.obtenerEstadoCanales(nvr)).map((c) => [c.canal, c]));
    } catch (err) {
      errores.push(`${nvr.hostname}: ${err.message}`);
      continue;
    }
    let nombrePorCanal = new Map();
    try {
      nombrePorCanal = new Map((await cliente.obtenerNombresCanales(nvr)).map((c) => [c.canal, c.nombre]));
    } catch { /* seguimos sin nombre si falla */ }

    for (let canal = 1; canal <= nvr.canales_totales; canal += 1) {
      const estado = estadoPorCanal.get(canal) || null;
      const nombreCrudo = nombrePorCanal.get(canal) || null;
      camaras.push({
        nvrId: nvr.id,
        nvr: nvr.hostname,
        canal,
        hostname: nombreCrudo,
        ip: estado?.ip ?? null,
        marca: nvr.marca,
        online: estado?.online ?? null,
        descripcion: descripcionPorHostname.get(nombreCrudo) || nombreCrudo,
      });
    }
  }

  res.json({ camaras, errores, nvrsConsultados: nvrs.length });
});

// GET /api/nvrs/snapshots — Panel NVR: el cache compartido de cada NVR (ver
// nvr_snapshots / guardarEstadoSnapshot / guardarCanalesSnapshot), para
// pintar la pantalla al instante al entrar sin consultar ningun equipo real.
// Registrada antes de "/:id" por el mismo motivo que "/camaras-en-vivo".
router.get('/snapshots', auth, requireRole('admin', 'avanzado', 'sistemas_lectura'), (req, res) => {
  const filas = db.prepare('SELECT * FROM nvr_snapshots').all();
  const porNvr = {};
  for (const fila of filas) {
    porNvr[fila.nvr_id] = {
      estado: JSON.parse(fila.estado_json),
      canales: JSON.parse(fila.canales_json),
      actualizadoEn: fila.actualizado_en,
      actualizadoPor: fila.actualizado_por,
    };
  }
  res.json(porNvr);
});

// GET /api/nvrs/historial?dias=60 — Panel NVR > Metricas: la evolucion diaria
// de espacio ocupado de cada NVR (ver nvr_historial_diario), para el grafico
// de linea de tiempo. Tope de 60 dias (2 meses) para no dejar pedir todo el
// historico de una.
router.get('/historial', auth, requireRole('admin', 'avanzado', 'sistemas_lectura'), (req, res) => {
  const dias = Math.min(60, Math.max(1, parseInt(req.query.dias, 10) || 60));
  const filas = db.prepare(`
    SELECT nvr_id, fecha, ocupado_gb, capacidad_gb FROM nvr_historial_diario
    WHERE fecha >= date('now', ?)
    ORDER BY fecha ASC
  `).all(`-${dias} days`);

  const porNvr = {};
  for (const fila of filas) {
    (porNvr[fila.nvr_id] ||= []).push({ fecha: fila.fecha, ocupadoGb: fila.ocupado_gb, capacidadGb: fila.capacidad_gb });
  }
  res.json(porNvr);
});

// GET /api/nvrs/sincronizar-ips/preview — Recursos > Camaras: compara
// hostname/ip cargados a mano contra lo que reportan en vivo los NVR
// Hikvision (ISAPI). El I/O (consultar cada NVR) vive aca; el matcheo en si
// -- por posicion (nvr_id+canal) o, si no hay canal cargado, por nombre -- es
// logica pura en utils/sincronizarIps.js (testeada aparte). Solo lectura, no
// toca la base -- eso lo hace POST /sincronizar-ips/aplicar una vez que el
// admin confirma que hacer con cada fila.
router.get('/sincronizar-ips/preview', auth, requireRole('admin', 'avanzado'), async (req, res) => {
  const nvrs = db.prepare(
    "SELECT * FROM nvrs WHERE marca = 'Hikvision' AND ip IS NOT NULL AND usuario IS NOT NULL AND contrasena IS NOT NULL"
  ).all();

  const canalesEnVivo = [];
  const errores = [];

  // Secuencial entre NVR: mismo motivo que el resto del archivo (equipos
  // embebidos, pocas sesiones ISAPI concurrentes).
  for (const nvr of nvrs) {
    let estados;
    let nombres;
    try {
      // eslint-disable-next-line no-await-in-loop
      [estados, nombres] = await Promise.all([
        isapiClient.obtenerEstadoCanales(nvr),
        isapiClient.obtenerNombresCanales(nvr),
      ]);
    } catch (err) {
      errores.push(`${nvr.hostname}: ${err.message}`);
      continue;
    }
    const ipPorCanal = new Map(estados.map((c) => [c.canal, c.ip]));
    for (const { canal, nombre } of nombres) {
      canalesEnVivo.push({ nvrId: nvr.id, nvr: nvr.hostname, canal, ip: ipPorCanal.get(canal) || null, nombre });
    }
  }

  const camaras = db.prepare("SELECT id, hostname, descripcion, ip, nvr_id, canal FROM camaras WHERE marca = 'Hikvision'").all();
  const { actualizar, ambiguos, sinCambios } = calcularSincronizacion({ canalesEnVivo, camaras });

  res.json({ actualizar, ambiguos, sinCambios, errores });
});

// POST /api/nvrs/sincronizar-ips/aplicar — Admin. Aplica solo los cambios que
// el admin selecciono en la pantalla de preview (nunca se auto-aplica nada).
// Escribe hostname/ip/nvr_id/canal juntos -- son las 4 columnas que describen
// "que camara es y donde esta enchufada", todas sacadas del mismo canal en
// vivo que armo el preview.
router.post('/sincronizar-ips/aplicar', auth, requireRole('admin'), (req, res) => {
  const { cambios } = req.body;
  if (!Array.isArray(cambios) || cambios.length === 0) {
    return res.status(400).json({ error: 'cambios (array de {camaraId, hostname, ip, nvrIdNuevo, canal}) es requerido' });
  }

  const actualizar = db.prepare(
    "UPDATE camaras SET hostname = ?, ip = ?, nvr_id = ?, canal = ?, updated_at = datetime('now') WHERE id = ? AND marca = 'Hikvision'"
  );
  let aplicados = 0;
  const transaccion = db.transaction((filas) => {
    for (const { camaraId, hostname, ip, nvrIdNuevo, canal } of filas) {
      if (!camaraId || !hostname || !ip || !nvrIdNuevo || canal == null) continue;
      const resultado = actualizar.run(hostname, ip, nvrIdNuevo, canal, camaraId);
      if (resultado.changes > 0) aplicados += 1;
    }
  });
  transaccion(cambios);

  res.json({ aplicados });
});

// GET /api/nvrs/:id — incluye el detalle de las camaras asociadas
router.get('/:id', auth, (req, res) => {
  const nvr = db.prepare(`${SELECT_BASE} WHERE n.id = ?`).get(req.params.id);
  if (!nvr) return res.status(404).json({ error: 'NVR no encontrado' });

  const camaras = db.prepare(
    'SELECT id, hostname, descripcion, estado FROM camaras WHERE nvr_id = ? ORDER BY hostname'
  ).all(req.params.id);

  res.json({ ...seleccionarCampos(nvr, req.user.rol), camaras });
});

// POST /api/nvrs — Admin/Avanzado
router.post('/', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const { hostname, ip, mac_address, edificio_id, piso_id, marca, modelo, canales_totales, usuario, contrasena } = req.body;
  if (!hostname) return res.status(400).json({ error: 'hostname es requerido' });
  if (edificio_id && !db.prepare('SELECT id FROM edificios WHERE id = ?').get(edificio_id)) {
    return res.status(400).json({ error: 'edificio_id no existe' });
  }
  if (piso_id && !db.prepare('SELECT id FROM pisos WHERE id = ?').get(piso_id)) {
    return res.status(400).json({ error: 'piso_id no existe' });
  }

  let lastInsertRowid;
  try {
    ({ lastInsertRowid } = db.prepare(
      'INSERT INTO nvrs (hostname, ip, mac_address, edificio_id, piso_id, marca, modelo, canales_totales, usuario, contrasena) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(hostname, ip || null, mac_address || null, edificio_id || null, piso_id || null, marca || null, modelo || null, canales_totales || null, usuario || null, contrasena || null));
  } catch (err) {
    if (/UNIQUE constraint failed/.test(err.message)) {
      return res.status(409).json({ error: 'Ya existe un NVR con ese hostname' });
    }
    throw err;
  }

  res.status(201).json(seleccionarCampos(db.prepare(`${SELECT_BASE} WHERE n.id = ?`).get(lastInsertRowid), req.user.rol));
});

// PUT /api/nvrs/:id — Admin/Avanzado
router.put('/:id', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const actual = db.prepare('SELECT * FROM nvrs WHERE id = ?').get(req.params.id);
  if (!actual) return res.status(404).json({ error: 'NVR no encontrado' });

  const { hostname, ip, mac_address, edificio_id, piso_id, marca, modelo, canales_totales, usuario, contrasena } = req.body;
  if (!hostname) return res.status(400).json({ error: 'hostname es requerido' });
  if (edificio_id && !db.prepare('SELECT id FROM edificios WHERE id = ?').get(edificio_id)) {
    return res.status(400).json({ error: 'edificio_id no existe' });
  }
  if (piso_id && !db.prepare('SELECT id FROM pisos WHERE id = ?').get(piso_id)) {
    return res.status(400).json({ error: 'piso_id no existe' });
  }

  try {
    db.prepare(
      `UPDATE nvrs SET hostname = ?, ip = ?, mac_address = ?, edificio_id = ?, piso_id = ?, marca = ?, modelo = ?,
         canales_totales = ?, usuario = ?, contrasena = ? WHERE id = ?`
    ).run(
      hostname, ip || null, mac_address || null, edificio_id || null, piso_id || null, marca || null, modelo || null,
      canales_totales || null,
      usuario === undefined ? actual.usuario : (usuario || null),
      contrasena === undefined ? actual.contrasena : (contrasena || null),
      req.params.id
    );
  } catch (err) {
    if (/UNIQUE constraint failed/.test(err.message)) {
      return res.status(409).json({ error: 'Ya existe un NVR con ese hostname' });
    }
    throw err;
  }

  res.json(seleccionarCampos(db.prepare(`${SELECT_BASE} WHERE n.id = ?`).get(req.params.id), req.user.rol));
});

// DELETE /api/nvrs/:id — Admin. Bloqueado si tiene camaras asociadas (para no
// desvincularlas en silencio; ver mismo criterio en ubicaciones.js).
router.delete('/:id', auth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM nvrs WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'NVR no encontrado' });
  }

  const { camaras } = db.prepare('SELECT COUNT(*) AS camaras FROM camaras WHERE nvr_id = ?').get(id);
  if (camaras > 0) {
    return res.status(409).json({ error: `No se puede borrar: tiene ${camaras} camara(s) asociada(s).` });
  }

  db.prepare('DELETE FROM nvrs WHERE id = ?').run(id);
  res.status(204).end();
});

// GET /api/nvrs/:id/estado — Panel NVR (dashboard): info en vivo del
// dispositivo (ISAPI) + estado de sus discos. Solo Admin/Avanzado/lectura,
// que son quienes tienen acceso al panel NVR (ver App.jsx).
router.get('/:id/estado', auth, requireRole('admin', 'avanzado', 'sistemas_lectura'), async (req, res) => {
  const nvr = db.prepare('SELECT * FROM nvrs WHERE id = ?').get(req.params.id);
  if (!nvr) return res.status(404).json({ error: 'NVR no encontrado' });

  try {
    const estado = await capturarEstadoNvr(nvr, req.user.nombre);
    res.json(estado);
  } catch (err) {
    res.status(502).json({ error: `No se pudo consultar el NVR: ${err.message}` });
  }
});

// GET /api/nvrs/:id/canales — Panel NVR: por cada canal (1..canales_totales),
// que camara local tiene conectada (via camaras.canal), estado online/IP/
// password (un solo pedido para todos), resolucion/codec/bitrate real del
// stream principal, y la grabacion mas antigua (para estimar cuantos dias de
// historial quedan antes de que el NVR empiece a sobrescribir).
router.get('/:id/canales', auth, requireRole('admin', 'avanzado', 'sistemas_lectura'), async (req, res) => {
  const nvr = db.prepare('SELECT * FROM nvrs WHERE id = ?').get(req.params.id);
  if (!nvr) return res.status(404).json({ error: 'NVR no encontrado' });
  if (!nvr.canales_totales) {
    return res.status(400).json({ error: 'Este NVR no tiene "canales_totales" cargado (Recursos > NVR)' });
  }

  const camarasDelNvr = db.prepare('SELECT canal, ip, hostname, descripcion, estado FROM camaras WHERE nvr_id = ?').all(nvr.id);
  const camarasPorCanal = new Map(camarasDelNvr.filter((c) => c.canal != null).map((c) => [c.canal, c]));
  // Fallback por IP para cuando el campo `canal` todavia no se cargo a mano
  // en el inventario local -- ISAPI ya nos da la IP real conectada a cada
  // canal, asi que alcanza con que coincida con camaras.ip.
  const camarasPorIp = new Map(camarasDelNvr.filter((c) => c.ip).map((c) => [c.ip, c]));

  const cliente = clienteDeNvr(nvr);

  let estadoPorCanal = new Map();
  try {
    estadoPorCanal = new Map((await cliente.obtenerEstadoCanales(nvr)).map((c) => [c.canal, c]));
  } catch (err) {
    return res.status(502).json({ error: `No se pudo consultar el estado de canales del NVR: ${err.message}` });
  }

  // Nombre crudo que el NVR guarda por canal (normalmente el hostname que la
  // propia camara reporta, ej. "CAMONSS38") — si falla no bloquea el resto,
  // es un dato de mas, no critico como el estado online/offline.
  let nombrePorCanal = new Map();
  try {
    nombrePorCanal = new Map((await cliente.obtenerNombresCanales(nvr)).map((c) => [c.canal, c.nombre]));
  } catch { /* seguimos sin nombre si falla */ }

  const descripcionPorHostname = await obtenerDescripcionPorHostname();

  // Dahua trae el bitrate de TODOS los canales en un solo pedido -- se
  // busca una vez antes del loop (no adentro, que repetiria el mismo pedido
  // por cada canal). ISAPI no tiene bulk, sigue pidiendose canal por canal
  // mas abajo, dentro del loop.
  let videoPorCanal = null;
  if (cliente.obtenerParametrosVideoTodosCanales) {
    try {
      videoPorCanal = await cliente.obtenerParametrosVideoTodosCanales(nvr);
    } catch { /* dato de mas, no bloquea el resto */ }
  }

  // Secuencial, no en paralelo: los NVR embebidos limitan cuantas sesiones
  // HTTP/ISAPI concurrentes aceptan, y bombardearlos con 16-32 pedidos a la
  // vez hace que empiecen a rechazar conexiones.
  const canales = [];
  for (let canal = 1; canal <= nvr.canales_totales; canal += 1) {
    const estado = estadoPorCanal.get(canal) || null;

    let grabacionMasAntigua = null;
    let grabacionMasReciente = null;
    let error = null;
    // Busqueda de grabaciones: todavia solo esta diagnosticada para
    // Hikvision/ISAPI (ver dahuaClient.js) -- en Dahua estos campos quedan
    // en null hasta que se agregue el endpoint correspondiente.
    if (cliente.buscarGrabacionMasAntigua) {
      try {
        const busqueda = await cliente.buscarGrabacionMasAntigua(nvr, canal);
        grabacionMasAntigua = busqueda?.inicio || null;
        // Canal sin camara asignada: lo que haya grabado quedo fijo en el
        // tiempo (ver buscarGrabacionMasReciente) -- ahi interesa hasta cuando
        // llego esa grabacion vieja, no "hoy - mas antigua" (eso crece solo).
        if (busqueda && estado?.online == null) {
          grabacionMasReciente = busqueda.numOfMatches > 1
            ? await cliente.buscarGrabacionMasReciente(nvr, canal, busqueda.numOfMatches)
            : grabacionMasAntigua;
        }
      } catch (err) {
        error = err.message;
      }
    }
    const diasDisponibles = grabacionMasAntigua
      ? Math.floor((Date.now() - new Date(grabacionMasAntigua).getTime()) / 86400000)
      : null;
    const diasGrabados = (grabacionMasAntigua && grabacionMasReciente)
      ? Math.max(0, Math.round((new Date(grabacionMasReciente).getTime() - new Date(grabacionMasAntigua).getTime()) / 86400000))
      : null;

    // Bitrate solo para canales con camara conectada -- para los vacios no
    // hay stream que consultar. En Dahua ya se trajo todo junto arriba
    // (videoPorCanal); en Hikvision/ISAPI es un pedido mas por canal.
    let video = null;
    if (estado?.online) {
      if (videoPorCanal) {
        video = videoPorCanal.get(canal) || null;
      } else if (cliente.obtenerParametrosVideoCanal) {
        try {
          video = await cliente.obtenerParametrosVideoCanal(nvr, canal);
        } catch { /* dato de mas, no bloquea el resto */ }
      }
    }

    const nombreCrudo = nombrePorCanal.get(canal) || null;
    canales.push({
      canal,
      camara: camarasPorCanal.get(canal) || (estado?.ip ? camarasPorIp.get(estado.ip) : null) || null,
      descripcion: descripcionPorHostname.get(nombreCrudo) || nombreCrudo,
      online: estado?.online ?? null,
      ip: estado?.ip ?? null,
      grabacionMasAntigua,
      diasDisponibles,
      diasGrabados,
      video,
      gbDiaEstimado: gbDiaDesdeBitrate(video?.bitrateMaxKbps),
      error,
    });
  }

  guardarCanalesSnapshot(nvr.id, canales, req.user.nombre);
  res.json(canales);
});

module.exports = router;
