// Hasheo de contrasenas con scrypt (modulo crypto nativo de Node) en vez de
// bcrypt/argon2 — evita sumar una dependencia nueva (y su binario nativo)
// solo para esto, mismo criterio que el resto del proyecto.
const crypto = require('crypto');

const KEYLEN = 64;

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, KEYLEN).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;

  const hashBuffer = Buffer.from(hash, 'hex');
  const intentoBuffer = crypto.scryptSync(password, salt, KEYLEN);
  return hashBuffer.length === intentoBuffer.length && crypto.timingSafeEqual(hashBuffer, intentoBuffer);
}

module.exports = { hashPassword, verifyPassword };
