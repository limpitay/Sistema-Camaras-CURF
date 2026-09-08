require('dotenv').config({ quiet: true });
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const db = require('./db');
const { UPLOADS_DIR } = require('./middleware/upload');
const authImagen = require('./middleware/authImagen');

const app = express();

// Sin esto, req.ip siempre seria la IP interna del contenedor de nginx (el
// unico "cliente" que ve Express), porque todo pasa por el proxy_pass de
// nginx.conf. 'uniquelocal' hace que Express confie en hops que vienen de
// direcciones privadas (loopback/link-local/RFC1918 — exactamente donde vive
// nginx en la red de Docker) y tome la IP real del cliente del header
// X-Forwarded-For que nginx agrega. Necesario para restringirRedLocal.
app.set('trust proxy', 'loopback, linklocal, uniquelocal');

// CORS_ORIGIN: lista de origenes separados por coma (ej: "http://localhost:5173,http://192.168.1.50:8080")
// Si no esta seteada, queda abierto a cualquier origen.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',').map((o) => o.trim()) } : undefined));
app.use(express.json());
app.use(require('./middleware/restringirRedLocal'));

// Fotos de camara subidas como archivo (RF-06). El prefijo tiene que coincidir
// con el ^~ /api/ de nginx.conf para que no lo intercepte la regla de cache
// de imagenes estaticas del propio frontend. authImagen exige login (antes
// esto quedaba abierto a cualquiera en la LAN, sin sesion — ver ese archivo
// para por que el token viaja por query acá y en ningun otro lado).
app.use('/api/uploads/camaras', authImagen, express.static(UPLOADS_DIR));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/ubicaciones', require('./routes/ubicaciones'));
app.use('/api/camaras', require('./routes/camaras'));
app.use('/api/nvrs', require('./routes/nvrs'));
app.use('/api/solicitudes', require('./routes/solicitudes'));
app.use('/api/accesos', require('./routes/accesos'));
app.use('/api/cuentas-nvr', require('./routes/cuentasNvr'));
app.use('/api/permisos', require('./routes/permisos'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Manejador de errores centralizado — Express 5 reenvia aca las excepciones
// (sync o async) de cualquier ruta, asi que las rutas no necesitan un
// try/catch generico solo para devolver un 500. Los rechazos de multer
// (archivo demasiado grande, tipo no permitido) son el unico caso frecuente
// que no es un 500 real, asi que se distinguen aca.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || /JPG o PNG/.test(err.message)) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3001;
const server = app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en http://localhost:${PORT}`);
});

// Sin esto, un `docker stop`/`docker compose restart` mata el proceso con
// SIGTERM y, si Node no atiende la senal, el contenedor lo termina a la
// fuerza (SIGKILL) pasado el grace period. SQLite en modo WAL puede tener
// escrituras confirmadas que todavia viven solo en camaras.db-wal, sin
// volcar al archivo principal — un corte abrupto ahi se pierde esos cambios
// (nos paso). db.close() fuerza el checkpoint final antes de salir.
function apagar() {
  server.close(() => {
    db.close();
    process.exit(0);
  });
}
process.on('SIGTERM', apagar);
process.on('SIGINT', apagar);
