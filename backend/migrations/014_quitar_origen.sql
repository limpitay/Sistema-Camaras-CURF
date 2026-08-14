-- Se saca `origen` (manual / api_hikcentral): quedó del scaffold inicial
-- pensando en una futura integración con la API de HikCentral (RF-23) que
-- todavía no existe, y hoy no aporta nada — todas las cámaras se cargan a
-- mano de cualquier forma.
ALTER TABLE camaras DROP COLUMN origen;
