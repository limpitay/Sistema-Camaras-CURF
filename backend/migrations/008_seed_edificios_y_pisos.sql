-- Edificios reales de CURF, el mismo catálogo que ya existe en
-- Sistema-Nomenclatura-CURF (docker/db/init.sql, tabla `buildings`) — se
-- reutiliza para no hacer escribir de nuevo algo que Sistemas ya cargó una vez.
INSERT INTO edificios (nombre) VALUES
  ('Jacinto Ríos'),
  ('Oncativo'),
  ('Audiología'),
  ('Suipacha'),
  ('Jockey'),
  ('Odontología UCC');

-- Pisos estándar (Subsuelo a 8vo piso, con Planta Baja) para cada uno de esos
-- edificios. Cualquier edificio que se cree después de esta migración recibe
-- este mismo set automáticamente (ver POST /api/ubicaciones/edificios).
INSERT INTO pisos (edificio_id, nombre, orden)
SELECT e.id, p.nombre, p.orden
FROM edificios e
CROSS JOIN (
  SELECT 'Subsuelo' AS nombre, 0 AS orden
  UNION ALL SELECT 'Planta Baja', 1
  UNION ALL SELECT '1er Piso', 2
  UNION ALL SELECT '2do Piso', 3
  UNION ALL SELECT '3er Piso', 4
  UNION ALL SELECT '4to Piso', 5
  UNION ALL SELECT '5to Piso', 6
  UNION ALL SELECT '6to Piso', 7
  UNION ALL SELECT '7mo Piso', 8
  UNION ALL SELECT '8vo Piso', 9
) p
WHERE e.nombre IN ('Jacinto Ríos', 'Oncativo', 'Audiología', 'Suipacha', 'Jockey', 'Odontología UCC');
