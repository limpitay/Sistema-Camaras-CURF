// Uso: requireRole('admin', 'direccion') — debe ir siempre despues de auth.js,
// que es quien completa req.user a partir del JWT.
module.exports = (...rolesPermitidos) => (req, res, next) => {
  if (!req.user || !rolesPermitidos.includes(req.user.rol)) {
    return res.status(403).json({ error: 'No tenes permiso para esta accion' });
  }
  next();
};
