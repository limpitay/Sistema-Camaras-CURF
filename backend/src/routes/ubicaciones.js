const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// Jerarquía edificio -> piso -> área que usa el alta de cámaras (RF-04) y los
// filtros de inventario (RF-07). Lectura abierta a cualquier rol autenticado
// (la necesita también la vista del mando medio para mostrar ubicación);
// alta restringida a Admin, igual que el resto del inventario.

// Todo edificio nuevo arranca con este set estándar de pisos (Subsuelo a 8vo
// piso) — es el mismo criterio de la migración 008_seed_edificios_y_pisos.sql,
// para que valga tanto para los edificios sembrados como para los que Admin
// cree después a mano.
const PISOS_ESTANDAR = [
  'Subsuelo', 'Planta Baja', '1er Piso', '2do Piso', '3er Piso',
  '4to Piso', '5to Piso', '6to Piso', '7mo Piso', '8vo Piso',
];

// GET /api/ubicaciones/edificios
router.get('/edificios', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM edificios ORDER BY nombre').all());
});

// POST /api/ubicaciones/edificios — Admin
router.post('/edificios', auth, requireRole('admin'), (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });

  const existente = db.prepare('SELECT * FROM edificios WHERE nombre = ?').get(nombre);
  if (existente) return res.status(200).json(existente);

  const crear = db.transaction(() => {
    const { lastInsertRowid } = db.prepare('INSERT INTO edificios (nombre) VALUES (?)').run(nombre);
    const insertarPiso = db.prepare('INSERT INTO pisos (edificio_id, nombre, orden) VALUES (?, ?, ?)');
    PISOS_ESTANDAR.forEach((nombrePiso, orden) => insertarPiso.run(lastInsertRowid, nombrePiso, orden));
    return lastInsertRowid;
  });

  const id = crear();
  res.status(201).json(db.prepare('SELECT * FROM edificios WHERE id = ?').get(id));
});

// GET /api/ubicaciones/pisos?edificio_id=
router.get('/pisos', auth, (req, res) => {
  const { edificio_id } = req.query;
  if (!edificio_id) return res.status(400).json({ error: 'edificio_id es requerido' });
  res.json(db.prepare('SELECT * FROM pisos WHERE edificio_id = ? ORDER BY orden').all(edificio_id));
});

// POST /api/ubicaciones/pisos — Admin. Para pisos fuera del set estándar (ej.
// "Terraza", "Anexo") — los edificios ya arrancan con Subsuelo..8vo Piso
// (ver PISOS_ESTANDAR), esto es solo para el caso excepcional.
router.post('/pisos', auth, requireRole('admin'), (req, res) => {
  const { edificio_id, nombre } = req.body;
  if (!edificio_id || !nombre) return res.status(400).json({ error: 'edificio_id y nombre son requeridos' });

  const existente = db.prepare('SELECT * FROM pisos WHERE edificio_id = ? AND nombre = ?').get(edificio_id, nombre);
  if (existente) return res.status(200).json(existente);

  // Los pisos manuales van siempre al final del listado, después de los estándar.
  const { siguienteOrden } = db.prepare('SELECT COALESCE(MAX(orden), -1) + 1 AS siguienteOrden FROM pisos WHERE edificio_id = ?').get(edificio_id);
  const { lastInsertRowid } = db.prepare('INSERT INTO pisos (edificio_id, nombre, orden) VALUES (?, ?, ?)').run(edificio_id, nombre, siguienteOrden);
  res.status(201).json(db.prepare('SELECT * FROM pisos WHERE id = ?').get(lastInsertRowid));
});

// GET /api/ubicaciones/areas?piso_id=
router.get('/areas', auth, (req, res) => {
  const { piso_id } = req.query;
  if (!piso_id) return res.status(400).json({ error: 'piso_id es requerido' });
  res.json(db.prepare('SELECT * FROM areas WHERE piso_id = ? ORDER BY nombre').all(piso_id));
});

// POST /api/ubicaciones/areas — Admin
router.post('/areas', auth, requireRole('admin'), (req, res) => {
  const { piso_id, nombre } = req.body;
  if (!piso_id || !nombre) return res.status(400).json({ error: 'piso_id y nombre son requeridos' });

  const existente = db.prepare('SELECT * FROM areas WHERE piso_id = ? AND nombre = ?').get(piso_id, nombre);
  if (existente) return res.status(200).json(existente);

  const { lastInsertRowid } = db.prepare('INSERT INTO areas (piso_id, nombre) VALUES (?, ?)').run(piso_id, nombre);
  res.status(201).json(db.prepare('SELECT * FROM areas WHERE id = ?').get(lastInsertRowid));
});

module.exports = router;
