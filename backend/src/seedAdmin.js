// Alta del primer admin, la unica que no puede pasar por la API (RF-01
// exige rol admin para dar de alta usuarios — sin este script no hay forma
// de crear el primero). Se corre en cada arranque junto con las migraciones;
// no hace nada si ADMIN_EMAIL no esta seteado o si ya existe algun admin.
//
// El chequeo es "¿ya hay algun admin?", no "¿ya existe ADMIN_EMAIL como
// username?" — el username de ese primer admin es editable desde el panel
// (Crud → Usuarios) una vez creado, asi que matchear por ADMIN_EMAIL
// terminaria creando un admin duplicado en cada arranque despues de que
// alguien le cambie el username (ver username en 023_username.sql).
const db = require('./db');

const email = process.env.ADMIN_EMAIL;
const nombre = process.env.ADMIN_NOMBRE;

if (!email) {
  console.log('ADMIN_EMAIL no seteado, se omite el alta de admin.');
  process.exit(0);
}

const existente = db.prepare("SELECT id FROM usuarios WHERE rol = 'admin' LIMIT 1").get();

if (existente) {
  console.log('Ya existe un usuario admin, no se modifica.');
} else {
  db.prepare(
    'INSERT INTO usuarios (username, nombre, rol) VALUES (?, ?, ?)'
  ).run(email, nombre || email, 'admin');
  console.log(`✅ Usuario admin creado: ${email}`);
}
