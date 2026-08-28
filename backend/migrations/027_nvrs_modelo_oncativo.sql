-- Modelo confirmado (pantalla Basic Information del NVR) para los 4 equipos
-- Hikvision de Oncativo.
UPDATE nvrs SET modelo = 'DS-7732NXI-K4(D)' WHERE hostname IN ('NVR#1', 'NVR#2', 'NVR#3', 'NVR#4');
