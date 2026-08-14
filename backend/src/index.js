require('dotenv').config();
const express = require('express');
const cors = require('cors');
const multer = require('multer');
const { UPLOADS_DIR } = require('./middleware/upload');

const app = express();

// CORS_ORIGIN: lista de orígenes separados por coma (ej: "http://localhost:5173,http://192.168.1.50:8080")
// Si no está seteada, queda abierto a cualquier origen.
const corsOrigin = process.env.CORS_ORIGIN;
app.use(cors(corsOrigin ? { origin: corsOrigin.split(',').map((o) => o.trim()) } : undefined));
app.use(express.json());

// Fotos de cámara subidas como archivo (RF-06). El prefijo tiene que coincidir
// con el ^~ /api/ de nginx.conf para que no lo intercepte la regla de cache
// de imágenes estáticas del propio frontend.
app.use('/api/uploads/camaras', express.static(UPLOADS_DIR));

app.use('/api/auth', require('./routes/auth'));
app.use('/api/usuarios', require('./routes/usuarios'));
app.use('/api/ubicaciones', require('./routes/ubicaciones'));
app.use('/api/camaras', require('./routes/camaras'));
app.use('/api/nvrs', require('./routes/nvrs'));
app.use('/api/solicitudes', require('./routes/solicitudes'));
app.use('/api/accesos', require('./routes/accesos'));
app.use('/api/cuentas-nvr', require('./routes/cuentasNvr'));

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date() });
});

// Manejador de errores centralizado — Express 5 reenvía acá las excepciones
// (sync o async) de cualquier ruta, así que las rutas no necesitan un
// try/catch genérico solo para devolver un 500. Los rechazos de multer
// (archivo demasiado grande, tipo no permitido) son el único caso frecuente
// que no es un 500 real, así que se distinguen acá.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || /JPG o PNG/.test(err.message)) {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: 'Error interno del servidor' });
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`🚀 Backend corriendo en http://localhost:${PORT}`);
});
