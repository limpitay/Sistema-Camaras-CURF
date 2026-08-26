const db = require('../db');

// RF-24/RF-25/RF-26: por ahora solo resuelve y loguea los destinatarios —
// falta conectar un proveedor de SMTP real (pendiente junto con las
// credenciales de Google OAuth, ver ESPECIFICACION.md seccion 9). La firma
// ya queda lista para que conectar el envio real no toque a quien la llama.
function destinatariosFijos() {
  return db.prepare('SELECT email FROM notificacion_destinatarios WHERE activo = 1').all().map((r) => r.email);
}

function notificar(evento, datos) {
  const destinatarios = destinatariosFijos();
  console.log(`[notificacion:${evento}] destinatarios=${destinatarios.join(',')}`, datos);
}

module.exports = { notificar };
