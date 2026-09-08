const express = require('express');
const fs = require('fs');
const path = require('path');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { buscarGrabaciones, descargarGrabacion } = require('../utils/isapiClient');

const router = express.Router();

// Seccion temporal/experimental: bajar clips puntuales de grabacion de un
// NVR al disco del servidor para poder descargarlos desde el navegador.
// Admin/Avanzado solamente (toca video real de camaras, mas sensible que el
// resto del Panel NVR que es de solo lectura de metadatos).
const GRABACIONES_DIR = path.join(
  path.dirname(process.env.DATABASE_PATH || path.join(__dirname, '..', '..', 'data', 'camaras.db')),
  'grabaciones'
);
fs.mkdirSync(GRABACIONES_DIR, { recursive: true });

function nombreArchivo(nvrHostname, canal, inicio) {
  const limpio = (s) => (s || '').replace(/[^A-Za-z0-9_-]/g, '');
  const marca = (inicio || '').replace(/[:]/g, '');
  return `${limpio(nvrHostname) || 'nvr'}_canal${canal}_${marca}.mp4`;
}

// GET /api/grabaciones — archivos ya descargados en el servidor
router.get('/', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const archivos = fs.readdirSync(GRABACIONES_DIR).map((nombre) => {
    const stat = fs.statSync(path.join(GRABACIONES_DIR, nombre));
    return { nombre, bytes: stat.size, creado: stat.mtime };
  });
  res.json(archivos.sort((a, b) => new Date(b.creado) - new Date(a.creado)));
});

// GET /api/grabaciones/buscar/:nvrId/:canal?desde=&hasta= — lista segmentos
// disponibles en el NVR para ese canal/ventana (no descarga nada todavia).
router.get('/buscar/:nvrId/:canal', auth, requireRole('admin', 'avanzado'), async (req, res) => {
  const nvr = db.prepare('SELECT * FROM nvrs WHERE id = ?').get(req.params.nvrId);
  if (!nvr) return res.status(404).json({ error: 'NVR no encontrado' });
  const { desde, hasta } = req.query;
  if (!desde || !hasta) return res.status(400).json({ error: 'desde y hasta son requeridos (ISO 8601 UTC)' });

  try {
    const segmentos = await buscarGrabaciones(nvr, Number(req.params.canal), desde, hasta);
    res.json(segmentos);
  } catch (err) {
    res.status(502).json({ error: `No se pudo buscar grabaciones: ${err.message}` });
  }
});

// POST /api/grabaciones/traer/:nvrId/:canal { playbackURI, inicio } — trae
// UN segmento del NVR al servidor. Sincrono (mantiene la conexion abierta
// hasta terminar) a proposito: es mas simple que armar un job en background
// para una seccion temporal, y los segmentos son de minutos, no dias.
router.post('/traer/:nvrId/:canal', auth, requireRole('admin', 'avanzado'), async (req, res) => {
  const nvr = db.prepare('SELECT * FROM nvrs WHERE id = ?').get(req.params.nvrId);
  if (!nvr) return res.status(404).json({ error: 'NVR no encontrado' });
  const { playbackURI, inicio } = req.body;
  if (!playbackURI || !inicio) return res.status(400).json({ error: 'playbackURI e inicio son requeridos' });

  const archivo = nombreArchivo(nvr.hostname, req.params.canal, inicio);
  const ruta = path.join(GRABACIONES_DIR, archivo);
  try {
    const bytes = await descargarGrabacion(nvr, playbackURI, ruta);
    res.status(201).json({ archivo, bytes });
  } catch (err) {
    fs.rm(ruta, { force: true }, () => {});
    res.status(502).json({ error: `No se pudo descargar: ${err.message}` });
  }
});

// GET /api/grabaciones/:archivo — baja un archivo ya guardado al navegador
router.get('/:archivo', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const ruta = path.join(GRABACIONES_DIR, path.basename(req.params.archivo));
  if (!fs.existsSync(ruta)) return res.status(404).json({ error: 'Archivo no encontrado' });
  res.download(ruta);
});

// DELETE /api/grabaciones/:archivo — borra un archivo temporal ya descargado
router.delete('/:archivo', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const ruta = path.join(GRABACIONES_DIR, path.basename(req.params.archivo));
  if (!fs.existsSync(ruta)) return res.status(404).json({ error: 'Archivo no encontrado' });
  fs.rmSync(ruta);
  res.status(204).end();
});

module.exports = router;
