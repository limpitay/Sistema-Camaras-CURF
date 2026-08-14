import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';
import UbicacionSelector from '../components/UbicacionSelector';

const ESTADO_LABEL = { activa: 'Activa', inactiva: 'Inactiva' };
const ESTADO_BADGE = { activa: 'text-bg-success', inactiva: 'text-bg-secondary' };

// RF-07: vista de solo lectura del inventario completo — Admin y
// Sistemas-lectura ven la misma grilla. El alta/edición de cámaras se hizo
// mover al panel CRUD (pestaña "Cámaras"), para no duplicar el mismo
// formulario en dos pantallas.
export default function InventarioAdmin() {
  const [camaras, setCamaras] = useState([]);
  const [filtroUbicacion, setFiltroUbicacion] = useState({ edificioId: null, pisoId: null, areaId: null });
  const [filtroEstado, setFiltroEstado] = useState('');
  const [detalle, setDetalle] = useState(null);

  const cargar = () => {
    const params = {
      edificio_id: filtroUbicacion.edificioId || undefined,
      piso_id: filtroUbicacion.pisoId || undefined,
      area_id: filtroUbicacion.areaId || undefined,
      estado: filtroEstado || undefined,
    };
    client.get('/camaras', { params }).then((res) => setCamaras(res.data));
  };

  useEffect(cargar, [filtroUbicacion, filtroEstado]);

  return (
    <Layout>
      <div className="mb-4">
        <h1 className="h4 fw-bold mb-1">Camaras</h1>
        <p className="text-body-secondary mb-0">
          {camaras.length} cámara{camaras.length === 1 ? '' : 's'} registrada{camaras.length === 1 ? '' : 's'}
        </p>
      </div>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-12 col-lg-9">
              <UbicacionSelector {...filtroUbicacion} onChange={setFiltroUbicacion} />
            </div>
            <div className="col-12 col-lg-3">
              <label className="form-label fw-semibold">Estado</label>
              <select className="form-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                <option value="activa">Activa</option>
                <option value="inactiva">Inactiva</option>
              </select>
            </div>
          </div>
        </div>
      </div>

      {camaras.length === 0 ? (
        <div className="text-center text-body-secondary py-5">No hay cámaras que coincidan con los filtros.</div>
      ) : (
        <div className="camera-grid">
          {camaras.map((c) => (
            <div className="card camera-card shadow-sm" key={c.id}>
              <div className="camera-thumb" role="button" onClick={() => setDetalle(c)}>
                {c.imagen_url ? (
                  <img src={c.imagen_url} alt={c.ubicacion || c.hostname} />
                ) : (
                  <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="7" width="15" height="12" rx="2" /><path d="M18 10l4-2v10l-4-2" />
                  </svg>
                )}
                <span className={`badge ${ESTADO_BADGE[c.estado] || 'text-bg-secondary'} camera-estado-badge`}>
                  {ESTADO_LABEL[c.estado] || c.estado}
                </span>
              </div>
              <div className="card-body">
                <div className="small text-body-secondary mb-1">{c.edificio} · {c.piso} · {c.area}</div>
                {c.ubicacion && <div className="small mb-1">{c.ubicacion}</div>}
                {c.observaciones && (
                  <p className="small fst-italic border-start border-2 ps-2 text-body-secondary mb-0">{c.observaciones}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {detalle && (
        <>
          <div
            className="modal d-block"
            tabIndex="-1"
            role="dialog"
            onClick={(e) => { if (e.target === e.currentTarget) setDetalle(null); }}
          >
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title h5">{detalle.hostname}</h2>
                  <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setDetalle(null)} />
                </div>
                <div className="modal-body">
                  <div className="camera-thumb camera-thumb-lg mb-3">
                    {detalle.imagen_url ? (
                      <img src={detalle.imagen_url} alt={detalle.ubicacion || detalle.hostname} />
                    ) : (
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="7" width="15" height="12" rx="2" /><path d="M18 10l4-2v10l-4-2" />
                      </svg>
                    )}
                    <span className={`badge ${ESTADO_BADGE[detalle.estado] || 'text-bg-secondary'} camera-estado-badge`}>
                      {ESTADO_LABEL[detalle.estado] || detalle.estado}
                    </span>
                  </div>

                  <dl className="row mb-0">
                    <dt className="col-4 text-body-secondary fw-normal">Edificio</dt>
                    <dd className="col-8">{detalle.edificio}</dd>
                    <dt className="col-4 text-body-secondary fw-normal">Piso</dt>
                    <dd className="col-8">{detalle.piso}</dd>
                    <dt className="col-4 text-body-secondary fw-normal">Área</dt>
                    <dd className="col-8">{detalle.area}</dd>
                    {detalle.ubicacion && (<><dt className="col-4 text-body-secondary fw-normal">Ubicación</dt><dd className="col-8">{detalle.ubicacion}</dd></>)}
                    {detalle.descripcion && (<><dt className="col-4 text-body-secondary fw-normal">Descripción</dt><dd className="col-8">{detalle.descripcion}</dd></>)}
                    {detalle.observaciones && (<><dt className="col-4 text-body-secondary fw-normal">Observaciones</dt><dd className="col-8">{detalle.observaciones}</dd></>)}
                  </dl>
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
