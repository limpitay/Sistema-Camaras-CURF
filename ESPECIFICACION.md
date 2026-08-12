# Especificación de Requerimientos — Panel de Gestión de Accesos a Cámaras

> v3 — incorpora el modelo de datos definido por el usuario (jerarquía normalizada edificio→piso→área, solicitudes con estado de cabecera) y el cambio de motor de base de datos a SQLite. Los cambios respecto de versiones anteriores quedan documentados en la sección 10 (Registro de decisiones de diseño), con la razón de cada uno. Donde una decisión requiere que alguien del hospital confirme un dato (no una decisión de diseño), queda en la sección 9 (Puntos abiertos).

## 1. Objetivo

Desarrollar una aplicación web interna que centralice el inventario de cámaras de seguridad del hospital y gestione, mediante un flujo de solicitud/aprobación, qué usuarios (mandos medios) tienen acceso a visualizar qué cámaras — dejando un historial auditable de accesos vigentes.

## 2. Alcance

- Inventario único de cámaras (reemplaza planillas Excel actuales).
- Vista administrativa completa (equipo de Sistemas).
- Vista restringida para mandos medios, sin datos técnicos sensibles.
- Flujo de solicitud de acceso con aprobación.
- Historial de accesos otorgados, consultable por usuario o por cámara.
- El registro de accesos aprobados sirve como **insumo directo para que Sistemas cree/actualice usuarios y roles en HikCentral** (ver sección 4.5), aplicando ahí el acceso real a cada cámara.
- Carga de datos **manual** en esta primera etapa. Integración con la API de HikCentral queda **fuera de alcance por ahora**, pero el modelo de datos debe permitir incorporarla más adelante sin rediseño.
- Alta y gestión de usuarios del panel es **manual, a cargo del Administrador de Sistemas** (ver 4.0) — no hay autoregistro.

### Fuera de alcance (por ahora)
- Sincronización automática con HikCentral.
- Otorgamiento automático de permisos reales en HikCentral (la aprobación en el panel no aplica el permiso en HikCentral por sí sola; eso lo sigue haciendo Sistemas manualmente).
- Streaming de video en vivo dentro del panel.

## 3. Actores

| Actor | Rol | Acceso |
|---|---|---|
| Usuarios directivos / Dirección (2 a 6 personas, a confirmar) | Aprobador | Consulta de solicitudes, aprobar/rechazar solicitudes, revocar accesos ya otorgados |
| Administradores de Sistemas (1-2 personas) | Admin | Alta/baja/edición de cámaras, alta/gestión de usuarios del panel, aplicar en HikCentral los accesos ya aprobados por Dirección, consulta de historial completo |
| Personal de Sistemas (8 personas) | Solo lectura | Consulta de todo el inventario e historial (igual visibilidad que Admin), sin poder editar cámaras, gestionar usuarios ni resolver solicitudes |
| Mandos medios (~20-30 personas) | Solicitante | Vista restringida, solicitud de acceso a cámaras |

Autenticación de los cuatro roles vía **Google Workspace (OAuth)**, con el email institucional como identificador único de usuario. **La identidad la valida Google; el rol y la autorización para entrar al sistema los define el Administrador de Sistemas dentro del panel, no Google** (ver RF-01).

## 4. Requerimientos funcionales

### 4.0 Gestión de usuarios y roles (Admin)

Google Workspace OAuth confirma *quién es* la persona, pero no dice *qué puede hacer* en este sistema. Sin un paso explícito de autorización, cualquier persona con cuenta institucional podría loguearse y quedar en un estado indefinido. Por eso el alta de usuario es manual y previa al primer login:

- RF-01: El Administrador de Sistemas da de alta manualmente cada usuario del panel: email institucional, nombre completo, rol (`admin` | `sistemas_lectura` | `direccion` | `mando_medio`).
- RF-02: Si una persona intenta loguearse con Google y su email no está registrado (o está desactivado) en el panel, el login se rechaza con un mensaje ("No tenés acceso a este sistema, contactá a Sistemas") — **no se crea usuario automáticamente**.
- RF-03: El Administrador puede desactivar un usuario (baja lógica, no borrado físico — ver RNF-06). Un usuario desactivado no puede loguearse, pero su historial de solicitudes/accesos se conserva intacto.

### 4.1 Inventario de cámaras (Admin)
- RF-04: Alta, baja y edición de cámaras con los campos: hostname, descripción (nombre amigable — ver punto abierto de nomenclatura en sección 9), IP, MAC, edificio/piso/área (jerarquía normalizada, no texto libre — ver sección 6), switch al que conecta, observaciones, imagen/foto, NVR asociado, estado (`funcionando` | `a_reemplazar` | `nueva` | `dada_de_baja`). Edificios, pisos y áreas se dan de alta la primera vez que se necesitan (selección en cascada con opción de crear al vuelo), no como un paso separado.
- RF-05: Dar de baja una cámara es un cambio de estado a `dada_de_baja`, nunca un borrado físico si tiene solicitudes o accesos históricos asociados (ver RNF-06). Una cámara `dada_de_baja` no aparece en la vista de mandos medios ni es solicitable.
- RF-06: Carga de la foto/imagen de referencia de cada cámara (archivo o URL). Es de carga manual y se espera que se cargue una única vez por cámara; no se prevé que se sincronice automáticamente ni siquiera cuando se integre la API de HikCentral (ver sección 8).
- RF-07: Listado y búsqueda/filtro por edificio, piso, área, estado.

### 4.2 Vista restringida (Mando medio)
- RF-08: Listado de cámaras mostrando únicamente: nombre/hostname visible, imagen, edificio, piso, área, observaciones. **Nunca IP ni MAC** (filtrado en backend, no solo oculto en frontend).
- RF-09: Solo son visibles/solicitables las cámaras en estado `funcionando`. Cámaras `a_reemplazar`, `nueva` o `dada_de_baja` quedan fuera de esta vista (evita que se pida acceso a algo que todavía no existe o no anda).
- RF-10: El usuario puede seleccionar una o varias cámaras y enviar una solicitud de acceso en un solo envío.

### 4.3 Flujo de solicitud y aprobación

Una solicitud puede incluir varias cámaras a la vez (RF-10), pero se resuelve **como un todo**: el estado (`pendiente` | `aprobada` | `rechazada`) vive en la cabecera de la solicitud, no por cámara. Dirección aprueba o rechaza el pedido completo — no puede aprobar algunas cámaras de un mismo pedido y rechazar otras; si el mando medio necesita eso, hace pedidos separados.

- RF-11: Cada solicitud queda registrada con: usuario solicitante, fecha, comentario opcional, el listado de cámaras pedidas, estado, fecha de resolución y quién la resolvió.
- RF-12: No se permite crear una nueva solicitud que incluya una cámara para la que el usuario ya tiene una solicitud `pendiente`, o un acceso activo vigente. (Evita duplicados y ruido en el panel de Dirección.)
- RF-13: **Dirección** visualiza el panel de solicitudes pendientes, agrupadas por usuario, y es quien **aprueba o rechaza** cada solicitud (individual, o varias solicitudes de un saque con la misma resolución — "en lote" se refiere a resolver varios *pedidos* juntos, no a partir un mismo pedido en cámaras aprobadas y rechazadas). El Administrador de Sistemas solo puede ver este panel, no resolverlo.
- RF-14: Al aprobar una solicitud, se crea inmediatamente un registro en `accesos_otorgados` por cada cámara incluida, con `aplicado_en_hikcentral = false`. Es decir: "aprobado por Dirección" y "aplicado en HikCentral" son dos hechos distintos que se registran en momentos distintos (ver tabla de estados en 4.5).
- RF-15: Recién con el acceso aprobado por Dirección, el **Administrador de Sistemas** puede dar de alta el permiso real en HikCentral y marcar el acceso como "aplicado" (ver 4.5).
- RF-16: **Dirección** puede revocar (dar de baja) un acceso ya otorgado, aprobado o no en HikCentral. Revocar pone `activo = false`; si ya estaba aplicado en HikCentral, queda pendiente de que Sistemas lo dé de baja allí también (ver tabla de estados en 4.5). Un mando medio puede volver a solicitar una cámara que le fue rechazada o revocada sin restricciones (no hay período de enfriamiento).

### 4.4 Consulta e historial
- RF-17: Consulta de accesos vigentes por usuario (¿qué cámaras ve Pedro Roldán hoy?).
- RF-18: Consulta de accesos vigentes por cámara (¿quiénes ven la cámara X?).
- RF-19: Historial completo de solicitudes (incluye rechazadas y revocadas), no solo el estado actual. Como ninguna entidad se borra físicamente (ver RNF-06), este historial es completo por diseño, incluso si la cámara o el usuario involucrados fueron dados de baja después.

### 4.5 Aplicación del acceso en HikCentral
- RF-20: Cada acceso aprobado por Dirección debe mostrar toda la información que el Administrador de Sistemas necesita para crear o actualizar el usuario y el rol correspondiente en HikCentral: email institucional (identifica al usuario), nombre completo, y el listado de cámaras/hostnames a habilitar.
- RF-21: Vista de "pendientes de aplicar en HikCentral", que cubre **ambos sentidos**: altas aprobadas por Dirección todavía no cargadas en HikCentral, y bajas/revocaciones todavía no removidas de HikCentral. La tabla de estados de `accesos_otorgados` es:

  | `activo` | `aplicado_en_hikcentral` | Significado |
  |---|---|---|
  | `true` | `false` | Aprobado por Dirección, pendiente de alta en HikCentral |
  | `true` | `true` | Vigente y aplicado — estado normal de un acceso activo |
  | `false` | `true` | Revocado por Dirección, pendiente de baja en HikCentral |
  | `false` | `false` | Revocado antes de haber sido aplicado — Sistemas no tiene nada que hacer en HikCentral |

- RF-22: **Solo el Administrador de Sistemas puede marcar un registro como "aplicado"** (con fecha), una vez que efectivamente dio de alta el permiso en HikCentral — esa marca queda separada de "aprobado" (que es potestad de Dirección), distinguiendo "Dirección autorizó" de "Sistemas ya lo cargó en el sistema real". De la misma forma, solo el Administrador puede "confirmar baja aplicada" cuando remueve un acceso revocado de HikCentral (lo cual limpia el estado `false/true` a un archivo histórico, sin volver a aparecer en la vista de pendientes).
- RF-23 (a futuro, si se integra la API): este paso podría automatizarse — que el panel llame a la API de HikCentral y cree/actualice usuario, rol y permisos directamente al aprobar. Por ahora queda manual.

### 4.6 Notificaciones
- RF-24: Ante una nueva solicitud, se notifica por email a los destinatarios fijos configurados (ver RF-26) y a quienes tengan rol `direccion` (son quienes deben resolverla).
- RF-25: Ante la resolución de una solicitud (aprobada o rechazada), se notifica al usuario solicitante y a los destinatarios fijos configurados. Ante una aprobación específicamente, también se notifica a quienes tengan rol `admin` (son quienes deben aplicarla en HikCentral — evita que dependan de revisar la vista de pendientes manualmente).
- RF-26: La lista de destinatarios fijos (ej. ayuda@curf.ucc.edu.ar y otras a definir) se gestiona como datos, no hardcodeada en el código — una tabla simple editable por el Administrador, para poder agregar o quitar direcciones sin requerir un despliegue nuevo.

## 5. Requerimientos no funcionales

- RNF-01: **Acceso restringido a la LAN del hospital** — el servidor no debe ser alcanzable desde internet; la restricción se resuelve a nivel de red/firewall, no solo a nivel de aplicación. Nota: el flujo de login OAuth requiere que los clientes de la LAN tengan salida saliente a internet hacia los endpoints de Google (accounts.google.com) — confirmar con el equipo de red que el firewall permite ese tráfico saliente aunque el servidor en sí no sea alcanzable desde afuera.
- RNF-02: Autenticación exclusiva vía Google Workspace institucional (OAuth 2.0), sin usuarios/contraseñas propios. La autorización (rol, habilitación de acceso al sistema) es responsabilidad del panel, no de Google (ver RF-01/RF-02).
- RNF-03: Servido por HTTPS, incluso dentro de la LAN (certificado interno o equivalente).
- RNF-04: Escalabilidad soportada: 150 cámaras iniciales, ampliable a 300; ~40 usuarios totales. (Volumen bajo — no condiciona la elección de stack.)
- RNF-05: El modelo de datos debe permitir, a futuro, reemplazar la carga manual por sincronización vía API de HikCentral sin romper el esquema existente (ver sección 8).
- RNF-06: **Ninguna entidad con historial asociado se borra físicamente.** Cámaras y usuarios se dan de baja mediante cambio de estado (`estado = dada_de_baja` / `activo = false`), nunca `DELETE`. Esto garantiza que el historial de solicitudes y accesos (RF-19) sea siempre completo y consistente, incluso años después de que una cámara o un usuario dejen de estar activos.
- RNF-07: Integridad de datos: no puede existir más de un acceso activo (`activo = true`) para el mismo par (usuario, cámara) simultáneamente — se aplica como constraint a nivel de base de datos, no solo validación de aplicación.

## 6. Modelo de datos

Motor: **SQLite** (ver decisión #11 en sección 10). Los booleanos se guardan como `INTEGER` (0/1) por ser el tipo nativo de SQLite; la API los expone como `true`/`false` en el JSON.

**usuarios**
`id, email_institucional (unique, case-insensitive), nombre, rol (admin | sistemas_lectura | direccion | mando_medio), activo (bool, default true), created_at, updated_at`

**edificios**
`id, nombre (unique)`

**pisos**
`id, edificio_id (FK → edificios), nombre, orden (integer)` — único (edificio_id, nombre). `orden` existe porque "1er Piso" < "8vo Piso" < "Planta Baja" < "Subsuelo" alfabéticamente no es el orden físico real — ver decisión #15. Todo edificio nuevo arranca con el set estándar Subsuelo, Planta Baja, 1er a 8vo Piso (`orden` 0 a 9); pisos fuera de ese set (ej. "Terraza") se agregan al final.

**areas**
`id, piso_id (FK → pisos), nombre` — único (piso_id, nombre). Sin catálogo cerrado: el frontend sugiere nombres de sectores/departamentos ya usados en Sistema-Nomenclatura-CURF (autocompletado), pero Admin puede escribir cualquier nombre — ver decisión #16.

La ubicación de una cámara es esta jerarquía normalizada (edificio → piso → área) en vez de texto libre repetido en cada fila de `camaras` — ver decisión #12.

**camaras**
`id, hostname, descripcion (nombre amigable, nullable), ip, mac_address, area_id (FK → areas), switch_conectado, observaciones, imagen_url, nvr, estado (funcionando | a_reemplazar | nueva | dada_de_baja), origen (manual | api_hikcentral), created_at, updated_at`
- `imagen_url` se completa de dos formas posibles (RF-06 ya contemplaba "archivo o URL" desde la v1): subiendo un archivo jpg/png (`POST /api/camaras` como `multipart/form-data`, campo `imagen`, límite 5 MB — el archivo se guarda en el volumen `app_data` del backend y `imagen_url` queda apuntando a `/api/uploads/camaras/<archivo>`), o pegando una URL externa directamente. Si se manda archivo, éste tiene prioridad sobre una URL que se haya mandado junto.

**solicitudes** (cabecera — el estado vive acá, no por cámara)
`id, usuario_id (FK → usuarios, solicitante), estado (pendiente | aprobada | rechazada), comentario (nullable), fecha_solicitud, fecha_resolucion, resuelto_por (FK → usuarios, rol direccion), created_at`

**solicitud_camaras** (tabla puente, sin estado propio)
`id, solicitud_id (FK → solicitudes), camara_id (FK → camaras)` — único (solicitud_id, camara_id).
- Nota: como `usuario_id` no vive en esta tabla, la regla RF-12 ("no duplicar una solicitud pendiente para el mismo usuario+cámara") se valida en la aplicación, no como constraint de esta tabla — a diferencia de `accesos_otorgados`, donde sí es un constraint de base de datos (ver abajo).

**accesos_otorgados**
`id, solicitud_id (FK → solicitudes, nullable — nullable pensando en altas futuras vía sync API sin solicitud previa, RF-23), usuario_id, camara_id, fecha_otorgado, otorgado_por (FK → usuarios, rol direccion), activo (bool), fecha_revocacion, revocado_por (FK → usuarios, rol direccion), aplicado_en_hikcentral (bool, default false), fecha_aplicado, aplicado_por (FK → usuarios, rol admin), created_at, updated_at`
- Constraint (RNF-07): único (usuario_id, camara_id) `WHERE activo = 1` (índice único parcial — SQLite lo soporta igual que Postgres).

**notificacion_destinatarios**
`id, email, descripcion, activo (bool)`

## 7. Arquitectura propuesta

- **Hosting:** VM dentro de la red del hospital (a definir si en infraestructura existente o nueva).
- **Backend:** Node/Express (reutilizando criterios del sistema de nomenclatura CURF).
- **Base de datos:** SQLite vía `better-sqlite3` (decisión del usuario — ver sección 10, decisión #11). Es un único archivo, sin servidor de base de datos aparte; para 300 cámaras y 40 usuarios el volumen no es un problema, y los constraints únicos parciales (`WHERE activo = 1`) que necesita el modelo son totalmente soportados.
- **Frontend:** aplicación web liviana, dos vistas según rol.
- **Autenticación:** OAuth 2.0 con Google Workspace.

## 8. Camino de evolución hacia integración con API de HikCentral

1. Etapa actual: carga y edición manual de `camaras` (`origen = manual`).
2. Etapa futura: proceso de sincronización que consulte la API de HikCentral y actualice/cree registros con `origen = api_hikcentral`, sin afectar los campos gestionados manualmente (ej. observaciones, foto).
3. Los campos `switch`, `observaciones` e `imagen_url` siguen siendo de carga manual aún con la API integrada, ya que HikCentral no los provee. La foto se carga una única vez por cámara y no se prevé que la sincronización la sobrescriba.
4. Etapa futura (RF-23): la aplicación del acceso en HikCentral (hoy manual, RF-15/RF-22) podría automatizarse llamando a la API directamente al aprobar. El campo `solicitud_id` nullable en `accesos_otorgados` ya contempla que en ese momento pueda haber altas que no vengan de una solicitud previa.

## 9. Puntos abiertos a definir antes de arrancar

- [ ] Ubicación física/lógica del servidor (VM existente o nueva).
- [ ] Responsable de gestionar el certificado HTTPS interno.
- [ ] Listado inicial de emails para `notificacion_destinatarios` (además de ayuda@curf.ucc.edu.ar).
- [ ] Confirmar los emails institucionales concretos de las 2 a 6 personas con rol `direccion`, para el alta inicial de usuarios (RF-01).

## 10. Registro de decisiones de diseño

Cambios hechos con criterio de desarrollador senior, y por qué. Son reversibles si el negocio prefiere otra cosa — quedan documentados para que se puedan discutir, no para imponerlos.

### v1 → v2

| # | Decisión | Por qué |
|---|---|---|
| 1 | Alta de usuarios manual y previa (RF-01/02), login rechazado si el email no está pre-registrado | La v1 no definía quién asigna el rol tras el login con Google. Sin esto, cualquier cuenta institucional podría loguearse en un estado indefinido — es un hueco de seguridad, no un detalle. |
| 2 | Solicitud dividida en cabecera + detalle por cámara | La v1 permitía solicitar varias cámaras a la vez (RF-05 original) pero el modelo tenía `camara_id` singular en `solicitudes`. Sin la cabecera se pierde la noción de "esto se pidió junto", necesaria para agrupar en el panel de Dirección. (La forma concreta del detalle cambió en la v3 — ver decisión #13.) |
| 3 | `accesos_otorgados` se crea en el momento de la aprobación, no de la aplicación en HikCentral | La v1 no aclaraba cuándo nace ese registro. Definirlo en el momento de aprobación es lo único consistente con la vista de "pendientes de aplicar" (RF-21). |
| 4 | Tabla de verdad para `activo` + `aplicado_en_hikcentral`, incluyendo el caso "revocado antes de aplicar" | Sin esta tabla, dos desarrolladores distintos iban a interpretar los dos booleanos de forma distinta, especialmente el caso borde de revocar algo que Sistemas nunca llegó a cargar. |
| 5 | No se permite duplicar solicitudes pendientes ni accesos activos duplicados (RF-12, RNF-07) | Con 20-30 mandos medios pidiendo acceso libremente, sin esta regla el panel de Dirección se llena de ruido y pueden quedar accesos duplicados sin que nadie lo note. |
| 6 | Baja lógica en vez de borrado físico para cámaras y usuarios (RNF-06) | El historial auditable (RF-19) es un requisito explícito. Un `DELETE` rompe ese historial en cuanto se da de baja una cámara vieja o alguien deja la organización. |
| 7 | Notificar al solicitante al resolver, y a Sistemas al aprobar (RF-25) | La v1 solo notificaba a una casilla fija. Sin avisar al interesado, el flujo depende de que alguien chequee el panel manualmente — contradice el objetivo de auditabilidad y agilidad del sistema. |
| 8 | Lista de destinatarios de notificación como tabla editable, no hardcodeada (RF-26) | La propia v1 dejaba "otras direcciones a definir" como punto abierto — es información que va a cambiar con el tiempo, no debería requerir un despliegue de código para actualizarse. |
| 9 | Cámaras no `funcionando` no son solicitables por mandos medios (RF-09) | Evita pedidos de acceso a cámaras que todavía no existen o están fuera de servicio; era un hueco de regla de negocio en la v1. |
| 10 | Postgres recomendado por sobre SQLite (revertido en v3, ver #11) | En su momento, el diseño usaba constraints únicos parciales (`WHERE activo = true`) que solo Postgres soportaba con seguridad. Se determinó después que SQLite también los soporta — ver decisión #11. |

### v2 → v3 (a partir del diagrama de datos del usuario)

| # | Decisión | Por qué |
|---|---|---|
| 11 | Motor de base de datos: SQLite (vía `better-sqlite3`) en vez de Postgres | Decisión explícita del usuario. Se verificó que no rompe ningún requisito: SQLite soporta índices únicos parciales (`WHERE activo = 1`), triggers y CHECK constraints — todo lo que el modelo necesitaba de Postgres. Contrapartida real: no hay servidor de base de datos con el que Sistemas ya esté familiarizado (pgAdmin, backups con `pg_dump`, etc.) — el archivo `.db` se respalda copiándolo. |
| 12 | Ubicación de cámaras normalizada en `edificios` → `pisos` → `areas`, en vez de texto libre en la fila de la cámara | Viene del diagrama del usuario. Evita que "Edificio A" y "edificio a" terminen siendo dos edificios distintos en los filtros, y permite armar selects en cascada en el alta de cámaras en vez de que cada Admin tipee a mano. |
| 13 | Solicitudes con estado a nivel de cabecera + tabla puente `solicitud_camaras` sin estado propio, reemplazando el modelo de ítems con estado individual de la v2 | Viene del diagrama del usuario. Cambia el significado de "aprobar en lote" (RF-13): ahora es resolver varias *solicitudes* juntas con la misma decisión, no aprobar algunas cámaras sí y otras no dentro de un mismo pedido. Es un modelo más simple, a costa de esa flexibilidad fina — si en el uso real Dirección necesita aprobar parcialmente un pedido de varias cámaras, este es el primer lugar para reabrir la discusión. |
| 14 | Migraciones solo hacia adelante (runner propio en `backend/src/migrate.js`, sin rollback automático) | `node-pg-migrate` es específico de Postgres y no sirve para SQLite. Para un panel interno de bajo volumen, un runner simple que aplica `.sql` en orden y lleva registro de lo aplicado alcanza; no se justifica sumar una dependencia de migraciones más pesada solo para tener `down`. |
| 15 | `pisos` sembrado con Subsuelo, Planta Baja y 1er a 8vo Piso para cada edificio (seed + auto-alta en `POST /ubicaciones/edificios`) | Pedido explícito del usuario. Se sembraron también los 6 edificios reales que ya existen en Sistema-Nomenclatura-CURF (Jacinto Ríos, Oncativo, Audiología, Suipacha, Jockey, Odontología UCC — mismo catálogo, sin duplicar carga de datos), para que Sistemas no tenga que volver a tipearlos. |
| 16 | `areas` sin catálogo cerrado: se sugieren (autocompletado) los ~29 sectores/departamentos ya usados en Sistema-Nomenclatura-CURF, sin el código corto que usan allá (ej. "GUA") | Pedido explícito del usuario: reusar esos nombres como base, pero sin perder la libertad de crear áreas nuevas — a diferencia de `pisos`, acá no hay una lista cerrada porque una cámara puede estar en un área que no es un "sector" formal (ej. "Pasillo principal"). |

