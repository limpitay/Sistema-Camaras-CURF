-- Historial diario de almacenamiento del Panel NVR > Metricas: un punto por
-- NVR por dia (fecha en hora Argentina), para poder graficar la evolucion del
-- espacio ocupado en el tiempo. Se completa solo cuando alguien actualiza ese
-- NVR (GET /:id/estado) -- no hay booster retroactivo, el historial arranca
-- a partir de que esto se despliega.
CREATE TABLE nvr_historial_diario (
  nvr_id INTEGER NOT NULL REFERENCES nvrs(id) ON DELETE CASCADE,
  fecha TEXT NOT NULL,
  ocupado_gb REAL NOT NULL,
  capacidad_gb REAL NOT NULL,
  PRIMARY KEY (nvr_id, fecha)
);
