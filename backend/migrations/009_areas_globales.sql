-- Las áreas pasan a ser un catálogo global (p. ej. "Sistemas", "Secretaría",
-- "Operaciones"): la misma área tiene que poder elegirse para una cámara de
-- cualquier edificio y piso, en vez de cargarla piso por piso como hasta
-- ahora. La ubicación física de la cámara pasa a `piso_id` directo en
-- `camaras` (el edificio se sigue derivando del piso); `area_id` queda como
-- categoría, ya no encadenada al piso a través de la tabla `areas`.
--
-- Se recrea `areas` en limpio (sin cámaras cargadas todavía en ningún clon
-- de este proyecto, no hay datos que migrar) y se agrega `piso_id` a
-- `camaras` sin NOT NULL a nivel de motor porque SQLite no permite agregar
-- una columna NOT NULL sin default vía ALTER TABLE — queda validado como
-- requerido en la ruta POST /camaras, igual que ya pasa con hostname.
DROP TABLE areas;

CREATE TABLE areas (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE
);

INSERT INTO areas (nombre) VALUES ('Operaciones'), ('Sistemas'), ('Secretaría');

ALTER TABLE camaras ADD COLUMN piso_id INTEGER REFERENCES pisos(id) ON DELETE RESTRICT;
CREATE INDEX idx_camaras_piso ON camaras(piso_id);
