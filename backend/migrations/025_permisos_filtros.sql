-- Tercera pata de Configuración → Roles y permisos, además de paneles y
-- columnas: qué filtros (los desplegables arriba de cada tabla en Recursos)
-- ve cada rol. Mismo criterio que permisos_columnas — ausencia de fila =
-- visible, solo se guardan las filas ocultas (ver 024_permisos_ui.sql).
CREATE TABLE permisos_filtros (
  rol TEXT NOT NULL,
  tabla TEXT NOT NULL,
  filtro TEXT NOT NULL,
  visible INTEGER NOT NULL DEFAULT 1 CHECK (visible IN (0, 1)),
  PRIMARY KEY (rol, tabla, filtro)
);
