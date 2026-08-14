import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';
import UbicacionSelector from '../components/UbicacionSelector';

// RF-08/RF-09/RF-10: vista restringida — nunca recibe IP/MAC ni credenciales
// (el backend ya filtra esos campos) y solo cámaras en estado "activa". El
// modo selección arranca apagado (RF-10: elegir cámaras es una acción
// deliberada, no el estado por defecto de la pantalla) — al activarlo
// aparece el "+" para ir sumando cámaras, un contador flotante, y el botón
// para abrir el modal de confirmación que dispara la solicitud real
// (POST /solicitudes) — la misma que después ve Dirección en "Solicitudes".
export default function VistaMandoMedio() {
  const [camaras, setCamaras] = useState([]);
  const [cargando, setCargando] = useState(true);
  const [filtroUbicacion, setFiltroUbicacion] = useState({ edificioId: null, pisoId: null, areaId: null });
  const [modoSeleccion, setModoSeleccion] = useState(false);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [comentario, setComentario] = useState('');
  const [error, setError] = useState('');
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);

  const cargarCamaras = () => {
    setCargando(true);
    const params = {
      edificio_id: filtroUbicacion.edificioId || undefined,
      piso_id: filtroUbicacion.pisoId || undefined,
      area_id: filtroUbicacion.areaId || undefined,
    };
    client.get('/camaras', { params }).then((res) => setCamaras(res.data)).finally(() => setCargando(false));
  };

  useEffect(cargarCamaras, [filtroUbicacion]);

  const toggleModoSeleccion = () => {
    setModoSeleccion((activo) => {
      if (activo) setSeleccionadas([]); // al apagar el modo, se limpia lo elegido
      return !activo;
    });
  };

  const toggleSeleccion = (id) => {
    setSeleccionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const abrirModal = () => {
    setError('');
    setMensaje('');
    setShowModal(true);
  };

  const enviarSolicitud = async () => {
    setError('');
    setEnviando(true);
    try {
      await client.post('/solicitudes', { camara_ids: seleccionadas, comentario: comentario || undefined });
      setShowModal(false);
      setSeleccionadas([]);
      setComentario('');
      setModoSeleccion(false);
      setMensaje('Solicitud enviada. La vas a ver en "Mis solicitudes" y vas a recibir un aviso cuando Dirección la resuelva.');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo enviar la solicitud');
    } finally {
      setEnviando(false);
    }
  };

  const camarasSeleccionadas = camaras.filter((c) => seleccionadas.includes(c.id));

  return (
    <Layout>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-1">
        <div>
          <h1 className="h4 fw-bold mb-1">Cámaras disponibles</h1>
          <p className="text-body-secondary small mb-0">Ubicalas por edificio, piso, área, foto u observaciones.</p>
        </div>
        <div className="d-flex align-items-center gap-2">
          <span className="small text-body-secondary">Modo selección</span>
          <div className="form-check form-switch mb-0">
            <input
              className="form-check-input"
              type="checkbox"
              role="switch"
              checked={modoSeleccion}
              onChange={toggleModoSeleccion}
              style={{ width: '2.5em', height: '1.4em', cursor: 'pointer' }}
            />
          </div>
        </div>
      </div>

      <div className="card shadow-sm mt-3">
        <div className="card-body">
          <UbicacionSelector {...filtroUbicacion} onChange={setFiltroUbicacion} />
        </div>
      </div>

      {mensaje && <div className="alert alert-success small py-2 mt-3">{mensaje}</div>}

      {cargando ? (
        <p className="text-body-secondary mt-4">Cargando...</p>
      ) : (
        <div className="row g-3 mt-1">
          {camaras.map((c) => {
            const seleccionada = seleccionadas.includes(c.id);
            return (
              <div className="col-12 col-sm-6 col-lg-4 col-xl-3" key={c.id}>
                <div
                  className={`card h-100 shadow-sm ${seleccionada ? 'border-primary border-2' : ''}`}
                  style={modoSeleccion ? { cursor: 'pointer' } : undefined}
                  onClick={modoSeleccion ? () => toggleSeleccion(c.id) : undefined}
                >
                  <div className="position-relative">
                    {c.imagen_url ? (
                      <img src={c.imagen_url} alt={c.descripcion || c.hostname} className="card-img-top" style={{ height: 140, objectFit: 'cover' }} />
                    ) : (
                      <div className="d-flex align-items-center justify-content-center bg-body-tertiary" style={{ height: 140 }}>
                        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-body-secondary">
                          <rect x="3" y="7" width="15" height="12" rx="2" /><path d="M18 10l4-2v10l-4-2" />
                        </svg>
                      </div>
                    )}
                    {c.tiene_acceso && (
                      <span className="badge text-bg-success position-absolute top-0 start-0 m-2">Con acceso</span>
                    )}
                    {modoSeleccion && (
                      <span
                        className={`position-absolute top-0 end-0 m-2 d-flex align-items-center justify-content-center rounded-circle ${seleccionada ? 'bg-primary text-white' : 'bg-body border'}`}
                        style={{ width: 28, height: 28, fontSize: 18, lineHeight: 1 }}
                      >
                        {seleccionada ? '✓' : '+'}
                      </span>
                    )}
                  </div>
                  <div className="card-body">
                    <p className="fw-semibold mb-2">{c.descripcion || c.hostname}</p>
                    <p className="card-text small text-body-secondary mb-1">{c.edificio} · {c.piso} · {c.area}</p>
                    {c.observaciones && <p className="card-text small text-body-secondary mb-0">{c.observaciones}</p>}
                  </div>
                </div>
              </div>
            );
          })}
          {camaras.length === 0 && <p className="text-body-secondary">No hay cámaras activas disponibles.</p>}
        </div>
      )}

      {modoSeleccion && seleccionadas.length > 0 && (
        <div
          className="position-fixed bottom-0 start-50 translate-middle-x mb-4 bg-body-secondary border rounded-3 shadow-lg d-flex align-items-center gap-3 px-3 py-2"
          style={{ zIndex: 1040 }}
        >
          <button className="btn btn-sm btn-link text-decoration-none" onClick={() => setSeleccionadas([])}>Limpiar</button>
          <span className="small"><strong>{seleccionadas.length}</strong> cámara{seleccionadas.length === 1 ? '' : 's'} seleccionada{seleccionadas.length === 1 ? '' : 's'}</span>
          <button className="btn btn-primary btn-sm fw-semibold" onClick={abrirModal}>SOLICITAR ACCESO</button>
        </div>
      )}

      {showModal && (
        <>
          <div
            className="modal d-block"
            tabIndex="-1"
            role="dialog"
            onClick={(e) => { if (e.target === e.currentTarget && !enviando) setShowModal(false); }}
          >
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title h5">Solicitar acceso</h2>
                  <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setShowModal(false)} disabled={enviando} />
                </div>
                <div className="modal-body">
                  <div className="d-flex flex-wrap gap-2 mb-3">
                    {camarasSeleccionadas.map((c) => (
                      <span key={c.id} className="badge text-bg-secondary fs-6 fw-normal py-2 px-3 d-flex align-items-center gap-2">
                        {c.descripcion || c.hostname}
                        <button
                          type="button"
                          className="btn-close btn-close-white"
                          style={{ fontSize: 10 }}
                          aria-label="Quitar"
                          onClick={() => toggleSeleccion(c.id)}
                        />
                      </span>
                    ))}
                  </div>
                  <label className="form-label small fw-semibold">Comentario para Dirección (opcional)</label>
                  <textarea
                    className="form-control"
                    rows={3}
                    value={comentario}
                    onChange={(e) => setComentario(e.target.value)}
                    placeholder="Motivo del acceso, contexto adicional..."
                  />
                  {error && <div className="alert alert-danger small py-2 mt-3 mb-0">{error}</div>}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setShowModal(false)} disabled={enviando}>Cancelar</button>
                  <button type="button" className="btn btn-primary" onClick={enviarSolicitud} disabled={enviando || seleccionadas.length === 0}>
                    {enviando ? 'Enviando...' : 'Enviar solicitud'}
                  </button>
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show" />
        </>
      )}
    </Layout>
  );
}
