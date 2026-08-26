-- Visibilidad de paneles (links del sidebar) y columnas de tabla por rol —
-- es una capa de UI (qué se muestra), no de autorización: no le da acceso a
-- nadie a algo que el backend ya le bloquea por rol (ver requireRole en las
-- rutas), solo permite ocultar cosas que ese rol ya podía ver de entrada.
-- Admin no tiene filas acá a propósito (ver src/permisosRegistro.js) — ve
-- todo siempre, para no poder autobloquearse el panel de configuración por
-- accidente.
--
-- Ausencia de fila = visible (default). Solo se guardan las filas que están
-- ocultas (visible = 0) — así el registro de paneles/columnas puede crecer
-- en el código sin tener que migrar filas nuevas acá.
CREATE TABLE permisos_paneles (
  rol TEXT NOT NULL,
  panel TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  PRIMARY KEY (rol, panel)
);

CREATE TABLE permisos_columnas (
  rol TEXT NOT NULL,
  tabla TEXT NOT NULL,
  columna TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  PRIMARY KEY (rol, tabla, columna)
);
