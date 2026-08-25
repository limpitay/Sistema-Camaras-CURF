import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import Login from './pages/Login';
import VistaMandoMedio from './pages/VistaMandoMedio';
import MisSolicitudes from './pages/MisSolicitudes';
import InventarioAdmin from './pages/InventarioAdmin';
import Crud from './pages/Crud';
import Solicitudes from './pages/Solicitudes';
import PendientesHikCentral from './pages/PendientesHikCentral';
import Historial from './pages/Historial';
import AccesosNvr from './pages/AccesosNvr';

function PrivateRoute({ roles, children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ padding: 40 }}>Cargando...</div>;
  if (!user) return <Navigate to="/login" />;
  if (roles && !roles.includes(user.rol)) return <Navigate to="/" />;
  return children;
}

function Home() {
  const { user } = useAuth();
  if (user?.rol === 'mando_medio') return <Navigate to="/camaras" />;
  if (user?.rol === 'direccion') return <Navigate to="/solicitudes" />;
  return <Navigate to="/inventario" />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<PrivateRoute><Home /></PrivateRoute>} />

          <Route path="/camaras" element={
            <PrivateRoute roles={['mando_medio']}><VistaMandoMedio /></PrivateRoute>
          } />
          <Route path="/mis-solicitudes" element={
            <PrivateRoute roles={['mando_medio']}><MisSolicitudes /></PrivateRoute>
          } />

          <Route path="/inventario" element={
            <PrivateRoute roles={['admin', 'avanzado', 'sistemas_lectura']}><InventarioAdmin /></PrivateRoute>
          } />

          <Route path="/crud" element={
            <PrivateRoute roles={['admin', 'avanzado']}><Crud /></PrivateRoute>
          } />

          <Route path="/solicitudes" element={
            <PrivateRoute roles={['direccion', 'admin', 'avanzado', 'sistemas_lectura']}><Solicitudes /></PrivateRoute>
          } />

          <Route path="/accesos-nvr" element={
            <PrivateRoute roles={['admin', 'avanzado', 'sistemas_lectura']}><AccesosNvr /></PrivateRoute>
          } />

          <Route path="/pendientes-hikcentral" element={
            <PrivateRoute roles={['admin', 'avanzado', 'sistemas_lectura']}><PendientesHikCentral /></PrivateRoute>
          } />

          <Route path="/historial" element={
            <PrivateRoute roles={['direccion', 'admin', 'avanzado', 'sistemas_lectura']}><Historial /></PrivateRoute>
          } />

          <Route path="*" element={<Navigate to="/" />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
