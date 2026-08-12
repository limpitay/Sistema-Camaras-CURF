const express = require('express');
const jwt = require('jsonwebtoken');
const rateLimit = require('express-rate-limit');
const { OAuth2Client } = require('google-auth-library');
const db = require('../db');
const auth = require('../middleware/auth');

const router = express.Router();

const googleClient = process.env.GOOGLE_CLIENT_ID
  ? new OAuth2Client(process.env.GOOGLE_CLIENT_ID)
  : null;

// Máximo 10 intentos de login cada 15 minutos por IP — mitiga fuerza bruta
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.' },
});

function emitirSesion(res, usuarioRow) {
  const token = jwt.sign(
    {
      id: usuarioRow.id,
      email: usuarioRow.email_institucional,
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
      email: usuarioRow.email_institucional,
      nombre: usuarioRow.nombre,
      rol: usuarioRow.rol,
    },
  });
}

function buscarUsuarioActivo(email) {
  return db.prepare('SELECT * FROM usuarios WHERE email_institucional = ? AND activo = 1').get(email) || null;
}

// POST /api/auth/google — RF-01/RF-02: Google confirma la identidad, pero la
// autorización para entrar al panel (existir como usuario activo) la decide
// esta tabla, no Google.
router.post('/google', loginLimiter, async (req, res) => {
  if (!googleClient) {
    return res.status(501).json({
      error: 'Login con Google no está configurado todavía (falta GOOGLE_CLIENT_ID). Usá /api/auth/dev-login mientras tanto.',
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
    return res.status(401).json({ error: 'Token de Google inválido' });
  }

  if (process.env.GOOGLE_HOSTED_DOMAIN && payload.hd !== process.env.GOOGLE_HOSTED_DOMAIN) {
    return res.status(403).json({ error: 'Cuenta fuera del dominio institucional' });
  }

  const usuario = buscarUsuarioActivo(payload.email);
  if (!usuario) {
    return res.status(403).json({ error: 'No tenés acceso a este sistema. Contactá a Sistemas.' });
  }

  return emitirSesion(res, usuario);
});

// POST /api/auth/dev-login — SOLO desarrollo. El email igual tiene que existir
// como usuario activo (RF-01/RF-02 siguen aplicando). Se apaga sola en
// producción pase lo que pase en ALLOW_DEV_LOGIN, para que un .env mal
// copiado no abra un bypass de autenticación en el hospital.
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
    return res.status(403).json({ error: 'Ese email no está registrado como usuario activo del panel' });
  }

  return emitirSesion(res, usuario);
});

// GET /api/auth/me
router.get('/me', auth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
