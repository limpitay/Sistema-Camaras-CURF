const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { hashPassword } = require('../utils/passwords');

const router = express.Router();
const ROLES = ['admin', 'avanzado', 'sistemas_lectura', 'direccion', 'mando_medio'];
const PASSWORD_MIN = 8;

function boolificar(usuario) {
  const { password_hash, ...resto } = usuario;
  return { ...resto, activo: !!usuario.activo, tiene_password: !!password_hash };
}

// GET /api/usuarios — Admin y Sistemas-lectura ven el mismo padron (seccion 3)
router.get('/', auth, requireRole('admin', 'avanzado', 'sistemas_lectura'), (req, res) => {
  const usuarios = db.prepare(
    'SELECT id, username, nombre, rol, activo, password_hash, created_at FROM usuarios ORDER BY nombre'
  ).all();
  res.json(usuarios.map(boolificar));
});

// POST /api/usuarios — RF-01 (Admin): alta manual, previa al primer login.
// `username` es la unica identidad de login (columna COLLATE NOCASE UNIQUE,
// ver 001_usuarios.sql/023_username.sql) — puede ser un email real, para
// quien vaya a entrar por codigo/Google, o un nombre corto (ej. "llimpitay")
// para quien solo entre por contrasena. La contrasena es opcional aca — sin
// ella, el usuario sigue pudiendo entrar por codigo/Google si `username` es
// un email valido, y un admin se la puede asignar despues (PATCH /:id).
router.post('/', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const { username, nombre, rol, password } = req.body;

  if (!username || !nombre || !rol) {
    return res.status(400).json({ error: 'username, nombre y rol son requeridos' });
  }
  if (!ROLES.includes(rol)) {
    return res.status(400).json({ error: `rol invalido, debe ser uno de: ${ROLES.join(', ')}` });
  }
  if (password && password.length < PASSWORD_MIN) {
    return res.status(400).json({ error: `La contrasena debe tener al menos ${PASSWORD_MIN} caracteres` });
  }

  const usernameNormalizado = username.trim();
  const existente = db.prepare('SELECT id FROM usuarios WHERE username = ?').get(usernameNormalizado);
  if (existente) {
    return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario' });
  }

  const { lastInsertRowid } = db.prepare(
    'INSERT INTO usuarios (username, nombre, rol, password_hash) VALUES (?, ?, ?, ?)'
  ).run(usernameNormalizado, nombre, rol, password ? hashPassword(password) : null);

  const usuarioCreado = db.prepare(
    'SELECT id, username, nombre, rol, activo, password_hash FROM usuarios WHERE id = ?'
  ).get(lastInsertRowid);

  res.status(201).json(boolificar(usuarioCreado));
});

// PATCH /api/usuarios/:id — RF-03 (Admin): activar/desactivar, cambiar rol,
// nombre o username, y asignar/cambiar la contrasena de login (password
// vacio o ausente = no se toca; no hay forma de sacarle la contrasena a un
// usuario desde aca, solo desactivarlo). Siempre baja logica, nunca DELETE
// (RNF-06) — este usuario puede tener solicitudes y accesos historicos que
// no deben perder su autoria.
router.patch('/:id', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const { rol, activo, nombre, username, password } = req.body;

  if (rol && !ROLES.includes(rol)) {
    return res.status(400).json({ error: `rol invalido, debe ser uno de: ${ROLES.join(', ')}` });
  }
  if (username !== undefined && !username.trim()) {
    return res.status(400).json({ error: 'username no puede quedar vacio' });
  }
  if (password && password.length < PASSWORD_MIN) {
    return res.status(400).json({ error: `La contrasena debe tener al menos ${PASSWORD_MIN} caracteres` });
  }

  const actual = db.prepare('SELECT * FROM usuarios WHERE id = ?').get(req.params.id);
  if (!actual) return res.status(404).json({ error: 'Usuario no encontrado' });

  const usernameNormalizado = username === undefined ? actual.username : username.trim();
  if (usernameNormalizado !== actual.username) {
    const usernameExistente = db.prepare('SELECT id FROM usuarios WHERE username = ? AND id != ?').get(usernameNormalizado, req.params.id);
    if (usernameExistente) {
      return res.status(409).json({ error: 'Ya existe un usuario con ese nombre de usuario' });
    }
  }

  db.prepare('UPDATE usuarios SET rol = ?, activo = ?, nombre = ?, username = ?, password_hash = ? WHERE id = ?').run(
    rol || actual.rol,
    activo === undefined ? actual.activo : (activo ? 1 : 0),
    nombre?.trim() || actual.nombre,
    usernameNormalizado,
    password ? hashPassword(password) : actual.password_hash,
    req.params.id
  );

  const actualizado = db.prepare(
    'SELECT id, username, nombre, rol, activo, password_hash FROM usuarios WHERE id = ?'
  ).get(req.params.id);

  res.json(boolificar(actualizado));
});

module.exports = router;
