const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();

// Ubicacion de camaras (RF-04/RF-07): edificio, piso y area son tres
// catalogos globales independientes (ver 009_areas_globales.sql y
// 011_pisos_globales.sql) — un piso como "3er Piso" no pertenece a un
// edificio puntual, asi que se eligen como tres selects sueltos, no en
// cascada. Lectura abierta a cualquier rol autenticado (la necesita tambien
// la vista del mando medio para mostrar ubicacion); alta/edicion/borrado
// restringidos a Admin (ver panel CRUD en el frontend).

// Traduce una violacion de UNIQUE de SQLite a un 409 legible; cualquier otro
// error se relanza para que lo capture el manejador global (500).
function siEsConflictoUnico(res, err, mensaje) {
  if (/UNIQUE constraint failed/.test(err.message)) {
    res.status(409).json({ error: mensaje });
    return true;
  }
  throw err;
}

// GET /api/ubicaciones/edificios
router.get('/edificios', auth, (req, res) => {
  res.json(db.prepare(`
    SELECT e.*,
      (SELECT COUNT(*) FROM camaras c WHERE c.edificio_id = e.id) AS cantidad_camaras,
      (SELECT COUNT(*) FROM nvrs n WHERE n.edificio_id = e.id) AS cantidad_nvrs
    FROM edificios e ORDER BY e.nombre
  `).all());
});

// POST /api/ubicaciones/edificios — Admin/Avanzado
router.post('/edificios', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });

  const existente = db.prepare('SELECT * FROM edificios WHERE nombre = ?').get(nombre);
  if (existente) return res.status(200).json(existente);

  const { lastInsertRowid } = db.prepare('INSERT INTO edificios (nombre) VALUES (?)').run(nombre);
  res.status(201).json(db.prepare('SELECT * FROM edificios WHERE id = ?').get(lastInsertRowid));
});

// PUT /api/ubicaciones/edificios/:id — Admin/Avanzado
router.put('/edificios/:id', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
  if (!db.prepare('SELECT id FROM edificios WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'Edificio no encontrado' });
  }

  try {
    db.prepare('UPDATE edificios SET nombre = ? WHERE id = ?').run(nombre, req.params.id);
  } catch (err) {
    if (siEsConflictoUnico(res, err, 'Ya existe un edificio con ese nombre')) return;
  }
  res.json(db.prepare('SELECT * FROM edificios WHERE id = ?').get(req.params.id));
});

// DELETE /api/ubicaciones/edificios/:id — Admin. Bloqueado si tiene camaras
// o NVRs asociados.
router.delete('/edificios/:id', auth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM edificios WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Edificio no encontrado' });
  }

  const { camaras } = db.prepare('SELECT COUNT(*) AS camaras FROM camaras WHERE edificio_id = ?').get(id);
  const { nvrs } = db.prepare('SELECT COUNT(*) AS nvrs FROM nvrs WHERE edificio_id = ?').get(id);
  if (camaras > 0 || nvrs > 0) {
    return res.status(409).json({ error: `No se puede borrar: tiene ${camaras} camara(s) y ${nvrs} NVR(s) asociados.` });
  }

  db.prepare('DELETE FROM edificios WHERE id = ?').run(id);
  res.status(204).end();
});

// GET /api/ubicaciones/pisos — catalogo global (ver 011_pisos_globales.sql):
// un piso no pertenece a un edificio puntual, la misma fila "3er Piso" vale
// para cualquiera.
router.get('/pisos', auth, (req, res) => {
  res.json(db.prepare(`
    SELECT p.*,
      (SELECT COUNT(*) FROM camaras c WHERE c.piso_id = p.id) AS cantidad_camaras,
      (SELECT COUNT(*) FROM nvrs n WHERE n.piso_id = p.id) AS cantidad_nvrs
    FROM pisos p ORDER BY p.orden, p.nombre
  `).all());
});

// POST /api/ubicaciones/pisos — Admin. Piso global: una vez creado queda
// disponible para elegir en la camara de cualquier edificio.
router.post('/pisos', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });

  const existente = db.prepare('SELECT * FROM pisos WHERE nombre = ?').get(nombre);
  if (existente) return res.status(200).json(existente);

  const { siguienteOrden } = db.prepare('SELECT COALESCE(MAX(orden), -1) + 1 AS siguienteOrden FROM pisos').get();
  const { lastInsertRowid } = db.prepare('INSERT INTO pisos (nombre, orden) VALUES (?, ?)').run(nombre, siguienteOrden);
  res.status(201).json(db.prepare('SELECT * FROM pisos WHERE id = ?').get(lastInsertRowid));
});

// PUT /api/ubicaciones/pisos/:id — Admin/Avanzado
router.put('/pisos/:id', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
  if (!db.prepare('SELECT id FROM pisos WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'Piso no encontrado' });
  }

  try {
    db.prepare('UPDATE pisos SET nombre = ? WHERE id = ?').run(nombre, req.params.id);
  } catch (err) {
    if (siEsConflictoUnico(res, err, 'Ya existe un piso con ese nombre')) return;
  }
  res.json(db.prepare('SELECT * FROM pisos WHERE id = ?').get(req.params.id));
});

// DELETE /api/ubicaciones/pisos/:id — Admin. Bloqueado si tiene camaras o NVRs asociados.
router.delete('/pisos/:id', auth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM pisos WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Piso no encontrado' });
  }

  const { camaras } = db.prepare('SELECT COUNT(*) AS camaras FROM camaras WHERE piso_id = ?').get(id);
  const { nvrs } = db.prepare('SELECT COUNT(*) AS nvrs FROM nvrs WHERE piso_id = ?').get(id);
  if (camaras > 0 || nvrs > 0) {
    return res.status(409).json({ error: `No se puede borrar: tiene ${camaras} camara(s) y ${nvrs} NVR(s) asociados.` });
  }

  db.prepare('DELETE FROM pisos WHERE id = ?').run(id);
  res.status(204).end();
});

// GET /api/ubicaciones/areas — catalogo global (RF-04): no depende de
// edificio ni piso, la misma area vale para cualquiera.
router.get('/areas', auth, (req, res) => {
  res.json(db.prepare(`
    SELECT a.*, (SELECT COUNT(*) FROM camaras c WHERE c.area_id = a.id) AS cantidad_camaras
    FROM areas a ORDER BY a.nombre
  `).all());
});

// POST /api/ubicaciones/areas — Admin. Area global: una vez creada queda
// disponible para elegir en la camara de cualquier edificio y piso.
router.post('/areas', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });

  const existente = db.prepare('SELECT * FROM areas WHERE nombre = ?').get(nombre);
  if (existente) return res.status(200).json(existente);

  const { lastInsertRowid } = db.prepare('INSERT INTO areas (nombre) VALUES (?)').run(nombre);
  res.status(201).json(db.prepare('SELECT * FROM areas WHERE id = ?').get(lastInsertRowid));
});

// PUT /api/ubicaciones/areas/:id — Admin/Avanzado
router.put('/areas/:id', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const { nombre } = req.body;
  if (!nombre) return res.status(400).json({ error: 'nombre es requerido' });
  if (!db.prepare('SELECT id FROM areas WHERE id = ?').get(req.params.id)) {
    return res.status(404).json({ error: 'Area no encontrada' });
  }

  try {
    db.prepare('UPDATE areas SET nombre = ? WHERE id = ?').run(nombre, req.params.id);
  } catch (err) {
    if (siEsConflictoUnico(res, err, 'Ya existe un area con ese nombre')) return;
  }
  res.json(db.prepare('SELECT * FROM areas WHERE id = ?').get(req.params.id));
});

// DELETE /api/ubicaciones/areas/:id — Admin. Bloqueado si alguna camara la usa.
router.delete('/areas/:id', auth, requireRole('admin'), (req, res) => {
  const { id } = req.params;
  if (!db.prepare('SELECT id FROM areas WHERE id = ?').get(id)) {
    return res.status(404).json({ error: 'Area no encontrada' });
  }

  const { camaras } = db.prepare('SELECT COUNT(*) AS camaras FROM camaras WHERE area_id = ?').get(id);
  if (camaras > 0) {
    return res.status(409).json({ error: `No se puede borrar: la usan ${camaras} camara(s).` });
  }

  db.prepare('DELETE FROM areas WHERE id = ?').run(id);
  res.status(204).end();
});

module.exports = router;
