import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Los tabs de CRUD (Crud.jsx) se linkean aca como sub-items de un grupo
// desplegable — igual que "Administracion" en GLPI — en vez de un solo link
// a /crud. Crud.jsx lee/escribe el tab activo en ?tab=, asi que cada
// sub-item es un link directo y navegable (bookmarkeable, funciona con
// atras/adelante del navegador).
// Dashboard vive aparte, a nivel superior (es la pagina de entrada, ver
// Home() en App.jsx) y Usuarios vive detras del icono de engranaje del
// footer — no aca.
const CRUD_SUBITEMS = [
  { to: '/crud', tab: 'camaras', label: 'Camaras', panel: 'recursos-camaras' },
  { to: '/crud', tab: 'nvrs', label: 'NVR', panel: 'recursos-nvrs' },
  { to: '/crud', tab: 'edificios', label: 'Edificios', panel: 'recursos-edificios' },
  { to: '/crud', tab: 'pisos', label: 'Pisos', panel: 'recursos-pisos' },
  { to: '/crud', tab: 'areas', label: 'Areas', panel: 'recursos-areas' },
];

// "Configuracion" vive dentro del perfil (el bloque de usuario al pie del
// sidebar), no como otra entrada mas del menu — clic ahi despliega esto,
// mismo patron que un grupo (Recursos) pero disparado desde el perfil. Los
// hijos aca son rutas propias sin ?tab=, a diferencia de los de Recursos.
// "Roles y permisos" es admin-only siempre (adminOnly), sin importar lo que
// diga la configuracion — nadie mas puede tocar los permisos, ni avanzado.
const CONFIG_SUBITEMS = [
  { to: '/usuarios', label: 'Usuarios', panel: 'usuarios' },
  { to: '/roles-permisos', label: 'Roles y permisos', adminOnly: true },
];

// Solicitudes, Pendientes HikCentral e Historial de accesos siguen ocultos
// de la navegacion a proposito (para todos los roles) — las rutas siguen
// funcionando si alguien entra por URL directa, solo no aparecen como link.
// Para reactivarlos, descomentar las lineas de abajo. Accesos NVR se
// reactivo a pedido explicito.
// `panel` en cada entrada es la clave que usa Configuracion → Roles y
// permisos para decidir si ese rol la ve o no (ver permisosRegistro.js en
// el backend, tiene que ser la misma clave de los dos lados). Los grupos
// (Recursos, Configuracion) no tienen `panel` propio — Recursos es
// all-or-nothing via su clave 'recursos' igual, pero Configuracion se
// muestra/oculta segun si le queda algun hijo visible, no como bloque.
const LINKS_POR_ROL = {
  mando_medio: [
    { to: '/camaras', label: 'Camaras disponibles', icon: 'camara', panel: 'camaras' },
    { to: '/mis-solicitudes', label: 'Mis solicitudes', icon: 'solicitud', panel: 'mis-solicitudes' },
  ],
  direccion: [
    { to: '/accesos-nvr', label: 'Accesos NVR', icon: 'video', panel: 'accesos-nvr' },
    // { to: '/solicitudes', label: 'Solicitudes', icon: 'solicitud' },
    // { to: '/historial', label: 'Historial de accesos', icon: 'historial' },
  ],
  admin: [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', panel: 'dashboard' },
    { label: 'Recursos', icon: 'crud', children: CRUD_SUBITEMS, panel: 'recursos' },
    { to: '/accesos-nvr', label: 'Accesos NVR', icon: 'video', panel: 'accesos-nvr' },
    // { to: '/solicitudes', label: 'Solicitudes', icon: 'solicitud' },
    // { to: '/pendientes-hikcentral', label: 'Pendientes HikCentral', icon: 'pendiente' },
    // { to: '/historial', label: 'Historial de accesos', icon: 'historial' },
  ],
  avanzado: [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', panel: 'dashboard' },
    { label: 'Recursos', icon: 'crud', children: CRUD_SUBITEMS, panel: 'recursos' },
    { to: '/accesos-nvr', label: 'Accesos NVR', icon: 'video', panel: 'accesos-nvr' },
    // { to: '/solicitudes', label: 'Solicitudes', icon: 'solicitud' },
    // { to: '/pendientes-hikcentral', label: 'Pendientes HikCentral', icon: 'pendiente' },
    // { to: '/historial', label: 'Historial de accesos', icon: 'historial' },
  ],
  sistemas_lectura: [
    { to: '/dashboard', label: 'Dashboard', icon: 'dashboard', panel: 'dashboard' },
    { label: 'Recursos', icon: 'crud', children: CRUD_SUBITEMS, panel: 'recursos' },
    { to: '/accesos-nvr', label: 'Accesos NVR', icon: 'video', panel: 'accesos-nvr' },
    // { to: '/solicitudes', label: 'Solicitudes', icon: 'solicitud' },
    // { to: '/pendientes-hikcentral', label: 'Pendientes HikCentral', icon: 'pendiente' },
    // { to: '/historial', label: 'Historial de accesos', icon: 'historial' },
  ],
};

// Set chico de iconos de linea a mano (sin sumar una libreria aparte solo
// para esto) — mismo viewBox/trazo para que se vean como un mismo set.
const ICONOS = {
  dashboard: 'M4 4h7v7H4V4Z M13 4h7v4h-7V4Z M13 10h7v10h-7V10Z M4 13h7v7H4v-7Z',
  camara: 'M4 8a2 2 0 0 1 2-2h1.5l1-1.5h7l1 1.5H18a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V8Z M12 9.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Z',
  solicitud: 'M8 3.5h8a1 1 0 0 1 1 1V5h.5A1.5 1.5 0 0 1 19 6.5v13a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 5 19.5v-13A1.5 1.5 0 0 1 6.5 5H7v-.5a1 1 0 0 1 1-1Z M9 11.5l2 2 4-4.5',
  crud: 'M4.5 6.5c0-1.1 3.36-2 7.5-2s7.5.9 7.5 2-3.36 2-7.5 2-7.5-.9-7.5-2Z M4.5 6.5V17.5c0 1.1 3.36 2 7.5 2s7.5-.9 7.5-2V6.5 M4.5 12c0 1.1 3.36 2 7.5 2s7.5-.9 7.5-2',
  video: 'M4.5 6.5h10a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-10A1.5 1.5 0 0 1 3 16V8a1.5 1.5 0 0 1 1.5-1.5Z M16 10l4.2-2.5a.5.5 0 0 1 .8.4v8.2a.5.5 0 0 1-.8.4L16 14',
  historial: 'M12 7v5.3l3.5 2.1 M12 20.5a8.5 8.5 0 1 0 0-17 8.5 8.5 0 0 0 0 17Z',
  pendiente: 'M12 8v5 M12 16h.01 M10.5 4h3l6.5 6.5v3L13.5 20h-3L4 13.5v-3Z',
  salir: 'M9.5 20H6a1.5 1.5 0 0 1-1.5-1.5v-13A1.5 1.5 0 0 1 6 4h3.5 M15.5 16l4-4-4-4 M19 12H9',
  chevronAbajo: 'M6.5 9.5 12 15l5.5-5.5',
};

// El engranaje es el unico icono del set que no es un path — mas claro
// armarlo con primitivas SVG (circulo + dientes) que a mano dibujar el path
// de un cog.
function Icono({ nombre, size = 18 }) {
  if (nombre === 'engranaje') {
    const dientes = Array.from({ length: 8 });
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" aria-hidden="true">
        {dientes.map((_, i) => (
          <line key={i} x1="12" y1="3" x2="12" y2="5.6" transform={`rotate(${i * 45} 12 12)`} />
        ))}
        <circle cx="12" cy="12" r="5.4" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={ICONOS[nombre] || ''} />
    </svg>
  );
}

function iniciales(nombre) {
  const partes = (nombre || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '?';
  if (partes.length === 1) return partes[0][0].toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}

const ROL_LABEL = {
  admin: 'Admin',
  avanzado: 'Avanzado',
  sistemas_lectura: 'Sistemas',
  direccion: 'Direccion',
  mando_medio: 'Mando medio',
};

export default function Layout({ children }) {
  const { user, logout, permisos } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const esAdmin = user?.rol === 'admin';
  // permisos.paneles === null (admin, o todavia no cargo) = sin restriccion.
  // Si ya cargo y es un array, es la lista de paneles que ese rol puede ver
  // (ver Configuracion → Roles y permisos / permisosRegistro.js).
  const panelVisible = (panel) => !panel || esAdmin || !permisos || permisos.paneles === null || permisos.paneles.includes(panel);
  const hijoVisible = (hijo) => (hijo.adminOnly ? esAdmin : panelVisible(hijo.panel));

  const links = (LINKS_POR_ROL[user?.rol] || [])
    .filter((l) => panelVisible(l.panel))
    .filter((l) => !l.children || l.children.some(hijoVisible));
  const tabActual = new URLSearchParams(location.search).get('tab');

  // Un hijo sin `tab` es una ruta propia (ej. Usuarios) — ahi alcanza con
  // que coincida el pathname. Uno con `tab` (ej. los de Recursos) comparte
  // pathname con sus hermanos, asi que ademas tiene que coincidir el tab.
  const hijoActivo = (hijo) => location.pathname === hijo.to && (hijo.tab === undefined || hijo.tab === tabActual);

  // Un grupo (ej. "Recursos") arranca desplegado si la ruta actual cae
  // dentro de sus hijos — igual que "Administracion" en GLPI, que aparece
  // abierto porque es la seccion activa. Despues de eso, el usuario decide
  // con el click si lo deja abierto o cerrado, sin que la navegacion se lo pise.
  const [gruposAbiertos, setGruposAbiertos] = useState(() => {
    const activo = links.find((l) => l.children?.some(hijoActivo));
    return new Set(activo ? [activo.label] : []);
  });
  const toggleGrupo = (label) => setGruposAbiertos((actual) => {
    const nuevo = new Set(actual);
    if (nuevo.has(label)) nuevo.delete(label); else nuevo.add(label);
    return nuevo;
  });

  // Configuracion cuelga del perfil (el bloque de usuario al pie), no del
  // menu principal — mismo criterio de auto-apertura que los grupos de
  // arriba. Si a este rol no le queda ningun hijo visible (Usuarios oculto
  // y no es admin, asi que tampoco ve Roles y permisos), el perfil queda
  // como bloque fijo, sin nada para desplegar.
  const configVisibles = CONFIG_SUBITEMS.filter(hijoVisible);
  const [perfilAbierto, setPerfilAbierto] = useState(() => configVisibles.some(hijoActivo));

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="app-shell">
      <aside className="app-sidebar">
        <div className="app-sidebar-brand">
          <span className="app-sidebar-brand-badge">CU</span>
          <span className="app-sidebar-brand-text">Panel CURF</span>
        </div>

        <nav className="app-sidebar-nav">
          <ul className="list-unstyled mb-0">
            {links.map((link) => {
              if (!link.children) {
                // Links con `tab` (ej. Dashboard → /crud?tab=dashboard) comparten
                // pathname con otras cosas (el grupo CRUD, el engranaje de
                // Usuarios), asi que el activo se calcula a mano en vez de
                // dejarlo en manos del isActive por-pathname de NavLink.
                const href = link.tab ? `${link.to}?tab=${link.tab}` : link.to;
                const activoManual = link.tab ? (location.pathname === link.to && tabActual === link.tab) : null;
                return (
                  <li key={href}>
                    <NavLink to={href} className={({ isActive }) => `app-sidebar-link${(activoManual ?? isActive) ? ' active' : ''}`}>
                      <span className="app-sidebar-icon"><Icono nombre={link.icon} /></span>
                      <span className="app-sidebar-label">{link.label}</span>
                    </NavLink>
                  </li>
                );
              }

              const abierto = gruposAbiertos.has(link.label);
              return (
                <li key={link.label}>
                  <button type="button" className="app-sidebar-link app-sidebar-grupo" onClick={() => toggleGrupo(link.label)}>
                    <span className="app-sidebar-icon"><Icono nombre={link.icon} /></span>
                    <span className="app-sidebar-label flex-grow-1">{link.label}</span>
                    <span className={`app-sidebar-chevron${abierto ? ' abierto' : ''}`}>
                      <Icono nombre="chevronAbajo" size={14} />
                    </span>
                  </button>
                  {abierto && (
                    <ul className="list-unstyled app-sidebar-subnav">
                      {link.children.filter(hijoVisible).map((hijo) => (
                        <li key={hijo.tab ? `${hijo.to}?tab=${hijo.tab}` : hijo.to}>
                          <NavLink
                            to={hijo.tab ? `${hijo.to}?tab=${hijo.tab}` : hijo.to}
                            className={() => `app-sidebar-sublink${hijoActivo(hijo) ? ' active' : ''}`}
                          >
                            {hijo.label}
                          </NavLink>
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="app-sidebar-footer">
          <div className="app-sidebar-user">
            <span className="app-sidebar-avatar">{iniciales(user?.nombre)}</span>
            <span className="app-sidebar-user-info">
              <span className="app-sidebar-user-nombre">{user?.nombre}</span>
              <span className="app-sidebar-user-rol">{ROL_LABEL[user?.rol] || user?.rol}</span>
            </span>
          </div>

          {configVisibles.length > 0 && (
            <>
              <button type="button" className="app-sidebar-link app-sidebar-grupo" onClick={() => setPerfilAbierto((v) => !v)}>
                <span className="app-sidebar-icon"><Icono nombre="engranaje" /></span>
                <span className="app-sidebar-label flex-grow-1">Configuracion</span>
                <span className={`app-sidebar-chevron${perfilAbierto ? ' abierto' : ''}`}>
                  <Icono nombre="chevronAbajo" size={14} />
                </span>
              </button>
              {perfilAbierto && (
                <ul className="list-unstyled app-sidebar-subnav">
                  {configVisibles.map((hijo) => (
                    <li key={hijo.to}>
                      <NavLink to={hijo.to} className={({ isActive }) => `app-sidebar-sublink${isActive ? ' active' : ''}`}>
                        {hijo.label}
                      </NavLink>
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}

          <button type="button" className="app-sidebar-link app-sidebar-logout" onClick={handleLogout}>
            <span className="app-sidebar-icon"><Icono nombre="salir" /></span>
            <span className="app-sidebar-label">Salir</span>
          </button>
        </div>
      </aside>

      <main className="app-content container-fluid px-4 py-4">{children}</main>
    </div>
  );
}
