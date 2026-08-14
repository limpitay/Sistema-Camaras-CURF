const nodemailer = require('nodemailer');

// Todavía no hay SMTP institucional armado (ver rama
// feature/acceso-lan-login-institucional). Sin SMTP_HOST configurado, el
// código se imprime en el log del contenedor en vez de mandarse por mail —
// así se puede probar el flujo completo de login antes de tener el servidor
// de correo real. Cuando SMTP_HOST esté seteado, esto empieza a mandar mails
// de verdad sin tocar nada más del código.
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
    console.log(`✉️  [SMTP no configurado] Código de acceso para ${email}: ${codigo}`);
    return;
  }
  await transporter.sendMail({
    from: process.env.SMTP_FROM || process.env.SMTP_USER,
    to: email,
    subject: 'Código de acceso — Panel de Cámaras CURF',
    text: `Tu código de acceso es: ${codigo}\n\nVence en 10 minutos. Si no lo pediste vos, ignorá este mensaje.`,
  });
}

module.exports = { enviarCodigoAcceso };
