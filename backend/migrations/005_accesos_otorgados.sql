-- RF-14 a RF-22: nace cuando Dirección aprueba una solicitud (una fila por
-- cámara incluida en esa solicitud), con aplicado_en_hikcentral = 0. Tabla de
-- estados completa en ESPECIFICACION.md sección 4.5.
--
-- `solicitud_id` es nullable pensando en RF-23 (integración futura con la API
-- de HikCentral): en esa etapa podría haber altas que no vengan de una
-- solicitud previa en este panel.
CREATE TABLE accesos_otorgados (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitud_id INTEGER REFERENCES solicitudes(id) ON DELETE SET NULL,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  camara_id INTEGER NOT NULL REFERENCES camaras(id) ON DELETE RESTRICT,
  fecha_otorgado TEXT NOT NULL DEFAULT (datetime('now')),
  otorgado_por INTEGER NOT NULL REFERENCES usuarios(id),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  fecha_revocacion TEXT,
  revocado_por INTEGER REFERENCES usuarios(id),
  aplicado_en_hikcentral INTEGER NOT NULL DEFAULT 0 CHECK (aplicado_en_hikcentral IN (0, 1)),
  fecha_aplicado TEXT,
  aplicado_por INTEGER REFERENCES usuarios(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- RNF-07: no puede haber dos accesos activos para el mismo par (usuario, cámara).
CREATE UNIQUE INDEX idx_accesos_activo_unico ON accesos_otorgados(usuario_id, camara_id) WHERE activo = 1;
CREATE INDEX idx_accesos_pendientes ON accesos_otorgados(activo, aplicado_en_hikcentral);

CREATE TRIGGER trg_accesos_otorgados_updated_at
AFTER UPDATE ON accesos_otorgados
FOR EACH ROW
BEGIN
  UPDATE accesos_otorgados SET updated_at = datetime('now') WHERE id = NEW.id;
END;
