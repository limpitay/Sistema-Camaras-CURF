// Fuente unica de verdad de que paneles y que columnas de tabla existen y
// pueden ocultarse por rol (ver 024_permisos_ui.sql). Los paneles aca tienen
// que coincidir con los roles permitidos en las rutas del frontend
// (App.jsx) — esto solo puede OCULTAR algo del maximo que un rol ya podia
// ver por esas rutas, nunca agregar acceso nuevo.
//
// admin queda afuera a proposito: ve todo siempre, no configurable (para no
// poder autobloquearse el panel de configuracion).
const ROLES_CONFIGURABLES = ['avanzado', 'sistemas_lectura', 'direccion', 'mando_medio'];

// Los recursos-* son las pestanas de adentro de "Recursos" (Crud.jsx) — se
// muestran anidadas bajo el panel "recursos" en Roles y permisos. Si
// "recursos" esta oculto, sus hijos no importan (el grupo entero desaparece
// del sidebar, ver Layout.jsx), pero quedan igual como overrides propios
// para no perder la seleccion si mas adelante se vuelve a mostrar el grupo.
const PANELES_POR_ROL = {
  avanzado: [
    'dashboard', 'recursos', 'accesos-nvr', 'usuarios',
    'recursos-camaras', 'recursos-nvrs', 'recursos-edificios', 'recursos-pisos', 'recursos-areas',
  ],
  // sistemas_lectura solo llega a Recursos → Camaras y NVR, nunca a
  // Edificios/Pisos/Areas ni a las acciones de alta/edicion (esas rutas del
  // backend siguen exclusivas de admin/avanzado — ver camaras.js/nvrs.js —
  // asi que en Crud.jsx los botones de Agregar/Editar quedan ocultos para
  // este rol, no solo el panel).
  sistemas_lectura: ['dashboard', 'recursos', 'recursos-camaras', 'recursos-nvrs', 'accesos-nvr'],
  direccion: ['accesos-nvr'],
  mando_medio: ['camaras', 'mis-solicitudes'],
};

const PANEL_LABEL = {
  dashboard: 'Dashboard',
  recursos: 'Recursos',
  'accesos-nvr': 'Accesos NVR',
  usuarios: 'Usuarios',
  camaras: 'Camaras disponibles',
  'mis-solicitudes': 'Mis solicitudes',
  'recursos-camaras': 'Camaras',
  'recursos-nvrs': 'NVR',
  'recursos-edificios': 'Edificios',
  'recursos-pisos': 'Pisos',
  'recursos-areas': 'Areas',
};

const TABLAS_COLUMNAS = {
  camaras: {
    label: 'Camaras',
    columnas: {
      hostname: 'Hostname', ip: 'IP', mac: 'MAC', edificio: 'Edificio', piso: 'Piso',
      area: 'Area', descripcion: 'Descripcion', marca: 'Marca', estado: 'Estado', nvr: 'NVR',
      usuario: 'Usuario (camara)', contrasena: 'Contrasena (camara)',
    },
  },
  nvrs: {
    label: 'NVR',
    columnas: { hostname: 'Hostname', ip: 'IP', mac: 'MAC', edificio: 'Edificio', piso: 'Piso', camaras: 'Camaras' },
  },
  edificios: {
    label: 'Edificios',
    columnas: { nombre: 'Nombre', camaras: 'Camaras', nvrs: 'NVRs' },
  },
  pisos: {
    label: 'Pisos',
    columnas: { nombre: 'Nombre', camaras: 'Camaras', nvrs: 'NVRs' },
  },
  areas: {
    label: 'Areas',
    columnas: { nombre: 'Nombre', camaras: 'Camaras' },
  },
  usuarios: {
    label: 'Usuarios',
    columnas: { nombre: 'Nombre', username: 'Usuario', rol: 'Rol', password: 'Contrasena', estado: 'Estado' },
  },
};

// Filtros (los desplegables arriba de cada tabla en Recursos) visibles por
// tabla — mismo criterio hide-only que columnas. Solo entran aca los que ya
// estan habilitados por defecto en el frontend (Crud.jsx): Edificios y Pisos
// no tienen ninguno mas para ocultar (ya se sacaron todos a pedido), asi que
// no aparecen en este registro.
const TABLAS_FILTROS = {
  camaras: {
    label: 'Camaras',
    filtros: { edificio: 'Edificio', piso: 'Piso', area: 'Area', nvr: 'NVR', marca: 'Marca', estado: 'Estado' },
  },
  nvrs: {
    label: 'NVR',
    filtros: { edificio: 'Edificio', nvr: 'NVR' },
  },
};

// Que panel gobierna cada tabla — si ese panel (o, para las de Recursos,
// tambien 'recursos' en si) esta oculto para un rol, sus columnas/filtros no
// tienen sentido para editar: nadie va a llegar nunca a ver esa tabla. El
// frontend (RolesPermisos.jsx) usa esto para no mostrar checkboxes de algo
// inalcanzable.
const TABLA_PANEL = {
  camaras: 'recursos-camaras',
  nvrs: 'recursos-nvrs',
  edificios: 'recursos-edificios',
  pisos: 'recursos-pisos',
  areas: 'recursos-areas',
  usuarios: 'usuarios',
};

module.exports = { ROLES_CONFIGURABLES, PANELES_POR_ROL, PANEL_LABEL, TABLAS_COLUMNAS, TABLAS_FILTROS, TABLA_PANEL };
