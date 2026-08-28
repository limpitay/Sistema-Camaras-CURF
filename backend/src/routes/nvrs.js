const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

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

// GET /api/nvrs
router.get('/', auth, (req, res) => {
  res.json(db.prepare(`${SELECT_BASE} ORDER BY n.hostname`).all());
});

// GET /api/nvrs/:id — incluye el detalle de las camaras asociadas
router.get('/:id', auth, (req, res) => {
  const nvr = db.prepare(`${SELECT_BASE} WHERE n.id = ?`).get(req.params.id);
  if (!nvr) return res.status(404).json({ error: 'NVR no encontrado' });

  const camaras = db.prepare(
    'SELECT id, hostname, descripcion, estado FROM camaras WHERE nvr_id = ? ORDER BY hostname'
  ).all(req.params.id);

  res.json({ ...nvr, camaras });
});

// POST /api/nvrs — Admin/Avanzado
router.post('/', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const { hostname, ip, mac_address, edificio_id, piso_id, marca, modelo, canales_totales } = req.body;
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
      'INSERT INTO nvrs (hostname, ip, mac_address, edificio_id, piso_id, marca, modelo, canales_totales) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
    ).run(hostname, ip || null, mac_address || null, edificio_id || null, piso_id || null, marca || null, modelo || null, canales_totales || null));
  } catch (err) {
    if (/UNIQUE constraint failed/.test(err.message)) {
      return res.status(409).json({ error: 'Ya existe un NVR con ese hostname' });
    }
    throw err;
  }

  res.status(201).json(db.prepare(`${SELECT_BASE} WHERE n.id = ?`).get(lastInsertRowid));
});

// PUT /api/nvrs/:id — Admin/Avanzado
router.put('/:id', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const actual = db.prepare('SELECT * FROM nvrs WHERE id = ?').get(req.params.id);
  if (!actual) return res.status(404).json({ error: 'NVR no encontrado' });

  const { hostname, ip, mac_address, edificio_id, piso_id, marca, modelo, canales_totales } = req.body;
  if (!hostname) return res.status(400).json({ error: 'hostname es requerido' });
  if (edificio_id && !db.prepare('SELECT id FROM edificios WHERE id = ?').get(edificio_id)) {
    return res.status(400).json({ error: 'edificio_id no existe' });
  }
  if (piso_id && !db.prepare('SELECT id FROM pisos WHERE id = ?').get(piso_id)) {
    return res.status(400).json({ error: 'piso_id no existe' });
  }

  try {
    db.prepare('UPDATE nvrs SET hostname = ?, ip = ?, mac_address = ?, edificio_id = ?, piso_id = ?, marca = ?, modelo = ?, canales_totales = ? WHERE id = ?')
      .run(hostname, ip || null, mac_address || null, edificio_id || null, piso_id || null, marca || null, modelo || null, canales_totales || null, req.params.id);
  } catch (err) {
    if (/UNIQUE constraint failed/.test(err.message)) {
      return res.status(409).json({ error: 'Ya existe un NVR con ese hostname' });
    }
    throw err;
  }

  res.json(db.prepare(`${SELECT_BASE} WHERE n.id = ?`).get(req.params.id));
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

module.exports = router;
