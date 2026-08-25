const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

const SELECT_BASE = `
  SELECT ao.*, u.nombre AS usuario_nombre, u.email_institucional,
         c.hostname, c.descripcion, e.nombre AS edificio, p.nombre AS piso, a.nombre AS area
  FROM accesos_otorgados ao
  JOIN usuarios u ON u.id = ao.usuario_id
  JOIN camaras c ON c.id = ao.camara_id
  JOIN edificios e ON e.id = c.edificio_id
  JOIN pisos p ON p.id = c.piso_id
  JOIN areas a ON a.id = c.area_id
`;

function boolificar(row) {
  return { ...row, activo: !!row.activo, aplicado_en_hikcentral: !!row.aplicado_en_hikcentral };
}

// GET /api/accesos — RF-17/RF-18/RF-19: vigentes o historial, por usuario o
// por cámara. Sin filtros trae todo (incluye revocados) para el historial completo.
router.get('/', auth, requireRole('direccion', 'admin', 'avanzado', 'sistemas_lectura'), (req, res) => {
  const { usuario_id, camara_id, activo } = req.query;
  const condiciones = [];
  const valores = [];

  if (usuario_id) { valores.push(usuario_id); condiciones.push('ao.usuario_id = ?'); }
  if (camara_id) { valores.push(camara_id); condiciones.push('ao.camara_id = ?'); }
  if (activo !== undefined) { valores.push(activo === 'true' ? 1 : 0); condiciones.push('ao.activo = ?'); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = db.prepare(`${SELECT_BASE} ${where} ORDER BY ao.fecha_otorgado DESC`).all(...valores);

  res.json(filas.map(boolificar));
});

// GET /api/accesos/pendientes-hikcentral — RF-16/RF-20/RF-21 (Admin, Sistemas-lectura)
// Cubre ambos sentidos: altas aprobadas sin aplicar, y bajas revocadas sin remover.
router.get('/pendientes-hikcentral', auth, requireRole('admin', 'avanzado', 'sistemas_lectura'), (req, res) => {
  const filas = db.prepare(
    `${SELECT_BASE}
     WHERE (ao.activo = 1 AND ao.aplicado_en_hikcentral = 0)
        OR (ao.activo = 0 AND ao.aplicado_en_hikcentral = 1)
     ORDER BY ao.fecha_otorgado`
  ).all();
  res.json(filas.map(boolificar));
});

// PATCH /api/accesos/:id/revocar — RF-16 (Dirección)
router.patch('/:id/revocar', auth, requireRole('direccion'), (req, res) => {
  const resultado = db.prepare(
    `UPDATE accesos_otorgados SET activo = 0, fecha_revocacion = datetime('now'), revocado_por = ?
     WHERE id = ? AND activo = 1`
  ).run(req.user.id, req.params.id);
  if (resultado.changes === 0) return res.status(409).json({ error: 'El acceso no existe o ya estaba revocado' });

  res.json(boolificar(db.prepare(`${SELECT_BASE} WHERE ao.id = ?`).get(req.params.id)));
});

// PATCH /api/accesos/:id/aplicar — RF-15/RF-22 (Admin): confirma que ya dio
// de alta el permiso real en HikCentral.
router.patch('/:id/aplicar', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const resultado = db.prepare(
    `UPDATE accesos_otorgados SET aplicado_en_hikcentral = 1, fecha_aplicado = datetime('now'), aplicado_por = ?
     WHERE id = ? AND activo = 1 AND aplicado_en_hikcentral = 0`
  ).run(req.user.id, req.params.id);
  if (resultado.changes === 0) return res.status(409).json({ error: 'El acceso no existe o no está pendiente de aplicar' });

  res.json(boolificar(db.prepare(`${SELECT_BASE} WHERE ao.id = ?`).get(req.params.id)));
});

// PATCH /api/accesos/:id/confirmar-baja — RF-22 (Admin): confirma que ya
// removió el permiso de HikCentral tras una revocación. El registro vuelve al
// estado activo=0/aplicado=0 ("nada pendiente" — ver tabla de estados en
// ESPECIFICACION.md 4.5).
router.patch('/:id/confirmar-baja', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const resultado = db.prepare(
    `UPDATE accesos_otorgados SET aplicado_en_hikcentral = 0, aplicado_por = ?
     WHERE id = ? AND activo = 0 AND aplicado_en_hikcentral = 1`
  ).run(req.user.id, req.params.id);
  if (resultado.changes === 0) return res.status(409).json({ error: 'El acceso no existe o no está pendiente de baja' });

  res.json(boolificar(db.prepare(`${SELECT_BASE} WHERE ao.id = ?`).get(req.params.id)));
});

module.exports = router;
