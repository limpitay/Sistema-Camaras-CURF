-- Login por contraseña usa un nombre de usuario corto (ej. "llimpitay"), no
-- el email institucional completo — más cómodo de tipear/recordar. Nullable
-- a propósito, igual que password_hash: los usuarios existentes no tienen
-- uno hasta que un admin se lo asigne (POST/PATCH /api/usuarios); mientras
-- tanto siguen entrando por código o Google, que se identifican por email.
-- UNIQUE permite múltiples NULL en SQLite, así que no rompe a los que
-- todavía no tienen usuario asignado.
ALTER TABLE usuarios ADD COLUMN usuario TEXT;
CREATE UNIQUE INDEX idx_usuarios_usuario ON usuarios(usuario);
