-- Accesos configurados directamente en los NVR/HikCentral (listas de
-- permisos que ya existen en el equipo real, por fuera del flujo de
-- solicitudes de este panel). Las "cuentas NVR" (vigilancia, sistemas,
-- enfermeriaqx, lrapagnani, etc.) son logins del NVR, no necesariamente
-- personas con cuenta en este panel — por eso van en catálogo aparte de
-- `usuarios`, con un link opcional por si en algún momento se sabe que
-- corresponde a un usuario real cargado acá.
CREATE TABLE cuentas_nvr (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  nombre TEXT NOT NULL UNIQUE COLLATE NOCASE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TRIGGER trg_cuentas_nvr_updated_at
AFTER UPDATE ON cuentas_nvr
FOR EACH ROW
BEGIN
  UPDATE cuentas_nvr SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Grupo/Perfil (ej. "Grupo 3 - Seguridad") queda como texto de referencia,
-- no como entidad gestionable — es de dónde salió el acceso en el NVR, no
-- algo que se arme desde acá. en_vivo/reproduccion son dos permisos
-- independientes porque el NVR los maneja por separado.
CREATE TABLE accesos_nvr (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cuenta_id INTEGER NOT NULL REFERENCES cuentas_nvr(id) ON DELETE CASCADE,
  camara_id INTEGER NOT NULL REFERENCES camaras(id) ON DELETE CASCADE,
  grupo TEXT,
  en_vivo INTEGER NOT NULL DEFAULT 1 CHECK (en_vivo IN (0, 1)),
  reproduccion INTEGER NOT NULL DEFAULT 1 CHECK (reproduccion IN (0, 1)),
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (cuenta_id, camara_id)
);

CREATE INDEX idx_accesos_nvr_cuenta ON accesos_nvr(cuenta_id);
CREATE INDEX idx_accesos_nvr_camara ON accesos_nvr(camara_id);

CREATE TRIGGER trg_accesos_nvr_updated_at
AFTER UPDATE ON accesos_nvr
FOR EACH ROW
BEGIN
  UPDATE accesos_nvr SET updated_at = datetime('now') WHERE id = NEW.id;
END;

-- Canal del NVR al que está conectada la cámara (ej. "Canal 5") — dato que
-- trae este listado y que el inventario no tenía hasta ahora.
ALTER TABLE camaras ADD COLUMN canal INTEGER;
