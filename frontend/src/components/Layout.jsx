import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

// Accesos NVR, Solicitudes, Pendientes HikCentral e Historial de accesos
// están ocultos de la navegación a propósito por ahora (para todos los
// roles) — las rutas siguen funcionando si alguien entra por URL directa,
// solo no aparecen como link. Para reactivarlos, descomentar las líneas de
// abajo.
const LINKS_POR_ROL = {
  mando_medio: [
    { to: '/camaras', label: 'Cámaras disponibles' },
    { to: '/mis-solicitudes', label: 'Mis solicitudes' },
  ],
  direccion: [
    // { to: '/solicitudes', label: 'Solicitudes' },
    // { to: '/historial', label: 'Historial de accesos' },
  ],
  admin: [
    { to: '/inventario', label: 'Camaras' },
    { to: '/crud', label: 'CRUD' },
    // { to: '/accesos-nvr', label: 'Accesos NVR' },
    // { to: '/solicitudes', label: 'Solicitudes' },
    // { to: '/pendientes-hikcentral', label: 'Pendientes HikCentral' },
    // { to: '/historial', label: 'Historial de accesos' },
  ],
  sistemas_lectura: [
    { to: '/inventario', label: 'Camaras' },
    // { to: '/accesos-nvr', label: 'Accesos NVR' },
    // { to: '/solicitudes', label: 'Solicitudes' },
    // { to: '/pendientes-hikcentral', label: 'Pendientes HikCentral' },
    // { to: '/historial', label: 'Historial de accesos' },
  ],
};

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const links = LINKS_POR_ROL[user?.rol] || [];

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <div className="min-vh-100 d-flex flex-column">
      <nav className="navbar navbar-expand-lg navbar-dark bg-primary">
        <div className="container-fluid px-4">
          <span className="navbar-brand mb-0">Panel de Accesos a Cámaras</span>
          <div className="d-flex flex-grow-1">
            <ul className="navbar-nav flex-row gap-1">
              {links.map((link) => (
                <li className="nav-item" key={link.to}>
                  <NavLink
                    to={link.to}
                    className={({ isActive }) => `nav-link px-3 rounded-2 ${isActive ? 'active bg-white bg-opacity-25' : ''}`}
                  >
                    {link.label}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
          <div className="d-flex align-items-center gap-3 text-white-50 small">
            <span>{user?.nombre} · {user?.rol}</span>
            <button onClick={handleLogout} className="btn btn-sm btn-outline-light">Salir</button>
          </div>
        </div>
      </nav>
      <main className="container-fluid flex-grow-1 px-4 py-4">{children}</main>
    </div>
  );
}
