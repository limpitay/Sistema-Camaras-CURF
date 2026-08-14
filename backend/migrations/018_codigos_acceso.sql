-- Login institucional por código de un solo uso enviado por email (en vez de
-- depender de que Google Workspace esté configurado). El código se guarda
-- hasheado (nunca en texto plano) y expira solo; una vez usado no sirve más.
CREATE TABLE codigos_acceso (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT NOT NULL,
  codigo_hash TEXT NOT NULL,
  expira_en TEXT NOT NULL,
  usado INTEGER NOT NULL DEFAULT 0 CHECK (usado IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_codigos_acceso_email ON codigos_acceso(email);
