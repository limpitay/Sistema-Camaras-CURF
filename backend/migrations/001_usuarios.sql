-- RF-01/RF-02/RF-03: usuarios se cargan a mano, no hay autoregistro. `activo`
-- es baja lógica (RNF-06) para no perder la autoría de solicitudes/accesos
-- pasados cuando alguien deja la organización.
CREATE TABLE usuarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_institucional TEXT NOT NULL COLLATE NOCASE UNIQUE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'sistemas_lectura', 'direccion', 'mando_medio')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER trg_usuarios_updated_at
AFTER UPDATE ON usuarios
FOR EACH ROW
BEGIN
  UPDATE usuarios SET updated_at = datetime('now') WHERE id = NEW.id;
END;
