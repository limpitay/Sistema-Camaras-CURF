const path = require('path');
const fs = require('fs');
const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { upload, UPLOADS_DIR, nombreArchivoImagen } = require('../middleware/upload');

const router = express.Router();

const ESTADOS = ['activa', 'inactiva'];

const SELECT_BASE = `
  SELECT c.*, e.nombre AS edificio, p.nombre AS piso, a.nombre AS area, n.hostname AS nvr
  FROM camaras c
  JOIN edificios e ON e.id = c.edificio_id
  JOIN pisos p ON p.id = c.piso_id
  JOIN areas a ON a.id = c.area_id
  LEFT JOIN nvrs n ON n.id = c.nvr_id
`;

// RF-08: el mando medio nunca recibe IP/MAC ni credenciales de la cámara —
// se filtra acá, no en el frontend.
const CAMPOS_MANDO_MEDIO = ['id', 'hostname', 'descripcion', 'ubicacion', 'imagen_url', 'edificio', 'piso', 'area', 'observaciones', 'estado'];
const CAMPOS_COMPLETOS = [
  ...CAMPOS_MANDO_MEDIO, 'edificio_id', 'piso_id', 'area_id', 'marca', 'modelo', 'ip', 'mac_address',
  'switch_conectado', 'usuario', 'contrasena', 'nvr_id', 'nvr', 'created_at', 'updated_at',
];

function seleccionarCampos(row, rol, accesoSet) {
  const campos = rol === 'mando_medio' ? CAMPOS_MANDO_MEDIO : CAMPOS_COMPLETOS;
  const seleccionada = Object.fromEntries(campos.map((campo) => [campo, row[campo]]));
  // RF-17: el mando medio ve si ya tiene un acceso activo a esta cámara,
  // sin importar si Sistemas ya lo aplicó en HikCentral o no — es el mismo
  // criterio "activo=1" que usa accesos_otorgados para lo vigente.
  if (rol === 'mando_medio') seleccionada.tiene_acceso = accesoSet.has(row.id);
  return seleccionada;
}

// GET /api/camaras — RF-07/RF-08/RF-09
router.get('/', auth, (req, res) => {
  const { edificio_id, piso_id, area_id, nvr_id, estado } = req.query;
  const condiciones = [];
  const valores = [];

  if (req.user.rol === 'mando_medio') {
    // RF-09: solo cámaras activas son visibles/solicitables para mandos medios.
    condiciones.push("c.estado = 'activa'");
  } else if (estado) {
    valores.push(estado);
    condiciones.push('c.estado = ?');
  }

  if (edificio_id) { valores.push(edificio_id); condiciones.push('c.edificio_id = ?'); }
  if (piso_id) { valores.push(piso_id); condiciones.push('c.piso_id = ?'); }
  if (area_id) { valores.push(area_id); condiciones.push('c.area_id = ?'); }
  if (nvr_id) { valores.push(nvr_id); condiciones.push('c.nvr_id = ?'); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = db.prepare(`${SELECT_BASE} ${where} ORDER BY e.nombre, p.nombre, a.nombre, c.hostname`).all(...valores);

  const accesoSet = req.user.rol === 'mando_medio' ? obtenerAccesoSet(req.user.id) : null;
  res.json(filas.map((row) => seleccionarCampos(row, req.user.rol, accesoSet)));
});

// GET /api/camaras/:id
router.get('/:id', auth, (req, res) => {
  const row = db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Cámara no encontrada' });

  if (req.user.rol === 'mando_medio' && row.estado !== 'activa') {
    return res.status(404).json({ error: 'Cámara no encontrada' });
  }

  const accesoSet = req.user.rol === 'mando_medio' ? obtenerAccesoSet(req.user.id) : null;
  res.json(seleccionarCampos(row, req.user.rol, accesoSet));
});

function obtenerAccesoSet(usuarioId) {
  const filas = db.prepare('SELECT camara_id FROM accesos_otorgados WHERE usuario_id = ? AND activo = 1').all(usuarioId);
  return new Set(filas.map((r) => r.camara_id));
}

// POST /api/camaras — RF-04 (Admin). Acepta JSON normal o multipart/form-data
// con un archivo "imagen" (jpg/png, RF-06) — si viene el archivo, pisa
// cualquier imagen_url que se haya mandado también.
router.post('/', auth, requireRole('admin', 'avanzado'), upload.single('imagen'), (req, res) => {
  const {
    hostname, descripcion, ubicacion, marca, modelo, ip, mac_address, edificio_id, piso_id, area_id,
    nvr_id, switch_conectado, usuario, contrasena, observaciones, estado,
  } = req.body;
  if (req.file) {
    const nombreFinal = nombreArchivoImagen(hostname, ip, path.extname(req.file.filename));
    fs.renameSync(req.file.path, path.join(UPLOADS_DIR, nombreFinal));
    req.file.filename = nombreFinal;
  }
  const imagen_url = req.file ? `/api/uploads/camaras/${req.file.filename}` : (req.body.imagen_url || null);

  if (!hostname || !edificio_id || !piso_id || !area_id) {
    return res.status(400).json({ error: 'hostname, edificio_id, piso_id y area_id son requeridos' });
  }
  if (estado && !ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `estado inválido, debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  if (!db.prepare('SELECT id FROM edificios WHERE id = ?').get(edificio_id)) {
    return res.status(400).json({ error: 'edificio_id no existe' });
  }
  if (!db.prepare('SELECT id FROM pisos WHERE id = ?').get(piso_id)) {
    return res.status(400).json({ error: 'piso_id no existe' });
  }
  if (!db.prepare('SELECT id FROM areas WHERE id = ?').get(area_id)) {
    return res.status(400).json({ error: 'area_id no existe' });
  }
  if (nvr_id && !db.prepare('SELECT id FROM nvrs WHERE id = ?').get(nvr_id)) {
    return res.status(400).json({ error: 'nvr_id no existe' });
  }

  const { lastInsertRowid } = db.prepare(
    `INSERT INTO camaras (
       hostname, descripcion, ubicacion, marca, modelo, ip, mac_address, edificio_id, piso_id, area_id, nvr_id,
       switch_conectado, usuario, contrasena, observaciones, imagen_url, estado
     ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'activa'))`
  ).run(
    hostname, descripcion || null, ubicacion || null, marca || null, modelo || null, ip || null, mac_address || null,
    edificio_id, piso_id, area_id, nvr_id || null, switch_conectado || null, usuario || null, contrasena || null,
    observaciones || null, imagen_url, estado || null
  );

  const creada = db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(lastInsertRowid);
  res.status(201).json(seleccionarCampos(creada, 'admin'));
});

// PUT /api/camaras/:id — RF-04 (Admin). Mismo criterio que el alta: archivo
// nuevo pisa la imagen anterior; sin archivo, se puede seguir editando la
// imagen_url a mano.
router.put('/:id', auth, requireRole('admin', 'avanzado'), upload.single('imagen'), (req, res) => {
  const actual = db.prepare('SELECT * FROM camaras WHERE id = ?').get(req.params.id);
  if (!actual) return res.status(404).json({ error: 'Cámara no encontrada' });

  const {
    hostname, descripcion, ubicacion, marca, modelo, ip, mac_address, edificio_id, piso_id, area_id,
    nvr_id, switch_conectado, usuario, contrasena, observaciones, estado,
  } = req.body;
  if (req.file) {
    const hostnameFinal = hostname || actual.hostname;
    const ipFinal = ip === undefined ? actual.ip : ip;
    const nombreActual = actual.imagen_url ? path.basename(actual.imagen_url) : null;
    const nombreFinal = nombreArchivoImagen(hostnameFinal, ipFinal, path.extname(req.file.filename), nombreActual);
    fs.renameSync(req.file.path, path.join(UPLOADS_DIR, nombreFinal));
    req.file.filename = nombreFinal;
  }
  const imagen_url = req.file ? `/api/uploads/camaras/${req.file.filename}` : req.body.imagen_url;

  if (estado && !ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `estado inválido, debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  if (edificio_id && !db.prepare('SELECT id FROM edificios WHERE id = ?').get(edificio_id)) {
    return res.status(400).json({ error: 'edificio_id no existe' });
  }
  if (piso_id && !db.prepare('SELECT id FROM pisos WHERE id = ?').get(piso_id)) {
    return res.status(400).json({ error: 'piso_id no existe' });
  }
  if (area_id && !db.prepare('SELECT id FROM areas WHERE id = ?').get(area_id)) {
    return res.status(400).json({ error: 'area_id no existe' });
  }
  if (nvr_id && !db.prepare('SELECT id FROM nvrs WHERE id = ?').get(nvr_id)) {
    return res.status(400).json({ error: 'nvr_id no existe' });
  }

  db.prepare(
    `UPDATE camaras SET
       hostname = ?, descripcion = ?, ubicacion = ?, marca = ?, modelo = ?, ip = ?, mac_address = ?,
       edificio_id = ?, piso_id = ?, area_id = ?, nvr_id = ?, switch_conectado = ?, usuario = ?, contrasena = ?,
       observaciones = ?, imagen_url = ?, estado = ?
     WHERE id = ?`
  ).run(
    hostname || actual.hostname,
    descripcion === undefined ? actual.descripcion : descripcion,
    ubicacion === undefined ? actual.ubicacion : ubicacion,
    marca === undefined ? actual.marca : marca,
    modelo === undefined ? actual.modelo : modelo,
    ip === undefined ? actual.ip : ip,
    mac_address === undefined ? actual.mac_address : mac_address,
    edificio_id || actual.edificio_id,
    piso_id || actual.piso_id,
    area_id || actual.area_id,
    nvr_id === undefined ? actual.nvr_id : (nvr_id || null),
    switch_conectado === undefined ? actual.switch_conectado : switch_conectado,
    usuario === undefined ? actual.usuario : usuario,
    contrasena === undefined ? actual.contrasena : contrasena,
    observaciones === undefined ? actual.observaciones : observaciones,
    imagen_url === undefined ? actual.imagen_url : imagen_url,
    estado || actual.estado,
    req.params.id
  );

  const actualizada = db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(req.params.id);
  res.json(seleccionarCampos(actualizada, 'admin'));
});

// PATCH /api/camaras/:id/estado — RF-05: activar/desactivar es siempre un
// UPDATE, nunca un DELETE (RNF-06). No hay ruta DELETE para cámaras a propósito.
router.patch('/:id/estado', auth, requireRole('admin', 'avanzado'), (req, res) => {
  const { estado } = req.body;
  if (!ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `estado inválido, debe ser uno de: ${ESTADOS.join(', ')}` });
  }

  const resultado = db.prepare('UPDATE camaras SET estado = ? WHERE id = ?').run(estado, req.params.id);
  if (resultado.changes === 0) return res.status(404).json({ error: 'Cámara no encontrada' });

  const actualizada = db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(req.params.id);
  res.json(seleccionarCampos(actualizada, 'admin'));
});

module.exports = router;
