const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { upload } = require('../middleware/upload');

const router = express.Router();

const ESTADOS = ['funcionando', 'a_reemplazar', 'nueva', 'dada_de_baja'];

const SELECT_BASE = `
  SELECT c.*, e.id AS edificio_id, e.nombre AS edificio, p.id AS piso_id, p.nombre AS piso, a.nombre AS area
  FROM camaras c
  JOIN areas a ON a.id = c.area_id
  JOIN pisos p ON p.id = a.piso_id
  JOIN edificios e ON e.id = p.edificio_id
`;

// RF-08: el mando medio nunca recibe IP ni MAC — se filtra acá, no en el frontend.
const CAMPOS_MANDO_MEDIO = ['id', 'hostname', 'descripcion', 'imagen_url', 'edificio', 'piso', 'area', 'observaciones', 'estado'];
const CAMPOS_COMPLETOS = [
  ...CAMPOS_MANDO_MEDIO, 'edificio_id', 'piso_id', 'area_id', 'ip', 'mac_address',
  'switch_conectado', 'nvr', 'origen', 'created_at', 'updated_at',
];

function seleccionarCampos(row, rol) {
  const campos = rol === 'mando_medio' ? CAMPOS_MANDO_MEDIO : CAMPOS_COMPLETOS;
  return Object.fromEntries(campos.map((campo) => [campo, row[campo]]));
}

// GET /api/camaras — RF-07/RF-08/RF-09
router.get('/', auth, (req, res) => {
  const { edificio_id, piso_id, area_id, estado } = req.query;
  const condiciones = [];
  const valores = [];

  if (req.user.rol === 'mando_medio') {
    // RF-09: solo cámaras funcionando son visibles/solicitables para mandos medios.
    condiciones.push("c.estado = 'funcionando'");
  } else if (estado) {
    valores.push(estado);
    condiciones.push('c.estado = ?');
  }

  if (edificio_id) { valores.push(edificio_id); condiciones.push('e.id = ?'); }
  if (piso_id) { valores.push(piso_id); condiciones.push('p.id = ?'); }
  if (area_id) { valores.push(area_id); condiciones.push('a.id = ?'); }

  const where = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';
  const filas = db.prepare(`${SELECT_BASE} ${where} ORDER BY e.nombre, p.nombre, a.nombre, c.hostname`).all(...valores);

  res.json(filas.map((row) => seleccionarCampos(row, req.user.rol)));
});

// GET /api/camaras/:id
router.get('/:id', auth, (req, res) => {
  const row = db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(req.params.id);
  if (!row) return res.status(404).json({ error: 'Cámara no encontrada' });

  if (req.user.rol === 'mando_medio' && row.estado !== 'funcionando') {
    return res.status(404).json({ error: 'Cámara no encontrada' });
  }

  res.json(seleccionarCampos(row, req.user.rol));
});

// POST /api/camaras — RF-04 (Admin). Acepta JSON normal o multipart/form-data
// con un archivo "imagen" (jpg/png, RF-06) — si viene el archivo, pisa
// cualquier imagen_url que se haya mandado también.
router.post('/', auth, requireRole('admin'), upload.single('imagen'), (req, res) => {
  const { hostname, descripcion, ip, mac_address, area_id, switch_conectado, observaciones, nvr, estado } = req.body;
  const imagen_url = req.file ? `/api/uploads/camaras/${req.file.filename}` : (req.body.imagen_url || null);

  if (!hostname || !area_id) {
    return res.status(400).json({ error: 'hostname y area_id son requeridos' });
  }
  if (estado && !ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `estado inválido, debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  if (!db.prepare('SELECT id FROM areas WHERE id = ?').get(area_id)) {
    return res.status(400).json({ error: 'area_id no existe' });
  }

  const { lastInsertRowid } = db.prepare(
    `INSERT INTO camaras (hostname, descripcion, ip, mac_address, area_id, switch_conectado, observaciones, imagen_url, nvr, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, 'nueva'))`
  ).run(hostname, descripcion || null, ip || null, mac_address || null, area_id, switch_conectado || null, observaciones || null, imagen_url, nvr || null, estado || null);

  const creada = db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(lastInsertRowid);
  res.status(201).json(seleccionarCampos(creada, 'admin'));
});

// PUT /api/camaras/:id — RF-04 (Admin). Mismo criterio que el alta: archivo
// nuevo pisa la imagen anterior; sin archivo, se puede seguir editando la
// imagen_url a mano.
router.put('/:id', auth, requireRole('admin'), upload.single('imagen'), (req, res) => {
  const actual = db.prepare('SELECT * FROM camaras WHERE id = ?').get(req.params.id);
  if (!actual) return res.status(404).json({ error: 'Cámara no encontrada' });

  const { hostname, descripcion, ip, mac_address, area_id, switch_conectado, observaciones, nvr, estado } = req.body;
  const imagen_url = req.file ? `/api/uploads/camaras/${req.file.filename}` : req.body.imagen_url;

  if (estado && !ESTADOS.includes(estado)) {
    return res.status(400).json({ error: `estado inválido, debe ser uno de: ${ESTADOS.join(', ')}` });
  }
  if (area_id && !db.prepare('SELECT id FROM areas WHERE id = ?').get(area_id)) {
    return res.status(400).json({ error: 'area_id no existe' });
  }

  db.prepare(
    `UPDATE camaras SET
       hostname = ?, descripcion = ?, ip = ?, mac_address = ?, area_id = ?,
       switch_conectado = ?, observaciones = ?, imagen_url = ?, nvr = ?, estado = ?
     WHERE id = ?`
  ).run(
    hostname || actual.hostname,
    descripcion === undefined ? actual.descripcion : descripcion,
    ip === undefined ? actual.ip : ip,
    mac_address === undefined ? actual.mac_address : mac_address,
    area_id || actual.area_id,
    switch_conectado === undefined ? actual.switch_conectado : switch_conectado,
    observaciones === undefined ? actual.observaciones : observaciones,
    imagen_url === undefined ? actual.imagen_url : imagen_url,
    nvr === undefined ? actual.nvr : nvr,
    estado || actual.estado,
    req.params.id
  );

  const actualizada = db.prepare(`${SELECT_BASE} WHERE c.id = ?`).get(req.params.id);
  res.json(seleccionarCampos(actualizada, 'admin'));
});

// PATCH /api/camaras/:id/estado — RF-05: dar de baja (o cualquier cambio de
// estado) es siempre un UPDATE, nunca un DELETE (RNF-06). No hay ruta DELETE
// para cámaras a propósito.
router.patch('/:id/estado', auth, requireRole('admin'), (req, res) => {
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
