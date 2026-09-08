const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const {
  obtenerInfoDispositivo, obtenerEstadoDiscos, obtenerEstadoCanales, obtenerNombresCanales, buscarGrabacionMasAntigua,
} = require('../utils/isapiClient');

const router = express.Router();

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

// GET /api/nvrs
router.get('/', auth, (req, res) => {
  const filas = db.prepare(`${SELECT_BASE} ORDER BY n.hostname`).all();
  res.json(filas.map((row) => seleccionarCampos(row, req.user.rol)));
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
    const [dispositivo, discos] = await Promise.all([obtenerInfoDispositivo(nvr), obtenerEstadoDiscos(nvr)]);
    res.json({ dispositivo, discos });
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

  let estadoPorCanal = new Map();
  try {
    estadoPorCanal = new Map((await obtenerEstadoCanales(nvr)).map((c) => [c.canal, c]));
  } catch (err) {
    return res.status(502).json({ error: `No se pudo consultar el estado de canales del NVR: ${err.message}` });
  }

  // Nombre configurado en HikCentral/el propio NVR (no en la base local) —
  // si falla no bloquea el resto, es un dato de mas, no critico como el
  // estado online/offline.
  let nombrePorCanal = new Map();
  try {
    nombrePorCanal = new Map((await obtenerNombresCanales(nvr)).map((c) => [c.canal, c.nombre]));
  } catch { /* seguimos sin nombre si falla */ }

  // Secuencial, no en paralelo: los NVR embebidos limitan cuantas sesiones
  // HTTP/ISAPI concurrentes aceptan, y bombardearlos con 16-32 pedidos a la
  // vez hace que empiecen a rechazar conexiones.
  const canales = [];
  for (let canal = 1; canal <= nvr.canales_totales; canal += 1) {
    const estado = estadoPorCanal.get(canal) || null;

    let grabacionMasAntigua = null;
    let error = null;
    try {
      grabacionMasAntigua = await buscarGrabacionMasAntigua(nvr, canal);
    } catch (err) {
      error = err.message;
    }
    const diasDisponibles = grabacionMasAntigua
      ? Math.floor((Date.now() - new Date(grabacionMasAntigua).getTime()) / 86400000)
      : null;

    canales.push({
      canal,
      camara: camarasPorCanal.get(canal) || (estado?.ip ? camarasPorIp.get(estado.ip) : null) || null,
      descripcion: nombrePorCanal.get(canal) || null,
      online: estado?.online ?? null,
      ip: estado?.ip ?? null,
      grabacionMasAntigua,
      diasDisponibles,
      error,
    });
  }

  res.json(canales);
});

module.exports = router;
