import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID;

export default function Login() {
  const { loginWithGoogle, solicitarCodigo, verificarCodigo, loginWithPassword } = useAuth();
  const navigate = useNavigate();
  const googleBtnRef = useRef(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const [email, setEmail] = useState('');
  const [codigo, setCodigo] = useState('');
  const [codigoEnviado, setCodigoEnviado] = useState(false);
  const [avisoCodigo, setAvisoCodigo] = useState('');

  const [modoPassword, setModoPassword] = useState(true);
  const [usuario, setUsuario] = useState('');
  const [password, setPassword] = useState('');

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
            setError(err.response?.data?.error || 'Error al iniciar sesion con Google');
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
      setAvisoCodigo('Te mandamos un codigo a tu email institucional. Vence en 10 minutos.');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar el codigo');
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
      setError(err.response?.data?.error || 'Codigo invalido');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginPassword = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await loginWithPassword(usuario, password);
      navigate('/');
    } catch (err) {
      setError(err.response?.data?.error || 'Error al iniciar sesion');
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
            <h1 className="h4 fw-bold mb-1">Panel de Accesos a Camaras</h1>
            <p className="text-muted small mb-0">Ingresa con tu cuenta institucional</p>
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

          {modoPassword ? (
            <form onSubmit={handleLoginPassword} className={GOOGLE_CLIENT_ID ? 'mt-4 pt-3 border-top' : 'mt-3'}>
              <div className="mb-3">
                <label className="form-label small fw-semibold">Usuario</label>
                <input
                  type="text"
                  value={usuario}
                  onChange={(e) => setUsuario(e.target.value)}
                  className="form-control"
                  required
                  autoFocus
                  autoCapitalize="off"
                  autoCorrect="off"
                  autoComplete="off"
                />
              </div>
              <div className="mb-3">
                <label className="form-label small fw-semibold">Contrasena</label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="form-control"
                  required
                  autoComplete="current-password"
                />
              </div>
              <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                {loading ? 'Ingresando...' : 'Ingresar'}
              </button>
              <button
                type="button"
                className="btn btn-link btn-sm w-100 mt-1"
                onClick={() => { setModoPassword(false); setUsuario(''); setPassword(''); setError(''); }}
              >
                Usar codigo por email en su lugar
              </button>
            </form>
          ) : !codigoEnviado ? (
            <form onSubmit={handleSolicitarCodigo} className={GOOGLE_CLIENT_ID ? 'mt-4 pt-3 border-top' : 'mt-3'}>
              <div className="mb-3">
                <label className="form-label small fw-semibold">Email institucional</label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="form-control"
                  required
                  autoFocus
                />
              </div>
              <button type="submit" className="btn btn-primary w-100" disabled={loading}>
                {loading ? 'Enviando...' : 'Enviarme un codigo'}
              </button>
              <button
                type="button"
                className="btn btn-link btn-sm w-100 mt-1"
                onClick={() => { setModoPassword(true); setError(''); setAvisoCodigo(''); }}
              >
                Ingresar con contrasena
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerificarCodigo} className="mt-4 pt-3 border-top">
              <div className="mb-3">
                <label className="form-label small fw-semibold">Codigo recibido en {email}</label>
                <input
                  type="text"
                  inputMode="numeric"
                  value={codigo}
                  onChange={(e) => setCodigo(e.target.value)}
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
                Usar otro email / pedir un codigo nuevo
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
