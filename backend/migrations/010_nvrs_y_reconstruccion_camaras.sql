-- Reconstrucción del inventario de cámaras según la planilla real de
-- Sistemas (ID, Edificio, Piso, Área, Ubicación, Marca, Modelo, IP, MAC,
-- ID/Hostname, Usuario, Contraseña, Activa, Acceso SmartPSS, NVR, Imagen):
--
-- - NVR pasa a ser su propia tabla: hasta ahora `camaras.nvr` era texto
--   libre, sin integridad referencial ni forma confiable de listar "todas
--   las cámaras de este NVR". En la planilla real hay muchas cámaras sin
--   NVR asignado todavía, así que `nvr_id` queda nullable a propósito — se
--   van a ir asociando con el tiempo. El conteo de cámaras por NVR no se
--   guarda como columna (se calcularía y quedaría desactualizado); se
--   calcula al vuelo en GET /api/nvrs.
-- - `estado` se simplifica a dos valores (activa/inactiva), reemplazando
--   los 4 anteriores (funcionando/a_reemplazar/nueva/dada_de_baja).
-- - Se suman los campos que la planilla ya trae por cámara: ubicacion (más
--   puntual que el área/categoría), marca, modelo, usuario, contrasena
--   (texto plano a pedido — panel de uso interno, solo Admin llega a esta
--   pantalla) y acceso_smartpss.
--
-- Sin cámaras cargadas todavía en ningún clon de este proyecto, así que se
-- recrea `camaras` en limpio en vez de migrar datos (mismo criterio que
-- 009_areas_globales.sql).
CREATE TABLE nvrs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hostname TEXT NOT NULL,
  ip TEXT,
  mac_address TEXT,
  piso_id INTEGER REFERENCES pisos(id) ON DELETE RESTRICT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_nvrs_piso ON nvrs(piso_id);

CREATE TRIGGER trg_nvrs_updated_at
AFTER UPDATE ON nvrs
FOR EACH ROW
BEGIN
  UPDATE nvrs SET updated_at = datetime('now') WHERE id = NEW.id;
END;

DROP TABLE camaras;

CREATE TABLE camaras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  hostname TEXT NOT NULL,
  descripcion TEXT,
  ubicacion TEXT,
  marca TEXT,
  modelo TEXT,
  imagen_url TEXT,
  ip TEXT,
  mac_address TEXT,
  piso_id INTEGER NOT NULL REFERENCES pisos(id) ON DELETE RESTRICT,
  area_id INTEGER NOT NULL REFERENCES areas(id) ON DELETE RESTRICT,
  nvr_id INTEGER REFERENCES nvrs(id) ON DELETE SET NULL,
  switch_conectado TEXT,
  usuario TEXT,
  contrasena TEXT,
  acceso_smartpss INTEGER NOT NULL DEFAULT 0 CHECK (acceso_smartpss IN (0, 1)),
  observaciones TEXT,
  estado TEXT NOT NULL DEFAULT 'activa' CHECK (estado IN ('activa', 'inactiva')),
  origen TEXT NOT NULL DEFAULT 'manual' CHECK (origen IN ('manual', 'api_hikcentral')),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_camaras_piso ON camaras(piso_id);
CREATE INDEX idx_camaras_area ON camaras(area_id);
CREATE INDEX idx_camaras_nvr ON camaras(nvr_id);
CREATE INDEX idx_camaras_estado ON camaras(estado);

CREATE TRIGGER trg_camaras_updated_at
AFTER UPDATE ON camaras
FOR EACH ROW
BEGIN
  UPDATE camaras SET updated_at = datetime('now') WHERE id = NEW.id;
END;
