-- Consolida la identidad de login en una sola columna: `email_institucional`
-- pasa a llamarse `username`. Sigue guardando lo mismo que guardaba antes
-- (típicamente un email real, ej. "rodrigoziade@curf.ucc.edu.ar") para que
-- código-por-email y Google OAuth (que necesitan matchear un email real)
-- sigan funcionando para quien lo tenga cargado así — pero un admin también
-- puede cargar acá un nombre corto (ej. "llimpitay") para un usuario que solo
-- va a entrar con contraseña; código/Google simplemente no van a poder
-- resolverlo a partir de un email en ese caso, cosa esperada.
--
-- La columna `usuario` que había agregado 022_usuario_login.sql para esto
-- mismo queda redundante y se elimina — un solo campo, no dos. Para quien ya
-- tenía un `usuario` cargado (nombre corto para login por contraseña), ese
-- valor pasa a ser el nuevo username en vez del email — si no, se perdería
-- la identidad de login por contraseña que ya tenía asignada.
UPDATE usuarios SET email_institucional = usuario WHERE usuario IS NOT NULL;
DROP INDEX IF EXISTS idx_usuarios_usuario;
ALTER TABLE usuarios DROP COLUMN usuario;
ALTER TABLE usuarios RENAME COLUMN email_institucional TO username;
