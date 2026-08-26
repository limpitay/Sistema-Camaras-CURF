const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const auth = require('../middleware/auth');
const { enviarCodigoAcceso } = require('../mailer');
const { verifyPassword } = require('../utils/passwords');

const router = express.Router();

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

// Maximo 10 intentos de login cada 15 minutos por IP — mitiga fuerza bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesion. Proba de nuevo en unos minutos.' },
});

// Mas restrictivo que loginLimiter: cada pedido de codigo manda un email de
// verdad (o llena el log), asi que se limita aparte para no poder spamear.
const codigoLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados pedidos de codigo. Proba de nuevo en unos minutos.' },
});

const CODIGO_VIGENCIA_MIN = 10;

function hashCodigo(email, codigo) {
  return crypto.createHash('sha256').update(`${email.toLowerCase()}:${codigo}`).digest('hex');
}

function emitirSesion(res, usuarioRow) {
  const token = jwt.sign(
    {
      id: usuarioRow.id,
      username: usuarioRow.username,
      nombre: usuarioRow.nombre,
      rol: usuarioRow.rol,
    },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES }
  );

  return res.json({
    token,
    user: {
      id: usuarioRow.id,
      username: usuarioRow.username,
      nombre: usuarioRow.nombre,
      rol: usuarioRow.rol,
    },
  });
}

// `username` es una sola columna para toda forma de identificarse (COLLATE
// NOCASE a nivel de tabla, ver 001_usuarios.sql — no hace falta lowercasear
// aca). Para codigo-por-email y Google, quien la cargo tiene que haber puesto
// ahi un email real; para login por contrasena puede ser cualquier nombre
// corto (ej. "llimpitay") — el mismo campo sirve para los dos casos.
function buscarUsuarioActivo(username) {
  return db.prepare('SELECT * FROM usuarios WHERE username = ? AND activo = 1').get(username) || null;
}

// POST /api/auth/google — RF-01/RF-02: Google confirma la identidad, pero la
// autorizacion para entrar al panel (existir como usuario activo) la decide
// esta tabla, no Google.
router.post('/google', loginLimiter, async (req, res) => {
  if (!googleClient) {
    return res.status(501).json({
      error: 'Login con Google no esta configurado todavia (falta GOOGLE_CLIENT_ID). Usa /api/auth/dev-login mientras tanto.',
    });
  }

  const { id_token } = req.body;
  if (!id_token) {
    return res.status(400).json({ error: 'id_token requerido' });
  }

  let payload;
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: id_token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    payload = ticket.getPayload();
  } catch (err) {
    console.error('Error verificando token de Google:', err);
    return res.status(401).json({ error: 'Token de Google invalido' });
  }

  if (process.env.GOOGLE_HOSTED_DOMAIN && payload.hd !== process.env.GOOGLE_HOSTED_DOMAIN) {
    return res.status(403).json({ error: 'Cuenta fuera del dominio institucional' });
  }

  const usuario = buscarUsuarioActivo(payload.email);
  if (!usuario) {
    return res.status(403).json({ error: 'No tenes acceso a este sistema. Contacta a Sistemas.' });
  }

  return emitirSesion(res, usuario);
});

// POST /api/auth/login — username (ej. "llimpitay") + contrasena. Alternativa
// a Google/codigo para quien tenga contrasena asignada (ver POST/PATCH
// /api/usuarios) — nadie la tiene por defecto, sigue siendo alta manual.
router.post('/login', loginLimiter, (req, res) => {
  const { usuario: nombreUsuario, password } = req.body;
  if (!nombreUsuario || !password) {
    return res.status(400).json({ error: 'usuario y password son requeridos' });
  }

  const usuario = buscarUsuarioActivo(nombreUsuario.trim());
  if (!usuario) {
    return res.status(403).json({ error: 'Ese usuario no esta registrado o no tiene login por contrasena habilitado' });
  }
  if (!usuario.password_hash) {
    return res.status(401).json({ error: 'Este usuario no tiene contrasena configurada. Usa otro metodo de login o pedile a un administrador que te asigne una.' });
  }
  if (!verifyPassword(password, usuario.password_hash)) {
    return res.status(401).json({ error: 'Contrasena incorrecta' });
  }

  return emitirSesion(res, usuario);
});

// POST /api/auth/dev-login — SOLO desarrollo. El email igual tiene que existir
// como usuario activo (RF-01/RF-02 siguen aplicando). Se apaga sola en
// produccion pase lo que pase en ALLOW_DEV_LOGIN, para que un .env mal
// copiado no abra un bypass de autenticacion en el hospital.
router.post('/dev-login', loginLimiter, (req, res) => {
  if (process.env.NODE_ENV === 'production' || process.env.ALLOW_DEV_LOGIN !== 'true') {
    return res.status(404).end();
  }

  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: 'email requerido' });
  }

  const usuario = buscarUsuarioActivo(email);
  if (!usuario) {
    return res.status(403).json({ error: 'Ese email no esta registrado como usuario activo del panel' });
  }

  return emitirSesion(res, usuario);
});

// POST /api/auth/solicitar-codigo — RF-01/RF-02: login institucional propio,
// sin depender de que Google Workspace este configurado. El email tiene que
// existir como usuario activo, igual que en los otros metodos de login.
router.post('/solicitar-codigo', codigoLimiter, async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'email requerido' });

  const usuario = buscarUsuarioActivo(email);
  if (!usuario) {
    return res.status(403).json({ error: 'Ese email no esta registrado como usuario activo del panel' });
  }

  const codigo = String(crypto.randomInt(100000, 1000000));
  const expiraEn = new Date(Date.now() + CODIGO_VIGENCIA_MIN * 60 * 1000).toISOString();
  db.prepare('INSERT INTO codigos_acceso (email, codigo_hash, expira_en) VALUES (?, ?, ?)')
    .run(usuario.username, hashCodigo(usuario.username, codigo), expiraEn);

  try {
    await enviarCodigoAcceso(usuario.username, codigo);
  } catch (err) {
    console.error('Error enviando codigo de acceso:', err);
    return res.status(502).json({ error: 'No se pudo enviar el email con el codigo. Proba de nuevo.' });
  }

  res.json({ ok: true, vigenciaMinutos: CODIGO_VIGENCIA_MIN });
});

// POST /api/auth/verificar-codigo
router.post('/verificar-codigo', loginLimiter, (req, res) => {
  const { email, codigo } = req.body;
  if (!email || !codigo) return res.status(400).json({ error: 'email y codigo son requeridos' });

  const usuario = buscarUsuarioActivo(email);
  if (!usuario) return res.status(403).json({ error: 'Ese email no esta registrado como usuario activo del panel' });

  const fila = db.prepare(`
    SELECT * FROM codigos_acceso
    WHERE email = ? AND usado = 0 AND expira_en > datetime('now')
    ORDER BY id DESC LIMIT 1
  `).get(usuario.username);

  if (!fila || fila.codigo_hash !== hashCodigo(usuario.username, codigo)) {
    return res.status(401).json({ error: 'Codigo invalido o vencido' });
  }

  db.prepare('UPDATE codigos_acceso SET usado = 1 WHERE id = ?').run(fila.id);

  return emitirSesion(res, usuario);
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
