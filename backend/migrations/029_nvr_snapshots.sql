-- Cache compartido del Panel NVR: guarda el resultado del ultimo "Actualizar"
-- (estado + canales via ISAPI) para que cualquier usuario que entre vea ese
-- dato al instante sin tener que re-consultar el NVR -- son equipos embebidos
-- que no soportan que cada usuario que abre la pantalla les pegue de nuevo.
-- Una fila por NVR, se pisa entera en cada actualizacion (sin historial).
CREATE TABLE nvr_snapshots (
  nvr_id INTEGER PRIMARY KEY REFERENCES nvrs(id) ON DELETE CASCADE,
  estado_json TEXT NOT NULL,
  canales_json TEXT NOT NULL,
  actualizado_en TEXT NOT NULL,
  actualizado_por TEXT
);
