-- El 2026-08-14 se pudo crear un segundo NVR con el mismo hostname ("NVR#1")
-- porque no había ninguna restricción de unicidad, y al borrar el original
-- (ON DELETE SET NULL en camaras.nvr_id) las cámaras que apuntaban a él
-- quedaron "Sin NVR" sin ningún aviso. Se agrega UNIQUE (igual criterio que
-- cuentas_nvr.nombre) para que el backend rechace el duplicado en vez de
-- crearlo silenciosamente.
CREATE UNIQUE INDEX idx_nvrs_hostname_unico ON nvrs(hostname COLLATE NOCASE);
