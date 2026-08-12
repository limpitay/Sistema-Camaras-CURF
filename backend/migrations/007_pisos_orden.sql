-- Antes se ordenaba por nombre, pero "1er Piso" < "8vo Piso" < "Planta Baja" <
-- "Subsuelo" alfabéticamente no es el orden físico real. `orden` es explícito
-- para que el select de piso en el frontend liste de abajo hacia arriba.
ALTER TABLE pisos ADD COLUMN orden INTEGER NOT NULL DEFAULT 0;
