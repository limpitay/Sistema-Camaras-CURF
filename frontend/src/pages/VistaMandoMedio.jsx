import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';

// RF-08/RF-09/RF-10: vista restringida — nunca recibe IP/MAC (el backend ya
// filtra esos campos) y solo cámaras en estado "funcionando".
export default function VistaMandoMedio() {
  const [camaras, setCamaras] = useState([]);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [comentario, setComentario] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [error, setError] = useState('');
  const [cargando, setCargando] = useState(true);

  const cargarCamaras = () => {
    setCargando(true);
    client.get('/camaras')
      .then((res) => setCamaras(res.data))
      .finally(() => setCargando(false));
  };

  useEffect(cargarCamaras, []);

  const toggleSeleccion = (id) => {
    setSeleccionadas((prev) => (
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    ));
  };

  const enviarSolicitud = async () => {
    setError('');
    setMensaje('');
    try {
      await client.post('/solicitudes', { camara_ids: seleccionadas, comentario: comentario || undefined });
      setMensaje('Solicitud enviada. Vas a recibir un aviso cuando Dirección la resuelva.');
      setSeleccionadas([]);
      setComentario('');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar la solicitud');
    }
  };

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-1">Cámaras disponibles</h1>
      <p className="text-muted small mb-4">
        Seleccioná las cámaras a las que necesitás acceso y enviá la solicitud. Ubicalas por edificio, piso, área, foto u observaciones.
      </p>

      {cargando ? (
        <p className="text-muted">Cargando...</p>
      ) : (
        <div className="row g-3">
          {camaras.map((c) => {
            const seleccionada = seleccionadas.includes(c.id);
            return (
              <div className="col-12 col-sm-6 col-lg-4 col-xl-3" key={c.id}>
                <label
                  className={`card h-100 shadow-sm ${seleccionada ? 'border-primary border-2' : ''}`}
                  style={{ cursor: 'pointer' }}
                >
                  {c.imagen_url && (
                    <img src={c.imagen_url} alt={c.descripcion || c.hostname} className="card-img-top" style={{ height: 140, objectFit: 'cover' }} />
                  )}
                  <div className="card-body">
                    <div className="form-check mb-2">
                      <input
                        type="checkbox"
                        className="form-check-input"
                        checked={seleccionada}
                        onChange={() => toggleSeleccion(c.id)}
                      />
                      <span className="form-check-label fw-semibold">{c.descripcion || c.hostname}</span>
                    </div>
                    <p className="card-text small text-muted mb-1">{c.edificio} · {c.piso} · {c.area}</p>
                    {c.observaciones && <p className="card-text small text-body-secondary mb-0">{c.observaciones}</p>}
                  </div>
                </label>
              </div>
            );
          })}
        </div>
      )}

      {seleccionadas.length > 0 && (
        <div className="card shadow-sm mt-4" style={{ maxWidth: 460 }}>
          <div className="card-body">
            <p className="mb-2">{seleccionadas.length} cámara(s) seleccionada(s)</p>
            <textarea
              placeholder="Comentario opcional para Dirección"
              value={comentario}
              onChange={(e) => setComentario(e.target.value)}
              className="form-control mb-3"
              rows={3}
            />
            {error && <div className="alert alert-danger small py-2">{error}</div>}
            {mensaje && <div className="alert alert-success small py-2">{mensaje}</div>}
            <button onClick={enviarSolicitud} className="btn btn-primary">
              Solicitar acceso
            </button>
          </div>
        </div>
      )}
    </Layout>
  );
}
