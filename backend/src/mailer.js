const nodemailer = require('nodemailer');

// Todavia no hay SMTP institucional armado (ver rama
// feature/acceso-lan-login-institucional). Sin SMTP_HOST configurado, el
// codigo se imprime en el log del contenedor en vez de mandarse por mail —
// asi se puede probar el flujo completo de login antes de tener el servidor
// de correo real. Cuando SMTP_HOST este seteado, esto empieza a mandar mails
// de verdad sin tocar nada mas del codigo.
const transporter = process.env.SMTP_HOST
  ? nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT) || 587,
      secure: process.env.SMTP_SECURE === 'true',
      auth: process.env.SMTP_USER ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS } : undefined,
    })
  : null;

async function enviarCodigoAcceso(email, codigo) {
  if (!transporter) {
    console.log(`✉️  [SMTP no configurado] Codigo de acceso para ${email}: ${codigo}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Codigo de acceso — Panel de Camaras CURF',
    text: `Tu codigo de acceso es: ${codigo}\n\nVence en 10 minutos. Si no lo pediste vos, ignora este mensaje.`,
  });
}

module.exports = { enviarCodigoAcceso };
