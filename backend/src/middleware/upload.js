const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// RF-06: la foto de una cámara puede ser un archivo subido (jpg/png) o una
// URL — esto cubre el caso "archivo". Se guarda en el mismo volumen que la
// base SQLite (ver docker-compose.yml: app_data:/app/data) para que sobreviva
// a que se recree el contenedor.
const UPLOADS_DIR = path.join(path.dirname(process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data', 'camaras.db')), 'uploads', 'camaras');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const EXTENSION_POR_TIPO = { 'image/jpeg': '.jpg', 'image/png': '.png' };
const EXTENSIONES_VALIDAS = { '.jpg': '.jpg', '.jpeg': '.jpg', '.png': '.png' };

// Algunos navegadores/SO no completan bien el mimetype (queda vacío o
// genérico) para archivos con extensión en mayúsculas o exportados por
// ciertas apps — por eso, si el mimetype no matchea, se cae a mirar la
// extensión del nombre original (sin importar mayúsculas/minúsculas) antes
// de rechazar el archivo.
function extensionDeArchivo(file) {
  if (EXTENSION_POR_TIPO[file.mimetype]) return EXTENSION_POR_TIPO[file.mimetype];
  return EXTENSIONES_VALIDAS[path.extname(file.originalname).toLowerCase()] || null;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${extensionDeArchivo(file)}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!extensionDeArchivo(file)) {
      return cb(new Error('Solo se permiten imágenes JPG o PNG'));
    }
    cb(null, true);
  },
});

module.exports = { upload, UPLOADS_DIR };
