import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Login() {
  const { loginWithGoogle, loginDev } = useAuth();
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);
  const [error, setError] = useState('');
  const [devEmail, setDevEmail] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!GOOGLE_CLIENT_ID) return;

    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.onload = () => {
      window.google.accounts.id.initialize({
        client_id: GOOGLE_CLIENT_ID,
        callback: async (response) => {
          setError('');
          setLoading(true);
          try {
            await loginWithGoogle(response.credential);
            navigate('/');
          } catch (err) {
            setError(err.response?.data?.error || 'Error al iniciar sesión con Google');
          } finally {
            setLoading(false);
          }
        },
      });
      if (googleBtnRef.current) {
        window.google.accounts.id.renderButton(googleBtnRef.current, { theme: 'outline', size: 'large' });
      }
    };
    document.body.appendChild(script);
    return () => script.remove();
  }, [navigate, loginWithGoogle]);

  const handleDevLogin = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginDev(devEmail);
      navigate('/');
    } catch (err) {
      if (err.response?.status === 404) {
        setError('El login de desarrollo no está disponible en este entorno.');
      } else {
        setError(err.response?.data?.error || 'Error al iniciar sesión');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-vh-100 d-flex align-items-center justify-content-center">
      <div className="card shadow-sm border-0" style={{ width: '100%', maxWidth: 400 }}>
        <div className="card-body p-4">
          <div className="text-center mb-4">
            <span className="badge bg-primary fs-6 mb-3 px-3 py-2">CURF</span>
            <h1 className="h4 fw-bold mb-1">Panel de Accesos a Cámaras</h1>
            <p className="text-muted small mb-0">Ingresá con tu cuenta institucional</p>
          </div>

          {GOOGLE_CLIENT_ID ? (
            <div ref={googleBtnRef} className="d-flex justify-content-center my-3" />
          ) : (
            <div className="alert alert-warning small py-2" role="alert">
              El login con Google todavía no está configurado (falta GOOGLE_CLIENT_ID).
            </div>
          )}

          {error && (
            <div className="alert alert-danger small py-2 mt-3" role="alert">
              {error}
            </div>
          )}

          <form onSubmit={handleDevLogin} className="mt-4 pt-3 border-top">
            <div className="mb-3">
              <label className="form-label small fw-semibold">Login de desarrollo (email de un usuario ya cargado)</label>
              <input
                type="email"
                value={devEmail}
                onChange={(e) => setDevEmail(e.target.value)}
                placeholder="usuario@curf.ucc.edu.ar"
                className="form-control"
                required
              />
            </div>
            <button type="submit" className="btn btn-primary w-100" disabled={loading}>
              {loading ? 'Ingresando...' : 'Ingresar (desarrollo)'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
