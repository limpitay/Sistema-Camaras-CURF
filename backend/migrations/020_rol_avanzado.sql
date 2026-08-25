-- migrate:no-transaction — usuarios tiene FKs entrantes (cuentas_nvr,
-- solicitudes, accesos_otorgados, notificacion_destinatarios), así que el
-- DROP TABLE de más abajo necesita foreign_keys=OFF realmente aplicado, y
-- eso no funciona dentro de una transacción (ver migrate.js).
--
-- Nuevo rol "avanzado": mismo acceso que admin salvo los pocos endpoints de
-- borrado físico real (cuentas NVR, accesos NVR, NVR, edificios/pisos/áreas
-- — ver requireRole en esas rutas). SQLite no permite ALTER de un CHECK
-- existente, así que hay que reconstruir la tabla.
PRAGMA foreign_keys = OFF;

CREATE TABLE usuarios_new (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email_institucional TEXT NOT NULL COLLATE NOCASE UNIQUE,
  nombre TEXT NOT NULL,
  rol TEXT NOT NULL CHECK (rol IN ('admin', 'avanzado', 'sistemas_lectura', 'direccion', 'mando_medio')),
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

INSERT INTO usuarios_new (id, email_institucional, nombre, rol, activo, created_at, updated_at)
  SELECT id, email_institucional, nombre, rol, activo, created_at, updated_at FROM usuarios;

DROP TABLE usuarios;
ALTER TABLE usuarios_new RENAME TO usuarios;

CREATE TRIGGER trg_usuarios_updated_at
AFTER UPDATE ON usuarios
FOR EACH ROW
BEGIN
  UPDATE usuarios SET updated_at = datetime('now') WHERE id = NEW.id;
END;

PRAGMA foreign_keys = ON;
