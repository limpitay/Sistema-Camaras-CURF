import { createContext, useContext, useState, useEffect } from 'react';
import client from '../api/client';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user,    setUser]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) { setLoading(false); return; }

    client.get('/auth/me')
      .then(res => setUser(res.data.user))
      .catch(()  => localStorage.removeItem('token'))
      .finally(() => setLoading(false));
  }, []);

  const loginWithGoogle = async (idToken) => {
    const res = await client.post('/auth/google', { id_token: idToken });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  // Login institucional por código de un solo uso enviado por email — no
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

  // Login de desarrollo — ver ESPECIFICACION.md sección 9 (OAuth pendiente de
  // credenciales). El backend rechaza este endpoint fuera de desarrollo.
  const loginDev = async (email) => {
    const res = await client.post('/auth/dev-login', { email });
    localStorage.setItem('token', res.data.token);
    setUser(res.data.user);
    return res.data;
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  return (
    <AuthContext.Provider value={{ user, loading, loginWithGoogle, loginDev, solicitarCodigo, verificarCodigo, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
