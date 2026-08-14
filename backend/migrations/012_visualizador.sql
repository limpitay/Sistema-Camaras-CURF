-- Reemplaza el booleano `acceso_smartpss` por una clasificación real de qué
-- visualizador se usa para entrar a la cámara: el Client de HikCentral (con
-- sus credenciales da acceso a todas las cámaras que tiene alojadas) o
-- SmartPSS (para las que no están en HikCentral). No es "tiene o no tiene
-- SmartPSS" — son dos aplicaciones distintas, cada cámara entra por una sola.
ALTER TABLE camaras ADD COLUMN visualizador TEXT CHECK (visualizador IN ('hikcentral', 'smartpss'));

UPDATE camaras SET visualizador = 'smartpss' WHERE acceso_smartpss = 1;

ALTER TABLE camaras DROP COLUMN acceso_smartpss;
