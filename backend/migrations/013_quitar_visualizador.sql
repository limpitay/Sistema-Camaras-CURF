-- Se saca el campo `visualizador` (Client de HikCentral / SmartPSS): no
-- corresponde a ninguna columna real del inventario que se lleva fuera del
-- sistema, así que no tiene sentido seguir pidiéndolo acá.
ALTER TABLE camaras DROP COLUMN visualizador;
