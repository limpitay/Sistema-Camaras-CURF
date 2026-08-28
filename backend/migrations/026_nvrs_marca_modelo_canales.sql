-- Se agregan marca/modelo/canales_totales a nvrs para poder mostrar en
-- Recursos -> NVR cuantos canales estan en uso (cantidad_camaras, calculado
-- al vuelo como ya hacia SELECT_BASE) vs. disponibles (canales_totales -
-- cantidad_camaras), ademas de marca y modelo del equipo.
ALTER TABLE nvrs ADD COLUMN marca TEXT;
ALTER TABLE nvrs ADD COLUMN modelo TEXT;
ALTER TABLE nvrs ADD COLUMN canales_totales INTEGER;

-- Datos ya conocidos (marca Hikvision, canales totales por hostname); el
-- resto de los NVR no-Hikvision se carga despues a mano desde la UI.
UPDATE nvrs SET marca = 'Hikvision', canales_totales = 32 WHERE hostname = 'NVR JR';
UPDATE nvrs SET marca = 'Hikvision', canales_totales = 8 WHERE hostname = 'NVR SU';
UPDATE nvrs SET marca = 'Hikvision', canales_totales = 32 WHERE hostname IN ('NVR#1', 'NVR#2', 'NVR#3', 'NVR#4');
UPDATE nvrs SET marca = 'Hikvision', canales_totales = 32 WHERE hostname = 'NVR JK';
UPDATE nvrs SET marca = 'Hikvision', canales_totales = 16 WHERE hostname = 'NVR JK 2';
