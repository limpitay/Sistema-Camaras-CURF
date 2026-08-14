-- Los pisos pasan a ser un catálogo global (p. ej. "3er Piso"), con el mismo
-- criterio que ya se aplicó a las áreas (ver 009_areas_globales.sql): antes
-- cada edificio creaba su propia copia de "Subsuelo".."8vo Piso" (60 filas
-- duplicadas entre los 6 edificios sembrados), así que borrar o renombrar un
-- piso significaba repetirlo edificio por edificio. Ahora es una sola fila
-- por nombre de piso, y edificio + piso se eligen como dos selects
-- independientes (ya no en cascada) al ubicar una cámara o un NVR.
--
-- A diferencia de 009/010, para esta migración sí puede haber cámaras y/o
-- NVRs ya cargados (no es un paso de scaffold inicial), así que acá se
-- preserva su edificio_id/piso_id en vez de asumir tablas vacías.
--
-- defer_foreign_keys pospone la validación de FK hasta el COMMIT de esta
-- transacción (en vez de en cada statement): sin esto, el DROP TABLE pisos
-- del paso 3 falla apenas hay una fila en camaras/nvrs que todavía la
-- referencia — cosa que antes (009/010) no pasaba porque esas tablas
-- arrancaban vacías.
PRAGMA defer_foreign_keys = ON;

-- 1. edificio_id pasa a vivir directo en camaras/nvrs (antes se derivaba del
--    piso); se completa leyendo el edificio_id que todavía tiene la tabla
--    pisos vieja, antes de recrearla.
ALTER TABLE camaras ADD COLUMN edificio_id INTEGER REFERENCES edificios(id) ON DELETE RESTRICT;
ALTER TABLE nvrs ADD COLUMN edificio_id INTEGER REFERENCES edificios(id) ON DELETE RESTRICT;

UPDATE camaras SET edificio_id = (SELECT edificio_id FROM pisos WHERE pisos.id = camaras.piso_id);
UPDATE nvrs SET edificio_id = (SELECT edificio_id FROM pisos WHERE pisos.id = nvrs.piso_id);

-- 2. El id del piso va a cambiar al recrear la tabla en limpio, así que se
--    guarda el nombre (columna temporal) para poder remapear después.
ALTER TABLE camaras ADD COLUMN _piso_nombre_temp TEXT;
ALTER TABLE nvrs ADD COLUMN _piso_nombre_temp TEXT;
UPDATE camaras SET _piso_nombre_temp = (SELECT nombre FROM pisos WHERE pisos.id = camaras.piso_id);
UPDATE nvrs SET _piso_nombre_temp = (SELECT nombre FROM pisos WHERE pisos.id = nvrs.piso_id);

-- 3. Recrear pisos como catálogo global.
DROP TABLE pisos;

CREATE TABLE pisos (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
  orden INTEGER NOT NULL DEFAULT 0
);

INSERT INTO pisos (nombre, orden) VALUES
  ('Subsuelo', 0), ('Planta Baja', 1), ('1er Piso', 2), ('2do Piso', 3),
  ('3er Piso', 4), ('4to Piso', 5), ('5to Piso', 6), ('6to Piso', 7),
  ('7mo Piso', 8), ('8vo Piso', 9);

-- 4. Si alguna cámara/NVR usaba un piso manual fuera del set estándar (ej.
--    "Terraza"), ese nombre también entra al catálogo global para no perderlo.
INSERT OR IGNORE INTO pisos (nombre, orden)
SELECT DISTINCT _piso_nombre_temp, 99 FROM camaras WHERE _piso_nombre_temp IS NOT NULL
UNION
SELECT DISTINCT _piso_nombre_temp, 99 FROM nvrs WHERE _piso_nombre_temp IS NOT NULL;

-- 5. Remapear piso_id de cada cámara/NVR al id nuevo del piso con ese nombre.
UPDATE camaras SET piso_id = (SELECT id FROM pisos WHERE pisos.nombre = camaras._piso_nombre_temp)
WHERE _piso_nombre_temp IS NOT NULL;
UPDATE nvrs SET piso_id = (SELECT id FROM pisos WHERE pisos.nombre = nvrs._piso_nombre_temp)
WHERE _piso_nombre_temp IS NOT NULL;

ALTER TABLE camaras DROP COLUMN _piso_nombre_temp;
ALTER TABLE nvrs DROP COLUMN _piso_nombre_temp;

CREATE INDEX idx_camaras_edificio ON camaras(edificio_id);
CREATE INDEX idx_nvrs_edificio ON nvrs(edificio_id);
