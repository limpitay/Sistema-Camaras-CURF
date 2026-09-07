-- Credenciales del propio NVR (login admin de ISAPI, distinto de las
-- `cuentas_nvr` que son perfiles de visualizacion tipo "vigilancia") para que
-- el panel NVR pueda consultar el dispositivo en vivo (info, discos,
-- grabaciones) sin depender de que alguien las tenga a mano. Texto plano,
-- mismo criterio que camaras.usuario/contrasena (panel interno, solo
-- Admin/Avanzado llegan a esta pantalla).
ALTER TABLE nvrs ADD COLUMN usuario TEXT;
ALTER TABLE nvrs ADD COLUMN contrasena TEXT;
