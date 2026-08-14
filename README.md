# Sistema de Cámaras CURF

Panel interno de gestión de accesos a cámaras de seguridad: inventario, flujo de solicitud/aprobación por Dirección, y cola de aplicación manual en HikCentral por Sistemas.

La especificación funcional completa está en [ESPECIFICACION.md](ESPECIFICACION.md) — léela antes de tocar el modelo de datos o el flujo de aprobación, tiene el razonamiento detrás de cada regla de negocio.

## Stack

- Backend: Node.js + Express 5, SQLite vía `better-sqlite3` (sin ORM), migraciones con un runner propio (`backend/src/migrate.js`).
- Frontend: React 19 + Vite, React Router.
- Auth: login institucional por código de un solo uso enviado por email (ver "Login" abajo) + JWT propio de sesión. Google Workspace OAuth está implementado como alternativa pero deshabilitado hasta tener credenciales.
- Acceso restringido a la LAN del hospital por rango de IP (`LAN_CIDR`, ver más abajo).
- Infra: Docker Compose (API con la base SQLite en un volumen, frontend con nginx).

## Levantar en desarrollo

```bash
cp .env.example .env        # completar JWT_SECRET como mínimo
docker compose up --build
```

- API: http://localhost:3088
- Frontend: http://localhost:8088

Las migraciones corren solas al levantar el contenedor `api` (son idempotentes — llevan registro de lo aplicado en la tabla `_migrations`). Para correrlas a mano:

```bash
cd backend
npm run migrate:up
```

La base es un único archivo (`backend/data/camaras.db` en desarrollo local, o el volumen `app_data` en Docker). No hay servidor de base de datos aparte que levantar.

El primer usuario admin se da de alta solo al levantar el contenedor `api` (`backend/src/seedAdmin.js`, idempotente) usando `ADMIN_EMAIL` / `ADMIN_NOMBRE` del `.env`. El resto de los usuarios se cargan desde el panel (CRUD → sección de usuarios, rol admin).

## Login

Método principal — **código de un solo uso por email**, no depende de tener Google Workspace configurado:

1. En `/login`, el usuario pone su email institucional (tiene que existir antes como usuario activo — ver arriba) y pide un código.
2. `POST /api/auth/solicitar-codigo` genera un código de 6 dígitos, vence en 10 minutos y es de un solo uso. **Si no hay `SMTP_HOST` configurado en `.env`, el código no se manda por mail — queda impreso en el log del contenedor** (`docker logs sistema-camaras-api`), justamente para poder probar el login antes de tener un SMTP institucional armado.
3. El usuario carga el código en `/login` y `POST /api/auth/verificar-codigo` lo valida y devuelve la sesión (JWT).

Alternativas, ambas ya implementadas:
- **Google OAuth** (`POST /api/auth/google`): deshabilitado hasta setear `GOOGLE_CLIENT_ID` / `GOOGLE_HOSTED_DOMAIN` en `.env`.
- **Login de desarrollo** (`POST /api/auth/dev-login`): entra directo con un email ya cargado, sin código ni contraseña. Se apaga solo si `NODE_ENV=production`, sin importar el resto del `.env` — para que un `.env` mal copiado no abra un bypass de autenticación en el hospital.

## Acceso restringido a la LAN

`LAN_CIDR` en `.env` acepta uno o más rangos separados por coma (ej. `192.168.8.0/21,127.0.0.1/32`); cualquier pedido que no venga de ahí recibe 403 (`backend/src/middleware/restringirRedLocal.js`). Vacío = sin restricción (así funciona un `.env` de desarrollo sin tocar nada).

Para que esto funcione, **la API no debe exponerse directo a la red** — en `docker-compose.yml` el puerto de la API está pegado a `127.0.0.1` (`"127.0.0.1:3088:3001"`), y todo el tráfico de la LAN entra por nginx (`8088`), que es el único punto donde la IP del cliente no se puede falsificar (nginx pisa `X-Forwarded-For` con la IP real en `nginx.conf`). Si se vuelve a exponer la API a la red, cualquiera podría pegarle directo y falsificar ese header para saltarse el filtro.

## Estructura

```
backend/
  src/
    routes/        auth, usuarios, ubicaciones (edificios/pisos/areas), camaras, nvrs,
                    cuentasNvr (cuentas NVR/HikCentral y sus accesos), solicitudes, accesos
    middleware/     auth (JWT), requireRole (por rol) y restringirRedLocal (por IP de LAN)
    mailer.js       envío del código de login por SMTP (o log si no hay SMTP configurado)
    utils/          notificaciones.js (RF-24/25/26 — todavía sin SMTP real conectado;
                    es un mailer aparte del de login, para avisos de solicitudes)
    migrate.js      runner de migraciones (aplica los .sql de migrations/ en orden)
    seedAdmin.js    alta idempotente del primer usuario admin (ADMIN_EMAIL/ADMIN_NOMBRE)
  migrations/       esquema completo, uno o dos archivos .sql por grupo de tablas
frontend/
  src/
    pages/          Login, InventarioAdmin (solo lectura), Crud (alta/edición de Cámaras/
                    NVR/Edificio/Piso/Área), AccesosNvr (cuentas NVR y sus permisos por
                    cámara), VistaMandoMedio, MisSolicitudes, Solicitudes, Historial,
                    PendientesHikCentral
    components/     Layout (nav por rol) y UbicacionSelector
    context/        AuthContext (login por código / Google / dev, sesión JWT)
```

## Modelo de datos: notas sobre el esquema

- `edificios`, `pisos` y `areas` son catálogos **globales e independientes entre sí** (no una jerarquía edificio→piso→área): un piso no pertenece a un edificio puntual, ni un área a un piso. Cámaras y NVRs referencian directamente `edificio_id`, `piso_id` y `area_id` cada uno. Se eligió así porque un piso (ej. "1er Piso") o un área (ej. "Farmacia") se repiten igual en varios edificios, y duplicarlos por edificio era puro ruido para cargar datos.
- `cuentas_nvr` (logins configurados en el NVR/HikCentral real — "vigilancia", "sistemas", etc., no usuarios de este panel) y `accesos_nvr` (qué cámara ve cada cuenta, en vivo/reproducción por separado) llevan un estado propio `pendiente`/`concedido`: un acceso nuevo creado desde el panel es un borrador (`pendiente`) hasta que alguien lo aplica a mano en el equipo real y lo marca `concedido` — no se asume que crear el registro acá ya lo aplicó en el hardware.
- Una solicitud (`solicitudes`) se aprueba o rechaza **completa**, no cámara por cámara: el estado vive en la cabecera, y `solicitud_camaras` es una tabla puente sin estado propio. "Aprobar en lote" (RF-13) significa resolver varias solicitudes de golpe (`POST /solicitudes/resolver-lote`), no aprobar algunas cámaras sí y otras no dentro del mismo pedido.
- No hay DELETE de cámaras a propósito (RNF-06): dar de baja es marcarla `inactiva`, para no romper el historial de solicitudes/accesos que ya la referencian.
- Las migraciones de este proyecto son solo hacia adelante (no hay rollback automático) — para un panel interno de bajo volumen alcanza; un cambio de esquema se resuelve con una migración nueva, no revirtiendo la anterior.

## Pendiente antes de producción

Ver sección 9 de [ESPECIFICACION.md](ESPECIFICACION.md): ubicación del servidor, certificado HTTPS interno, listado de emails a notificar, y altas iniciales de usuarios con rol Dirección. Además:

- Falta conectar un SMTP real para que el código de login se mande por email de verdad (`SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS`/`SMTP_FROM` en `.env` — mientras tanto el código queda en el log del backend).
- Falta conectar un SMTP real en `backend/src/utils/notificaciones.js` (avisos de solicitudes — hoy solo loguea; es un canal aparte del mailer de login).
- Confirmar el/los rango(s) de `LAN_CIDR` con todas las VLANs de clientes del hospital, no solo la de la PC donde se armó esto.
