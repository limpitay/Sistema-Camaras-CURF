-- Jerarquía normalizada edificio -> piso -> área (en vez de texto libre en
-- cada cámara), para que el inventario no dependa de que todos tipeen el
-- nombre del edificio exactamente igual, y para poder armar selects en cascada
-- en el alta de cámaras.
CREATE TABLE edificios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE
);

CREATE TABLE pisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  edificio_id INTEGER NOT NULL REFERENCES edificios(id) ON DELETE RESTRICT,
  nombre TEXT NOT NULL,
  UNIQUE (edificio_id, nombre)
);

CREATE TABLE areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  piso_id INTEGER NOT NULL REFERENCES pisos(id) ON DELETE RESTRICT,
  nombre TEXT NOT NULL,
  UNIQUE (piso_id, nombre)
);

CREATE INDEX idx_pisos_edificio ON pisos(edificio_id);
CREATE INDEX idx_areas_piso ON areas(piso_id);
