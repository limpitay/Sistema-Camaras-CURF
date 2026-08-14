const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { notificar } = require('../utils/notificaciones');

const router = express.Router();

const CAMARAS_DE_SOLICITUD = `
  SELECT c.id, c.hostname, c.descripcion, c.observaciones, c.imagen_url,
    e.nombre AS edificio, p.nombre AS piso, a.nombre AS area,
    c.ip, c.usuario, c.contrasena, n.hostname AS nvr
  FROM solicitud_camaras sc
  JOIN camaras c ON c.id = sc.camara_id
  JOIN edificios e ON e.id = c.edificio_id
  JOIN pisos p ON p.id = c.piso_id
  JOIN areas a ON a.id = c.area_id
  LEFT JOIN nvrs n ON n.id = c.nvr_id
  WHERE sc.solicitud_id = ?
  ORDER BY e.nombre, p.nombre, a.nombre, c.hostname
`;

// Los datos de conexión (IP/usuario/contraseña) solo tienen sentido una vez
// que el mando medio ya tiene el acceso aprobado — para RF-08 (nunca antes:
// mismo criterio que en camaras.js, "el mando medio nunca recibe IP/MAC" se
// aplica hasta que efectivamente le corresponde poder entrar). Dirección/
// Admin/Sistemas-lectura los ven siempre (ya tienen acceso completo al
// inventario en otras pantallas).
function conCamaras(solicitud, incluirConexion) {
  const camaras = db.prepare(CAMARAS_DE_SOLICITUD).all(solicitud.id);
  if (!incluirConexion) {
    camaras.forEach((c) => { delete c.ip; delete c.usuario; delete c.contrasena; delete c.nvr; });
  }
  return { ...solicitud, camaras };
}

// POST /api/solicitudes — RF-10/RF-11/RF-12 (mando_medio): pide acceso a una
// o varias cámaras de una sola vez. A diferencia de un modelo por ítem, acá
// la solicitud se aprueba o rechaza como un todo (RF-13) — así quedó definida
// en el diagrama de datos: el estado vive en la cabecera `solicitudes`, y
// `solicitud_camaras` es una tabla puente sin estado propio.
router.post('/', auth, requireRole('mando_medio'), (req, res) => {
  const { camara_ids, comentario } = req.body;

  if (!Array.isArray(camara_ids) || camara_ids.length === 0) {
    return res.status(400).json({ error: 'camara_ids debe ser un array con al menos una cámara' });
  }

  const crear = db.transaction(() => {
    const placeholders = camara_ids.map(() => '?').join(',');

    // RF-12: no duplicar una solicitud pendiente ni pedir algo que ya se tiene
    // activo. `usuario_id` no vive en solicitud_camaras, así que esto se
    // valida acá (no hay forma de expresarlo como constraint de esta tabla).
    const conflictoPendiente = db.prepare(
      `SELECT sc.camara_id FROM solicitud_camaras sc
       JOIN solicitudes s ON s.id = sc.solicitud_id
       WHERE s.usuario_id = ? AND s.estado = 'pendiente' AND sc.camara_id IN (${placeholders})`
    ).all(req.user.id, ...camara_ids);

    const conflictoActivo = db.prepare(
      `SELECT camara_id FROM accesos_otorgados
       WHERE usuario_id = ? AND activo = 1 AND camara_id IN (${placeholders})`
    ).all(req.user.id, ...camara_ids);

    const conflictos = [...new Set([...conflictoPendiente, ...conflictoActivo].map((r) => r.camara_id))];
    if (conflictos.length > 0) {
      return { conflicto: true, camara_ids: conflictos };
    }

    const { lastInsertRowid } = db.prepare(
      'INSERT INTO solicitudes (usuario_id, comentario) VALUES (?, ?)'
    ).run(req.user.id, comentario || null);

    const insertarCamara = db.prepare('INSERT INTO solicitud_camaras (solicitud_id, camara_id) VALUES (?, ?)');
    for (const camaraId of camara_ids) insertarCamara.run(lastInsertRowid, camaraId);

    return { conflicto: false, solicitud: db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(lastInsertRowid) };
  })();

  if (crear.conflicto) {
    return res.status(409).json({
      error: 'Ya tenés una solicitud pendiente o un acceso activo para alguna de estas cámaras',
      camara_ids: crear.camara_ids,
    });
  }

  const solicitudConCamaras = conCamaras(crear.solicitud, false);

  // RF-24: nueva solicitud → notifica a Dirección y a destinatarios fijos.
  notificar('nueva_solicitud', { solicitud: solicitudConCamaras, solicitante: req.user });

  res.status(201).json(solicitudConCamaras);
});

// GET /api/solicitudes/mias — el propio mando medio consulta su historial
router.get('/mias', auth, requireRole('mando_medio'), (req, res) => {
  const solicitudes = db.prepare(
    'SELECT * FROM solicitudes WHERE usuario_id = ? ORDER BY fecha_solicitud DESC'
  ).all(req.user.id);
  res.json(solicitudes.map((s) => conCamaras(s, s.estado === 'aprobada')));
});

// GET /api/solicitudes — RF-13/RF-19 (Dirección, Admin, Sistemas-lectura):
// ?estado=pendiente filtra; sin filtro trae todo (historial completo).
router.get('/', auth, requireRole('direccion', 'admin', 'sistemas_lectura'), (req, res) => {
  const { estado } = req.query;
  const base = `SELECT s.*, u.nombre AS solicitante_nombre, u.email_institucional AS solicitante_email
                FROM solicitudes s JOIN usuarios u ON u.id = s.usuario_id`;

  const filas = estado
    ? db.prepare(`${base} WHERE s.estado = ? ORDER BY s.fecha_solicitud DESC`).all(estado)
    : db.prepare(`${base} ORDER BY s.fecha_solicitud DESC`).all();

  res.json(filas.map((s) => conCamaras(s, true)));
});

// Devuelve { ok:false } si la solicitud no existe o ya fue resuelta (evita
// doble resolución concurrente: el UPDATE con WHERE estado='pendiente' es
// atómico dentro de la transacción synchronous de better-sqlite3).
function resolverSolicitud(solicitudId, estado, resueltoPor) {
  const actualizada = db.prepare(
    `UPDATE solicitudes SET estado = ?, fecha_resolucion = datetime('now'), resuelto_por = ?
     WHERE id = ? AND estado = 'pendiente'`
  ).run(estado, resueltoPor, solicitudId);

  if (actualizada.changes === 0) return { ok: false };

  const solicitud = db.prepare('SELECT * FROM solicitudes WHERE id = ?').get(solicitudId);
  const accesos = [];

  if (estado === 'aprobada') {
    const camaraIds = db.prepare('SELECT camara_id FROM solicitud_camaras WHERE solicitud_id = ?')
      .all(solicitudId).map((r) => r.camara_id);

    for (const camaraId of camaraIds) {
      const yaActivo = db.prepare(
        'SELECT id FROM accesos_otorgados WHERE usuario_id = ? AND camara_id = ? AND activo = 1'
      ).get(solicitud.usuario_id, camaraId);
      if (yaActivo) continue; // ya tenía acceso activo por otra vía, no duplicar (RNF-07)

      const { lastInsertRowid } = db.prepare(
        'INSERT INTO accesos_otorgados (solicitud_id, usuario_id, camara_id, otorgado_por) VALUES (?, ?, ?, ?)'
      ).run(solicitudId, solicitud.usuario_id, camaraId, resueltoPor);
      accesos.push(db.prepare('SELECT * FROM accesos_otorgados WHERE id = ?').get(lastInsertRowid));
    }
  }

  return { ok: true, solicitud: conCamaras(solicitud, true), accesos };
}

// PATCH /api/solicitudes/:id — RF-13/RF-14 (Dirección): aprueba o rechaza la
// solicitud completa. Si se aprueba, nace ya mismo un acceso_otorgado por
// cada cámara incluida, con aplicado_en_hikcentral=0 (queda pendiente de que
// Sistemas lo cargue en HikCentral — ver 4.5).
router.patch('/:id', auth, requireRole('direccion'), (req, res) => {
  const { estado } = req.body;
  if (!['aprobada', 'rechazada'].includes(estado)) {
    return res.status(400).json({ error: 'estado debe ser aprobada o rechazada' });
  }

  const resultado = db.transaction(() => resolverSolicitud(req.params.id, estado, req.user.id))();
  if (!resultado.ok) {
    return res.status(409).json({ error: 'La solicitud no existe o ya fue resuelta' });
  }

  // RF-25: resolución de solicitud → notifica al solicitante, a Sistemas (si
  // fue aprobada, para que la aplique en HikCentral) y a destinatarios fijos.
  notificar('solicitud_resuelta', { solicitud: resultado.solicitud, resueltoPor: req.user });

  res.json(resultado.solicitud);
});

// POST /api/solicitudes/resolver-lote — RF-13 ("en lote"): resuelve varias
// solicitudes de una sola vez con el mismo estado.
router.post('/resolver-lote', auth, requireRole('direccion'), (req, res) => {
  const { solicitud_ids, estado } = req.body;

  if (!Array.isArray(solicitud_ids) || solicitud_ids.length === 0) {
    return res.status(400).json({ error: 'solicitud_ids debe ser un array con al menos una solicitud' });
  }
  if (!['aprobada', 'rechazada'].includes(estado)) {
    return res.status(400).json({ error: 'estado debe ser aprobada o rechazada' });
  }

  const resultados = db.transaction(
    () => solicitud_ids.map((id) => ({ id, ...resolverSolicitud(id, estado, req.user.id) }))
  )();

  for (const r of resultados) {
    if (r.ok) notificar('solicitud_resuelta', { solicitud: r.solicitud, resueltoPor: req.user });
  }

  res.json(resultados);
});

module.exports = router;
