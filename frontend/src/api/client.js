import axios from 'axios';

const client = axios.create({
  baseURL: '/api',
});

// Agrega el token automáticamente en cada request
client.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// Si el token expiró, manda al login (pero no si el 401 vino de un endpoint
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

export default client;
