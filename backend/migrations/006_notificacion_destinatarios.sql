-- RF-26: destinatarios fijos de notificación como datos, no hardcodeados en
-- el código — se pueden agregar/quitar sin desplegar de nuevo.
CREATE TABLE notificacion_destinatarios (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL COLLATE NOCASE UNIQUE,
  descripcion TEXT,
  activo INTEGER NOT NULL DEFAULT 1 CHECK (activo IN (0, 1))
);

INSERT INTO notificacion_destinatarios (email, descripcion)
VALUES ('ayuda@curf.ucc.edu.ar', 'Casilla de Sistemas (RF-11 / RF-24 / RF-25)');
