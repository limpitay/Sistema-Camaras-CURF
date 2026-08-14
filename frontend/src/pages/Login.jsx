import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Login() {
  const { loginWithGoogle, loginDev, solicitarCodigo, verificarCodigo } = useAuth();
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);
  const [error, setError] = useState('');
  const [devEmail, setDevEmail] = useState('');
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [avisoCodigo, setAvisoCodigo] = useState('');

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

  const handleSolicitarCodigo = async (e) => {
    e.preventDefault();
    setError('');
    setAvisoCodigo('');
    setLoading(true);
    try {
      await solicitarCodigo(email);
      setCodigoEnviado(true);
      setAvisoCodigo('Te mandamos un código a tu email institucional. Vence en 10 minutos.');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar el código');
    } finally {
      setLoading(false);
    }
  };

  const handleVerificarCodigo = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await verificarCodigo(email, codigo);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Código inválido');
    } finally {
      setLoading(false);
    }
  };

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

          {GOOGLE_CLIENT_ID && (
            <div ref={googleBtnRef} className="d-flex justify-content-center my-3" />
          )}

          {error && (
            <div className="alert alert-danger small py-2 mt-3" role="alert">
              {error}
            </div>
          )}
          {avisoCodigo && !error && (
            <div className="alert alert-success small py-2 mt-3" role="alert">
              {avisoCodigo}
            </div>
          )}

          {!codigoEnviado ? (
            <form onSubmit={handleSolicitarCodigo} className={GOOGLE_CLIENT_ID ? 'mt-4 pt-3 border-top' : 'mt-3'}>
              <div className="mb-3">
                <label className="form-label small fw-semibold">Email institucional</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="usuario@curf.ucc.edu.ar"
                  className="form-control"
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviarme un código'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerificarCodigo} className="mt-4 pt-3 border-top">
              <div className="mb-3">
                <label className="form-label small fw-semibold">Código recibido en {email}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
                  placeholder="123456"
                  className="form-control"
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                {loading ? 'Verificando...' : 'Ingresar'}
              </button>
              <button
                type="button"
                className="btn btn-link btn-sm w-100 mt-1"
                onClick={() => { setCodigoEnviado(false); setCodigo(''); setError(''); setAvisoCodigo(''); }}
              >
                Usar otro email / pedir un código nuevo
              </button>
            </form>
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
