-- La cuenta NVR (vigilancia, sistemas, etc.) hasta ahora solo guardaba el
-- nombre de login, sin contraseña — así que cuando Sistemas iba a aplicar un
-- acceso pendiente en HikCentral, tenía que ir a buscar esa contraseña a
-- otro lado. Se agrega acá para que viaje junto con la cámara desde
-- Pendientes HikCentral (ver POST /accesos/pendientes-hikcentral en el
-- frontend, pantalla Accesos NVR).
ALTER TABLE cuentas_nvr ADD COLUMN contrasena TEXT;
