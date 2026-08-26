import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
});

// Agrega el token automaticamente en cada request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Si el token expiro, manda al login (pero no si el 401 vino de un endpoint
// de /auth/*, para no pisar el mensaje de error del login mismo)
client.interceptors.response.use(
  (res) => res,
  (err) => {
    const isAuthRequest = err.config?.url?.includes('/auth/');
    if (err.response?.status === 401 && !isAuthRequest) {
      localStorage.removeItem('token');
      window.location.href = '/login';
    }
    return Promise.reject(err);
  }
);

// /api/uploads/camaras ahora exige login (ver authImagen.js en el backend)
// — un <img src> no puede mandar el header Authorization, asi que el token
// va por query string ahi. Solo se lo pega a fotos propias (empiezan con
// /api/uploads/): una foto externa (link de Google Drive, ver
// normalizarUrlImagen en Crud.jsx) no tiene que llevarse nuestro token.
export function urlFoto(url) {
  if (!url || !url.startsWith('/api/uploads/')) return url;
  const token = localStorage.getItem('token');
  if (!token) return url;
  return `${url}?token=${encodeURIComponent(token)}`;
}

export default client;
