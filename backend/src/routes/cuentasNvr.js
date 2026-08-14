const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// Cuentas de NVR/HikCentral (vigilancia, sistemas, enfermeriaqx, etc.) y qué
// cámaras puede ver cada una — reflejan lo que ya está configurado en el
// equipo real, no pasan por el flujo de solicitudes de este panel.

const SELECT_CUENTA = `
  SELECT c.*, u.nombre AS usuario_nombre, u.email_institucional AS usuario_email,
    (SELECT COUNT(*) FROM accesos_nvr a WHERE a.cuenta_id = c.id) AS cantidad_camaras
  FROM cuentas_nvr c
  LEFT JOIN usuarios u ON u.id = c.usuario_id
`;

// GET /api/cuentas-nvr
router.get('/', auth, requireRole('admin', 'sistemas_lectura'), (req, res) => {
  res.json(db.prepare(`${SELECT_CUENTA} ORDER BY c.nombre`).all());
});

// GET /api/cuentas-nvr/:id — incluye el detalle de cámaras con permisos
router.get('/:id', auth, requireRole('admin', 'sistemas_lectura'), (req, res) => {
  const cuenta = db.prepare(`${SELECT_CUENTA} WHERE c.id = ?`).get(req.params.id);
  if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

  const camaras = db.prepare(`
    SELECT a.id AS acceso_id, a.grupo, a.en_vivo, a.reproduccion, a.estado AS acceso_estado,
      cam.id AS camara_id, cam.hostname, cam.descripcion, cam.observaciones, cam.imagen_url, cam.canal, cam.estado, cam.ip,
      e.nombre AS edificio, p.nombre AS piso, ar.nombre AS area
    FROM accesos_nvr a
    JOIN camaras cam ON cam.id = a.camara_id
    JOIN edificios e ON e.id = cam.edificio_id
    JOIN pisos p ON p.id = cam.piso_id
    JOIN areas ar ON ar.id = cam.area_id
    WHERE a.cuenta_id = ?
    ORDER BY e.nombre, p.nombre, cam.hostname
  `).all(req.params.id);

  res.json({
    ...cuenta,
    camaras: camaras.map((c) => ({ ...c, en_vivo: !!c.en_vivo, reproduccion: !!c.reproduccion })),
  });
});

// POST /api/cuentas-nvr — Admin
router.post('/', auth, requireRole('admin'), (req, res) => {
  const { nombre, usuario_id } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });

  const existente = db.prepare('SELECT * FROM cuentas_nvr WHERE nombre = ?').get(nombre);
  if (existente) return res.status(200).json(existente);

  const { lastInsertRowid } = db.prepare('INSERT INTO cuentas_nvr (nombre, usuario_id) VALUES (?, ?)').run(nombre, usuario_id || null);
  res.status(201).json(db.prepare(`${SELECT_CUENTA} WHERE c.id = ?`).get(lastInsertRowid));
});

// PUT /api/cuentas-nvr/:id — Admin
router.put('/:id', auth, requireRole('admin'), (req, res) => {
  const actual = db.prepare('SELECT * FROM cuentas_nvr WHERE id = ?').get(req.params.id);
  if (!actual) return res.status(404).json({ error: 'Cuenta no encontrada' });

  const { nombre, usuario_id } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });

  try {
    db.prepare('UPDATE cuentas_nvr SET nombre = ?, usuario_id = ? WHERE id = ?')
      .run(nombre, usuario_id === undefined ? actual.usuario_id : (usuario_id || null), req.params.id);
  } catch (err) {
    if (/UNIQUE constraint failed/.test(err.message)) {
      return res.status(409).json({ error: 'Ya existe una cuenta NVR con ese nombre' });
    }
    throw err;
  }
  res.json(db.prepare(`${SELECT_CUENTA} WHERE c.id = ?`).get(req.params.id));
});

// DELETE /api/cuentas-nvr/:id — Admin
router.delete('/:id', auth, requireRole('admin'), (req, res) => {
  if (!db.prepare('SELECT id FROM cuentas_nvr WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'Cuenta no encontrada' });
  }
  db.prepare('DELETE FROM cuentas_nvr WHERE id = ?').run(req.params.id);
  res.status(204).end();
});

// POST /api/cuentas-nvr/:id/accesos — Admin. Otorga (o actualiza) el acceso
// de esta cuenta a una cámara puntual. Un acceso nuevo arranca 'pendiente'
// (es el borrador propio del sistema, todavía sin aplicar en el NVR/HikCentral
// real); si ya existía, esta llamada solo actualiza grupo/en_vivo/reproduccion
// y NO toca el estado pendiente/concedido.
router.post('/:id/accesos', auth, requireRole('admin'), (req, res) => {
  const cuenta = db.prepare('SELECT id FROM cuentas_nvr WHERE id = ?').get(req.params.id);
  if (!cuenta) return res.status(404).json({ error: 'Cuenta no encontrada' });

  const { camara_id, grupo, en_vivo, reproduccion } = req.body;
  if (!camara_id) return res.status(400).json({ error: 'camara_id es requerido' });
  if (!db.prepare('SELECT id FROM camaras WHERE id = ?').get(camara_id)) {
    return res.status(400).json({ error: 'camara_id no existe' });
  }

  db.prepare(`
    INSERT INTO accesos_nvr (cuenta_id, camara_id, grupo, en_vivo, reproduccion, estado) VALUES (?, ?, ?, ?, ?, 'pendiente')
    ON CONFLICT (cuenta_id, camara_id) DO UPDATE SET grupo = excluded.grupo, en_vivo = excluded.en_vivo, reproduccion = excluded.reproduccion
  `).run(req.params.id, camara_id, grupo || null, en_vivo === false ? 0 : 1, reproduccion === false ? 0 : 1);

  res.status(201).json({ ok: true });
});

// PATCH /api/cuentas-nvr/:id/accesos/:accesoId — Admin. Togglea en_vivo/reproduccion
// y/o el estado pendiente/concedido (esto último es lo que se tilda a mano
// después de aplicar el permiso en el NVR/HikCentral real).
router.patch('/:id/accesos/:accesoId', auth, requireRole('admin'), (req, res) => {
  const acceso = db.prepare('SELECT * FROM accesos_nvr WHERE id = ? AND cuenta_id = ?').get(req.params.accesoId, req.params.id);
  if (!acceso) return res.status(404).json({ error: 'Acceso no encontrado' });

  const { en_vivo, reproduccion, estado } = req.body;
  if (estado !== undefined && !['pendiente', 'concedido'].includes(estado)) {
    return res.status(400).json({ error: "estado inválido, debe ser 'pendiente' o 'concedido'" });
  }
  db.prepare('UPDATE accesos_nvr SET en_vivo = ?, reproduccion = ?, estado = ? WHERE id = ?').run(
    en_vivo === undefined ? acceso.en_vivo : (en_vivo ? 1 : 0),
    reproduccion === undefined ? acceso.reproduccion : (reproduccion ? 1 : 0),
    estado === undefined ? acceso.estado : estado,
    req.params.accesoId
  );
  res.json({ ok: true });
});

// DELETE /api/cuentas-nvr/:id/accesos/:accesoId — Admin. Revoca el acceso a esa cámara.
router.delete('/:id/accesos/:accesoId', auth, requireRole('admin'), (req, res) => {
  const resultado = db.prepare('DELETE FROM accesos_nvr WHERE id = ? AND cuenta_id = ?').run(req.params.accesoId, req.params.id);
  if (resultado.changes === 0) return res.status(404).json({ error: 'Acceso no encontrado' });
  res.status(204).end();
});

module.exports = router;
