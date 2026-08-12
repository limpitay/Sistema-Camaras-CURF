-- RF-10/RF-11/RF-13: la solicitud es la unidad de aprobación (estado vive en
-- la cabecera, no por cámara) — Dirección aprueba o rechaza el pedido
-- completo, individualmente o en lote (varias solicitudes a la vez).
-- `solicitud_camaras` es una tabla puente simple, sin estado propio.
--
-- Nota: como `usuario_id` vive en `solicitudes` y no en `solicitud_camaras`,
-- la regla "no duplicar una solicitud pendiente para el mismo usuario+cámara"
-- (RF-12) no se puede expresar como constraint único de base de datos acá
-- (sí se puede, y se hace, para accesos_otorgados — ver 005). Para
-- solicitudes queda como validación de aplicación en la ruta POST /solicitudes.
CREATE TABLE solicitudes (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  usuario_id INTEGER NOT NULL REFERENCES usuarios(id) ON DELETE RESTRICT,
  estado TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'rechazada')),
  comentario TEXT,
  fecha_solicitud TEXT NOT NULL DEFAULT (datetime('now')),
  fecha_resolucion TEXT,
  resuelto_por INTEGER REFERENCES usuarios(id),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE solicitud_camaras (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  solicitud_id INTEGER NOT NULL REFERENCES solicitudes(id) ON DELETE CASCADE,
  camara_id INTEGER NOT NULL REFERENCES camaras(id) ON DELETE RESTRICT,
  UNIQUE (solicitud_id, camara_id)
);

CREATE INDEX idx_solicitudes_usuario ON solicitudes(usuario_id);
CREATE INDEX idx_solicitudes_estado ON solicitudes(estado);
CREATE INDEX idx_solicitud_camaras_camara ON solicitud_camaras(camara_id);
