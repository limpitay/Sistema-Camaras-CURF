-- Los accesos_nvr importados hasta ahora reflejan lo que ya está configurado
-- en el NVR/HikCentral real, así que arrancan como 'concedido' por defecto.
-- Los que se creen de acá en más desde el panel son un borrador propio del
-- sistema (todavía no aplicado en el equipo real) y arrancan 'pendiente' —
-- eso lo controla el INSERT de la ruta, no este default.
ALTER TABLE accesos_nvr ADD COLUMN estado TEXT NOT NULL DEFAULT 'concedido' CHECK (estado IN ('pendiente', 'concedido'));
