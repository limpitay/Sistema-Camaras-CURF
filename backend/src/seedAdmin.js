// Alta del primer admin, la única que no puede pasar por la API (RF-01
// exige rol admin para dar de alta usuarios — sin este script no hay forma
// de crear el primero). Se corre en cada arranque junto con las migraciones;
// no hace nada si ADMIN_EMAIL no está seteado o si el usuario ya existe.
const db = require('./db');

const email = process.env.ADMIN_EMAIL;
const nombre = process.env.ADMIN_NOMBRE;

if (!email) {
  console.log('ADMIN_EMAIL no seteado, se omite el alta de admin.');
  process.exit(0);
}

const existente = db.prepare('SELECT id FROM usuarios WHERE email_institucional = ?').get(email);

if (existente) {
  console.log(`Usuario admin ya existe (${email}), no se modifica.`);
} else {
  db.prepare(
    'INSERT INTO usuarios (email_institucional, nombre, rol) VALUES (?, ?, ?)'
  ).run(email, nombre || email, 'admin');
  console.log(`✅ Usuario admin creado: ${email}`);
}
