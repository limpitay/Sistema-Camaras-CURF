const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');

// RF-06: la foto de una camara puede ser un archivo subido (jpg/png) o una
// URL — esto cubre el caso "archivo". Se guarda en el mismo volumen que la
// base SQLite (ver docker-compose.yml: app_data:/app/data) para que sobreviva
// a que se recree el contenedor.
const UPLOADS_DIR = path.join(path.dirname(process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data', 'camaras.db')), 'uploads', 'camaras');
fs.mkdirSync(UPLOADS_DIR, { recursive: true });

const EXTENSION_POR_TIPO = { 'image/jpeg': '.jpg', 'image/png': '.png' };
const EXTENSIONES_VALIDAS = { '.jpg': '.jpg', '.jpeg': '.jpg', '.png': '.png' };

// Algunos navegadores/SO no completan bien el mimetype (queda vacio o
// generico) para archivos con extension en mayusculas o exportados por
// ciertas apps — por eso, si el mimetype no matchea, se cae a mirar la
// extension del nombre original (sin importar mayusculas/minusculas) antes
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
      return cb(new Error('Solo se permiten imagenes JPG o PNG'));
    }
    cb(null, true);
  },
});

// Nombre buscable para la imagen: hostname + ultimos 2 octetos de la IP
// (ej. "CAMCAPB26_0.172") en vez de un UUID, para poder ubicar el archivo a
// simple vista en la carpeta de uploads. Si `nombreActual` (imagen que ya
// tenia la camara) coincide con el candidato, se reutiliza ese nombre para
// pisar la foto vieja; si no, se agrega un sufijo numerico para no pisar el
// archivo de otra camara que por casualidad tenga el mismo hostname+IP.
function nombreArchivoImagen(hostname, ip, extension, nombreActual) {
  const hostnameSano = (hostname || 'camara').replace(/[^A-Za-z0-9_-]/g, '') || 'camara';
  const octetos = (ip || '').split('.').slice(-2);
  const sufijoIp = octetos.length === 2 && octetos.every((o) => /^\d{1,3}$/.test(o)) ? octetos.join('.') : null;
  const base = sufijoIp ? `${hostnameSano}_${sufijoIp}` : hostnameSano;

  let candidato = `${base}${extension}`;
  let contador = 2;
  while (candidato !== nombreActual && fs.existsSync(path.join(UPLOADS_DIR, candidato))) {
    candidato = `${base}-${contador}${extension}`;
    contador += 1;
  }
  return candidato;
}

module.exports = { upload, UPLOADS_DIR, nombreArchivoImagen };
