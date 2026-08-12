-- RF-04/RF-05: `estado` incluye 'dada_de_baja' — las cámaras nunca se borran
-- físicamente si tienen historial asociado, solo cambian de estado (RNF-06).
-- `descripcion` es el nombre amigable para mandos medios (punto abierto de
-- ESPECIFICACION.md sección 9: identifican la cámara por descripción, piso,
-- edificio, foto y observaciones, no por el hostname técnico).
CREATE TABLE camaras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hostname TEXT NOT NULL,
  descripcion TEXT,
  imagen_url TEXT,
  ip TEXT,
  mac_address TEXT,
  area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
  switch_conectado TEXT,
  nvr TEXT,
  observaciones TEXT,
  estado TEXT NOT NULL DEFAULT 'nueva' CHECK (estado IN ('funcionando', 'a_reemplazar', 'nueva', 'dada_de_baja')),
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'api_hikcentral')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_camaras_area ON camaras(area_id);
CREATE INDEX idx_camaras_estado ON camaras(estado);

CREATE TRIGGER trg_camaras_updated_at
AFTER UPDATE ON camaras
FOR EACH ROW
BEGIN
  UPDATE camaras SET updated_at = datetime('now') WHERE id = NEW.id;
END;
