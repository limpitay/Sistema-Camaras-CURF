// Script de un solo uso: aplica el criterio de nombre "hostname_ip" (ver
// middleware/upload.js) a las fotos que ya estaban subidas antes de que ese
// criterio existiera (hasta entonces se guardaban con un UUID). Es idempotente
// — correrlo de nuevo sobre archivos ya renombrados no hace nada — asi que es
// seguro repetirlo si se agregan camaras viejas sin foto renombrada.
const fs = require('fs');
const path = require('path');
const db = require('./db');
const { UPLOADS_DIR, nombreArchivoImagen } = require('./middleware/upload');

const PREFIJO = '/api/uploads/camaras/';
const camaras = db.prepare(
  'SELECT id, hostname, ip, imagen_url FROM camaras WHERE imagen_url LIKE ?'
).all(`${PREFIJO}%`);

let renombradas = 0;
let saltadas = 0;
let faltantes = 0;

for (const camara of camaras) {
  const nombreActual = camara.imagen_url.slice(PREFIJO.length);
  const rutaActual = path.join(UPLOADS_DIR, nombreActual);

  if (!fs.existsSync(rutaActual)) {
    console.log(`⚠️  Camara ${camara.id} (${camara.hostname}): falta el archivo ${nombreActual}, se omite.`);
    faltantes += 1;
    continue;
  }

  const nombreNuevo = nombreArchivoImagen(camara.hostname, camara.ip, path.extname(nombreActual), nombreActual);

  if (nombreNuevo === nombreActual) {
    saltadas += 1;
    continue;
  }

  fs.renameSync(rutaActual, path.join(UPLOADS_DIR, nombreNuevo));
  db.prepare('UPDATE camaras SET imagen_url = ? WHERE id = ?').run(`${PREFIJO}${nombreNuevo}`, camara.id);
  console.log(`✅ Camara ${camara.id} (${camara.hostname}): ${nombreActual} → ${nombreNuevo}`);
  renombradas += 1;
}

console.log(`\nListo: ${renombradas} renombradas, ${saltadas} ya estaban OK, ${faltantes} con archivo faltante.`);
