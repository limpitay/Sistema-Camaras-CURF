const express = require('express');
const db = require('../db');
const auth = require('../middleware/auth');
const requireRole = require('../middleware/requireRole');
const { ROLES_CONFIGURABLES, PANELES_POR_ROL, PANEL_LABEL, TABLAS_COLUMNAS, TABLAS_FILTROS, TABLA_PANEL } = require('../permisosRegistro');

const router = express.Router();

// GET /api/permisos/mios — cualquier usuario autenticado, resuelve su propio
// rol contra los overrides guardados. Con esto arma su sidebar y sus tablas
// (Layout.jsx, Crud.jsx, Usuarios.jsx). null en `paneles` = admin, sin
// restriccion, el frontend no filtra nada.
router.get('/mios', auth, (req, res) => {
  const rol = req.user.rol;
  const panelesBase = PANELES_POR_ROL[rol];

  let paneles = null;
  if (panelesBase) {
    const ocultos = new Set(
      db.prepare('SELECT panel FROM permisos_paneles WHERE rol = ? AND visible = 0').all(rol).map((r) => r.panel)
    );
    paneles = panelesBase.filter((p) => !ocultos.has(p));
  }

  const agrupar = (filas, campo) => {
    const mapa = {};
    for (const { tabla, ...resto } of filas) (mapa[tabla] ??= []).push(resto[campo]);
    return mapa;
  };

  const columnasOcultas = agrupar(
    db.prepare('SELECT tabla, columna FROM permisos_columnas WHERE rol = ? AND visible = 0').all(rol),
    'columna'
  );
  const filtrosOcultos = agrupar(
    db.prepare('SELECT tabla, filtro FROM permisos_filtros WHERE rol = ? AND visible = 0').all(rol),
    'filtro'
  );

  res.json({ paneles, columnasOcultas, filtrosOcultos });
});

// GET /api/permisos — Admin: matriz completa para editar + el registro de
// paneles/columnas/filtros disponibles (una sola fuente de verdad, ver
// permisosRegistro.js — el frontend no duplica los labels).
router.get('/', auth, requireRole('admin'), (req, res) => {
  // Filtrado contra el registro actual, no solo lectura cruda: si una
  // columna/filtro/panel se renombra o se saca de permisosRegistro.js, la
  // fila vieja en la base queda huerfana (ya no hay forma de togglearla
  // desde la UI) — sin este filtro, GET la seguia devolviendo, el frontend
  // la reenviaba tal cual al guardar, y el PUT de mas abajo la rechazaba
  // (bloqueaba guardar cualquier otro cambio real). Al no devolverla aca,
  // el proximo PUT (que reemplaza todo) la limpia sola de la base.
  const overridesPaneles = db.prepare('SELECT rol, panel FROM permisos_paneles WHERE visible = 0').all()
    .filter(({ rol, panel }) => (PANELES_POR_ROL[rol] || []).includes(panel));
  const overridesColumnas = db.prepare('SELECT rol, tabla, columna FROM permisos_columnas WHERE visible = 0').all()
    .filter(({ tabla, columna }) => TABLAS_COLUMNAS[tabla]?.columnas[columna]);
  const overridesFiltros = db.prepare('SELECT rol, tabla, filtro FROM permisos_filtros WHERE visible = 0').all()
    .filter(({ tabla, filtro }) => TABLAS_FILTROS[tabla]?.filtros[filtro]);
  res.json({
    roles: ROLES_CONFIGURABLES,
    panelesPorRol: PANELES_POR_ROL,
    panelLabel: PANEL_LABEL,
    tablasColumnas: TABLAS_COLUMNAS,
    tablasFiltros: TABLAS_FILTROS,
    tablaPanel: TABLA_PANEL,
    ocultosPaneles: overridesPaneles,
    ocultosColumnas: overridesColumnas,
    ocultosFiltros: overridesFiltros,
  });
});

// PUT /api/permisos — Admin: reemplaza todos los overrides por los que
// mandan. El body manda solo lo oculto (visible=0); todo lo que no aparece
// queda visible por default. Se valida contra el registro para no guardar
// combinaciones que no existen (rol sin ese panel, tabla/columna/filtro
// inventados).
router.put('/', auth, requireRole('admin'), (req, res) => {
  const { ocultosPaneles = [], ocultosColumnas = [], ocultosFiltros = [] } = req.body;

  for (const { rol, panel } of ocultosPaneles) {
    if (!ROLES_CONFIGURABLES.includes(rol) || !(PANELES_POR_ROL[rol] || []).includes(panel)) {
      return res.status(400).json({ error: `Panel invalido para ese rol: ${rol}/${panel}` });
    }
  }
  for (const { rol, tabla, columna } of ocultosColumnas) {
    if (!ROLES_CONFIGURABLES.includes(rol) || !TABLAS_COLUMNAS[tabla]?.columnas[columna]) {
      return res.status(400).json({ error: `Columna invalida: ${rol}/${tabla}/${columna}` });
    }
  }
  for (const { rol, tabla, filtro } of ocultosFiltros) {
    if (!ROLES_CONFIGURABLES.includes(rol) || !TABLAS_FILTROS[tabla]?.filtros[filtro]) {
      return res.status(400).json({ error: `Filtro invalido: ${rol}/${tabla}/${filtro}` });
    }
  }

  const guardar = db.transaction(() => {
    db.prepare('DELETE FROM permisos_paneles').run();
    db.prepare('DELETE FROM permisos_columnas').run();
    db.prepare('DELETE FROM permisos_filtros').run();
    const insP = db.prepare('INSERT INTO permisos_paneles (rol, panel, visible) VALUES (?, ?, 0)');
    for (const { rol, panel } of ocultosPaneles) insP.run(rol, panel);
    const insC = db.prepare('INSERT INTO permisos_columnas (rol, tabla, columna, visible) VALUES (?, ?, ?, 0)');
    for (const { rol, tabla, columna } of ocultosColumnas) insC.run(rol, tabla, columna);
    const insF = db.prepare('INSERT INTO permisos_filtros (rol, tabla, filtro, visible) VALUES (?, ?, ?, 0)');
    for (const { rol, tabla, filtro } of ocultosFiltros) insF.run(rol, tabla, filtro);
  });
  guardar();

  res.json({ ok: true });
});

module.exports = router;
