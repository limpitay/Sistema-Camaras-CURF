const jwt = require('jsonwebtoken');

// Variante de auth.js solo para /api/uploads/camaras — un <img src> de HTML
// no puede mandar el header Authorization, asi que estas fotos son la unica
// excepcion donde el token viaja por query string (?token=...). No usar este
// middleware en ninguna ruta de la API real: ahi el token siempre va por
// header, para no dejarlo pegado en logs de acceso ni en el historial del
// navegador de una URL que se pueda compartir.
module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1] || req.query.token;
  if (!token) return res.status(401).json({ error: 'Token requerido' });

  try {
    req.user = jwt.verify(token, process.env.JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Token invalido o expirado' });
  }
};
