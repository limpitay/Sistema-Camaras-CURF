# Sistema de Cámaras CURF

Panel interno de gestión de accesos a cámaras de seguridad: inventario, flujo de solicitud/aprobación por Dirección, y cola de aplicación manual en HikCentral por Sistemas.

La especificación funcional completa está en [ESPECIFICACION.md](ESPECIFICACION.md) — léela antes de tocar el modelo de datos o el flujo de aprobación, tiene el razonamiento detrás de cada regla de negocio.

## Stack

- Backend: Node.js + Express 5, SQLite vía `better-sqlite3` (sin ORM), migraciones con un runner propio (`backend/src/migrate.js`).
- Frontend: React 19 + Vite, React Router.
- Auth: Google Workspace OAuth (pendiente de credenciales — ver "Login mientras tanto" abajo) + JWT propio de sesión.
- Infra: Docker Compose (API con la base SQLite en un volumen, frontend con nginx).

## Levantar en desarrollo

```bash
cp .env.example .env        # completar JWT_SECRET como mínimo
docker compose up --build
```

- API: http://localhost:3001
- Frontend: http://localhost:8080

Las migraciones corren solas al levantar el contenedor `api` (son idempotentes — llevan registro de lo aplicado en la tabla `_migrations`). Para correrlas a mano:

```bash
cd backend
npm run migrate:up
```

La base es un único archivo (`backend/data/camaras.db` en desarrollo local, o el volumen `sqlite_data` en Docker). No hay servidor de base de datos aparte que levantar.

## Login mientras no hay credenciales de Google OAuth

El login con Google está implementado pero deshabilitado hasta que exista un `GOOGLE_CLIENT_ID` (ver sección 9 de la especificación). Mientras tanto:

1. Cargá al menos un usuario a mano en la base (rol `admin`, para poder cargar el resto desde la UI después). Con el archivo SQLite ya migrado:
   ```bash
   sqlite3 backend/data/camaras.db "INSERT INTO usuarios (email_institucional, nombre, rol) VALUES ('vos@curf.ucc.edu.ar', 'Tu Nombre', 'admin');"
   ```
2. En el login del frontend, usá el formulario "Login de desarrollo" con ese email. Solo funciona con `NODE_ENV != production` en el backend (ver `.env.example`).

## Estructura

```
backend/
  src/
    routes/        auth, usuarios, ubicaciones (edificios/pisos/areas), camaras, solicitudes, accesos
    middleware/     auth (JWT) y requireRole (control de acceso por rol)
    utils/          notificaciones.js (RF-24/25/26 — falta conectar SMTP real)
    migrate.js      runner de migraciones (aplica los .sql de migrations/ en orden)
  migrations/       esquema completo, uno o dos archivos .sql por grupo de tablas
frontend/
  src/
    pages/          una página por vista de la sección 4 de la spec
    components/     Layout (nav por rol) y UbicacionSelector (selects en cascada edificio→piso→área)
    context/        AuthContext (login Google / dev, sesión JWT)
```

## Modelo de datos: notas sobre el esquema

- La ubicación de una cámara está normalizada en tres tablas (`edificios` → `pisos` → `areas`) en vez de texto libre, para que el inventario no dependa de que todos tipeen el nombre del edificio exactamente igual.
- Una solicitud (`solicitudes`) se aprueba o rechaza **completa**, no cámara por cámara: el estado vive en la cabecera, y `solicitud_camaras` es una tabla puente sin estado propio. "Aprobar en lote" (RF-13) significa resolver varias solicitudes de golpe (`POST /solicitudes/resolver-lote`), no aprobar algunas cámaras sí y otras no dentro del mismo pedido.
- Las migraciones de este proyecto son solo hacia adelante (no hay rollback automático) — para un panel interno de bajo volumen alcanza; un cambio de esquema se resuelve con una migración nueva, no revirtiendo la anterior.

## Pendiente antes de producción

Ver sección 9 de [ESPECIFICACION.md](ESPECIFICACION.md): ubicación del servidor, certificado HTTPS interno, credenciales de Google OAuth, listado de emails a notificar, y altas iniciales de usuarios con rol Dirección. Además, falta conectar un proveedor SMTP real en `backend/src/utils/notificaciones.js` (hoy solo loguea).
