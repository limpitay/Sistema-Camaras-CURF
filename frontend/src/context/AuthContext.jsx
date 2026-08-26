import { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);
  // null mientras no se cargo todavia — Layout/Crud/Usuarios tratan eso
  // igual que "sin restricciones" (arranca mostrando todo, se ajusta apenas
  // llega la respuesta). paneles:null adentro = admin, sin restriccion.
  const [permisos, setPermisos] = useState(null);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }

    client.get('/auth/me')
      .then(res => setUser(res.data.user))
      .catch(()  => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  // Visibilidad de paneles/columnas por rol (ver Configuracion → Roles y
  // permisos) — se resuelve server-side contra el rol del token, asi que
  // alcanza con pedirla de nuevo cada vez que cambia el usuario logueado.
  useEffect(() => {
    if (!user) { setPermisos(null); return; }
    client.get('/permisos/mios')
      .then((res) => setPermisos(res.data))
      .catch(() => setPermisos(null));
  }, [user]);

  const loginWithGoogle = async (idToken) => {
    const res = await client.post('/auth/google', { id_token: idToken });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  // Login institucional por codigo de un solo uso enviado por email — no
  // depende de tener Google Workspace configurado (ver auth.js).
  const solicitarCodigo = async (email) => {
    const res = await client.post('/auth/solicitar-codigo', { email });
    return res.data;
  };

  const verificarCodigo = async (email, codigo) => {
    const res = await client.post('/auth/verificar-codigo', { email, codigo });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  // Login alternativo por usuario (nombre corto, ej. "llimpitay") + contrasena,
  // para quienes tienen usuario/password_hash asignados desde el panel (ver
  // auth.js /login) — nadie los tiene por defecto.
  const loginWithPassword = async (usuario, password) => {
    const res = await client.post('/auth/login', { usuario, password });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, permisos, loginWithGoogle, solicitarCodigo, verificarCodigo, loginWithPassword, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
