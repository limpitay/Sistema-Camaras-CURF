const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');

const router = express.Router();
const ROLES = ['admin', 'sistemas_lectura', 'direccion', 'mando_medio'];

function boolificar(usuario) {
  return { ...usuario, activo: !!usuario.activo };
}

// GET /api/usuarios — Admin y Sistemas-lectura ven el mismo padrón (sección 3)
router.get('/', auth, requireRole('admin', 'sistemas_lectura'), (req, res) => {
  const usuarios = db.prepare(
    'SELECT id, email_institucional, nombre, rol, activo, created_at FROM usuarios ORDER BY nombre'
  ).all();
  res.json(usuarios.map(boolificar));
});

// POST /api/usuarios — RF-01 (Admin): alta manual, previa al primer login
router.post('/', auth, requireRole('admin'), (req, res) => {
  const { email_institucional, nombre, rol } = req.body;

  if (!email_institucional || !nombre || !rol) {
    return res.status(400).json({ error: 'email_institucional, nombre y rol son requeridos' });
  }
  if (!ROLES.includes(rol)) {
    return res.status(400).json({ error: `rol inválido, debe ser uno de: ${ROLES.join(', ')}` });
  }

  const existente = db.prepare('SELECT id FROM usuarios WHERE email_institucional = ?').get(email_institucional);
  if (existente) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese email' });
  }

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO usuarios (email_institucional, nombre, rol) VALUES (?, ?, ?)'
  ).run(email_institucional, nombre, rol);

  const usuario = db.prepare(
    'SELECT id, email_institucional, nombre, rol, activo FROM usuarios WHERE id = ?'
  ).get(lastInsertRowid);

  res.status(201).json(boolificar(usuario));
});

// PATCH /api/usuarios/:id — RF-03 (Admin): activar/desactivar o cambiar rol.
// Siempre baja lógica, nunca DELETE (RNF-06) — este usuario puede tener
// solicitudes y accesos históricos que no deben perder su autoría.
router.patch('/:id', auth, requireRole('admin'), (req, res) => {
  const { rol, activo } = req.body;

  if (rol && !ROLES.includes(rol)) {
    return res.status(400).json({ error: `rol inválido, debe ser uno de: ${ROLES.join(', ')}` });
  }

  const actual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!actual) return res.status(404).json({ error: 'Usuario no encontrado' });

  db.prepare('UPDATE usuarios SET rol = ?, activo = ? WHERE id = ?').run(
    rol || actual.rol,
    activo === undefined ? actual.activo : (activo ? 1 : 0),
    req.params.id
  );

  const actualizado = db.prepare(
    'SELECT id, email_institucional, nombre, rol, activo FROM usuarios WHERE id = ?'
  ).get(req.params.id);

  res.json(boolificar(actualizado));
});

module.exports = router;
