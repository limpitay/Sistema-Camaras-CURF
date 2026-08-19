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
    middleware/     auth (JWT), requireRole (por rol), restringirRedLocal (por IP de LAN)
                    y upload (multer + nombrado de fotos de cámara, ver "Fotos de cámaras")
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

## Fotos de cámaras

Las fotos subidas (RF-06) se guardan en `backend/data/uploads/camaras/` y se sirven en `/api/uploads/camaras/<archivo>`. El nombre de archivo no es un UUID: es `hostname_últimosDosOctetosDeIP.ext` (ej. `CAMCAPB26_0.172.jpg`), para poder ubicar la foto de una cámara a simple vista en la carpeta (`backend/src/middleware/upload.js`, función `nombreArchivoImagen`). Si el nombre calculado ya existe por otra cámara se le agrega un sufijo (`-2`, `-3`...); si es la propia cámara resubiendo su foto, se pisa el archivo anterior.

Las fotos subidas antes de que existiera este criterio (guardadas con UUID) se renombraron una única vez con `cd backend && npm run renombrar:imagenes` (idempotente, seguro de correr de nuevo). Reemplazar una foto sin borrar la cámara todavía deja el archivo viejo huérfano en el disco — no hay limpieza automática de esos casos.

## SQLite en modo WAL sobre bind mount de Windows — cuidado al reiniciar

`camaras.db` usa `journal_mode = WAL` (`backend/src/db.js`). Sobre un bind mount de Windows (Docker Desktop), esto tiene dos efectos a tener en cuenta:

- **Una segunda conexión al archivo mientras la API está corriendo puede fallar** con `SQLITE_CANTOPEN` ("unable to open database file") — pasa con `sqlite3` CLI, con una segunda instancia de `better-sqlite3`, o con el panel SQLite de VS Code si coincide con el momento justo. No es corrupción, es una limitación del filesystem compartido con el modo WAL. Para leer/escribir sin pelear con esto, hacelo a través de la propia API (loguearse con `POST /api/auth/dev-login` en desarrollo y pegarle a los endpoints), no abriendo el `.db` por afuera.
- **Un corte abrupto del proceso puede perder escrituras recientes** que todavía estaban solo en `camaras.db-wal` sin volcarse al archivo principal (nos pasó dos veces: perdió cambios de `imagen_url` y de `marca` después de un `docker stop`/rebuild). Por eso `backend/src/index.js` atiende `SIGTERM`/`SIGINT` y cierra la conexión SQLite prolijamente (fuerza el checkpoint) antes de salir. Si alguna vez hay que matar el contenedor a la fuerza (`docker kill`, corte de luz, etc.), verificar después que los últimos cambios hayan quedado guardados.
- Si necesitás copiar `camaras.db` para inspeccionarlo aparte (no para restaurar), copiá también `camaras.db-wal` y `camaras.db-shm` si existen — copiar solo el archivo principal puede dar una foto vieja, sin los últimos cambios.

## Backups

`scripts/backup-datos.ps1` copia `backend/data/` completo (base + `.env`) a `D:\BACKUP Sistema de Camaras CURF\<fecha>\` y borra automáticamente los backups de más de 30 días. Está programado con el Programador de tareas de Windows (`scripts/instalar-backup.ps1`, se corre una sola vez para dejarlo armado) para correr lunes/martes/jueves/viernes a las 7:00 am. Para correrlo a mano: doble clic en `scripts/ejecutar-backup-ahora.bat`.

Ese backup queda en un disco interno de la misma PC — protege contra que se rompa el disco `C:`, pero no contra que se pierda la PC entera (incendio, robo). Para eso hace falta copiar periódicamente esa carpeta a algo fuera de la máquina (OneDrive, un disco externo).

## Migrar a otra máquina / recuperar de un backup

`backend/data/` (la base `camaras.db` y las fotos subidas) y `.env` **no están en git a propósito** — son datos/secretos, no código (ver `.gitignore`). Clonar el repo en una PC nueva da el código solo; para tener todo lo que hay hoy hace falta restaurar esos dos del backup.

1. Clonar el repo y copiar la config:
   ```bash
   git clone <url-del-repo>
   cd Sistema-Camaras-CURF
   cp .env.example .env   # completar con los valores reales, o pisar con el .env del backup (paso 3)
   ```
2. Instalar Docker Desktop en la PC nueva si no lo tiene.
3. Restaurar los datos desde el backup más reciente (`D:\BACKUP Sistema de Camaras CURF\<fecha-más-nueva>\` u otra copia que se haya sacado de ahí):
   ```powershell
   # Desde la raíz del repo clonado
   New-Item -ItemType Directory -Force backend\data
   Copy-Item "<carpeta-backup>\camaras.db" backend\data\ -Force
   Copy-Item "<carpeta-backup>\uploads" backend\data\ -Recurse -Force
   Copy-Item "<carpeta-backup>\.env" . -Force   # si se quiere reusar el .env del backup en vez de completar uno nuevo
   ```
4. Levantar todo:
   ```bash
   docker compose up --build -d
   ```
   Las migraciones corren solas contra la base restaurada (son idempotentes, no pisan datos). No hace falta correr `seedAdmin` de nuevo si ya hay usuarios en la base restaurada.
5. Verificar en `http://localhost:8088` que entra y que el inventario de cámaras está completo.
6. Si se quiere, volver a armar el backup automático en la PC nueva: `scripts/instalar-backup.ps1` (ajustar la ruta `D:\BACKUP...` dentro de `scripts/backup-datos.ps1` si el disco de destino en la PC nueva es otro).

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
