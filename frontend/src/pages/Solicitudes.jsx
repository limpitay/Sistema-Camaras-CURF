import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const BADGE = { pendiente: 'bg-warning text-dark', aprobada: 'bg-success', rechazada: 'bg-danger' };
const ETIQUETAS = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };

// RF-13: Dirección aprueba/rechaza la solicitud completa (todas sus cámaras
// juntas — así quedó modelado: el estado vive en la cabecera, no por cámara).
// Admin y Sistemas-lectura solo consultan (mismo panel, sin botones de resolución).
export default function Solicitudes() {
  const { user } = useAuth();
  const puedeResolver = ['direccion', 'admin', 'avanzado'].includes(user?.rol);

  const [solicitudes, setSolicitudes] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('pendiente');
  const [seleccionadas, setSeleccionadas] = useState([]);
  const [detalleCamara, setDetalleCamara] = useState(null);

  const cargar = () => {
    const params = filtroEstado ? { estado: filtroEstado } : {};
    client.get('/solicitudes', { params }).then((res) => {
      setSolicitudes(res.data);
      setSeleccionadas([]);
    });
  };

  useEffect(cargar, [filtroEstado]);

  const resolver = async (id, estado) => {
    await client.patch(`/solicitudes/${id}`, { estado });
    cargar();
  };

  const resolverLote = async (estado) => {
    if (seleccionadas.length === 0) return;
    await client.post('/solicitudes/resolver-lote', { solicitud_ids: seleccionadas, estado });
    cargar();
  };

  const toggleSeleccion = (id) => {
    setSeleccionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-4">Solicitudes de acceso</h1>

      <div className="d-flex gap-3 align-items-center mb-4">
        <select className="form-select" style={{ maxWidth: 220 }} value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
          <option value="pendiente">Pendientes</option>
          <option value="aprobada">Aprobadas</option>
          <option value="rechazada">Rechazadas</option>
          <option value="">Todas (historial)</option>
        </select>

        {puedeResolver && filtroEstado === 'pendiente' && seleccionadas.length > 0 && (
          <>
            <span className="text-body-secondary small">{seleccionadas.length} seleccionada(s)</span>
            <button className="btn btn-sm btn-success" onClick={() => resolverLote('aprobada')}>Aprobar seleccionadas</button>
            <button className="btn btn-sm btn-outline-danger" onClick={() => resolverLote('rechazada')}>Rechazar seleccionadas</button>
          </>
        )}
      </div>

      {solicitudes.map((s) => (
        <div key={s.id} className="card shadow-sm mb-3">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-center">
              <div className="d-flex align-items-center gap-2">
                {puedeResolver && s.estado === 'pendiente' && (
                  <input
                    type="checkbox"
                    className="form-check-input mt-0"
                    checked={seleccionadas.includes(s.id)}
                    onChange={() => toggleSeleccion(s.id)}
                  />
                )}
                <strong>{s.solicitante_nombre}</strong>
                <span className="text-body-secondary small">{s.solicitante_email}</span>
              </div>
              <span className={`badge ${BADGE[s.estado] || 'bg-secondary'}`}>{ETIQUETAS[s.estado] || s.estado}</span>
            </div>

            <p className="text-body-secondary small mt-2 mb-1">{new Date(s.fecha_solicitud).toLocaleString()}</p>
            {s.comentario && <p className="small mb-2">{s.comentario}</p>}

            <ul className="list-unstyled small my-2">
              {s.camaras.map((c) => (
                <li key={c.id} className="mb-2">
                  <button type="button" className="btn btn-link p-0 text-start d-block" onClick={() => setDetalleCamara(c)}>
                    <strong>{c.hostname}</strong>
                  </button>
                  {c.descripcion && <div className="text-body-secondary">{c.descripcion}</div>}
                  <div className="text-body-secondary">{c.piso} · {c.edificio}</div>
                  <div className="text-body-secondary">{c.area}</div>
                </li>
              ))}
            </ul>

            {puedeResolver && s.estado === 'pendiente' && (
              <div className="mt-2">
                <button onClick={() => resolver(s.id, 'aprobada')} className="btn btn-sm btn-success me-2">Aprobar</button>
                <button onClick={() => resolver(s.id, 'rechazada')} className="btn btn-sm btn-outline-danger">Rechazar</button>
              </div>
            )}
          </div>
        </div>
      ))}

      {solicitudes.length === 0 && <p className="text-body-secondary">No hay solicitudes para este filtro.</p>}

      {detalleCamara && (
        <>
          <div
            className="modal d-block"
            tabIndex="-1"
            role="dialog"
            onClick={(e) => { if (e.target === e.currentTarget) setDetalleCamara(null); }}
          >
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title h5">{detalleCamara.descripcion || detalleCamara.hostname}</h2>
                  <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setDetalleCamara(null)} />
                </div>
                <div className="modal-body">
                  <div className="camera-thumb camera-thumb-lg mb-3">
                    {detalleCamara.imagen_url ? (
                      <img src={detalleCamara.imagen_url} alt={detalleCamara.descripcion || detalleCamara.hostname} />
                    ) : (
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="7" width="15" height="12" rx="2" /><path d="M18 10l4-2v10l-4-2" />
                      </svg>
                    )}
                  </div>

                  <dl className="row mb-0">
                    <dt className="col-4 text-body-secondary fw-normal">Edificio</dt>
                    <dd className="col-8">{detalleCamara.edificio}</dd>
                    <dt className="col-4 text-body-secondary fw-normal">Piso</dt>
                    <dd className="col-8">{detalleCamara.piso}</dd>
                    <dt className="col-4 text-body-secondary fw-normal">Área</dt>
                    <dd className="col-8">{detalleCamara.area}</dd>
                    {detalleCamara.descripcion && (<><dt className="col-4 text-body-secondary fw-normal">Descripción</dt><dd className="col-8">{detalleCamara.descripcion}</dd></>)}
                    {detalleCamara.observaciones && (<><dt className="col-4 text-body-secondary fw-normal">Observaciones</dt><dd className="col-8">{detalleCamara.observaciones}</dd></>)}
                  </dl>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setDetalleCamara(null)}>Cerrar</button>
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
