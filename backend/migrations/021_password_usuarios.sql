-- Login alternativo por email + contraseña (a pedido, además del código por
-- email y Google). Nullable a propósito: los usuarios existentes no tienen
-- contraseña hasta que un admin/avanzado les asigne una (POST/PATCH
-- /api/usuarios) — mientras tanto siguen entrando por código o Google.
ALTER TABLE usuarios ADD COLUMN password_hash TEXT;
