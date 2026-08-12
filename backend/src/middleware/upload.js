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

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS_DIR),
  filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}${EXTENSION_POR_TIPO[file.mimetype]}`),
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (req, file, cb) => {
    if (!EXTENSION_POR_TIPO[file.mimetype]) {
      return cb(new Error('Solo se permiten imágenes JPG o PNG'));
    }
    cb(null, true);
  },
});

module.exports = { upload, UPLOADS_DIR };
