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
  const puedeResolver = user?.rol === 'direccion';

  const [solicitudes, setSolicitudes] = useState([]);
  const [filtroEstado, setFiltroEstado] = useState('pendiente');
  const [seleccionadas, setSeleccionadas] = useState([]);

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
            <span className="text-muted small">{seleccionadas.length} seleccionada(s)</span>
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
                <span className="text-muted small">{s.solicitante_email}</span>
              </div>
              <span className={`badge ${BADGE[s.estado] || 'bg-secondary'}`}>{ETIQUETAS[s.estado] || s.estado}</span>
            </div>

            <p className="text-muted small mt-2 mb-1">{new Date(s.fecha_solicitud).toLocaleString()}</p>
            {s.comentario && <p className="small mb-2">{s.comentario}</p>}

            <ul className="list-unstyled small my-2">
              {s.camaras.map((c) => (
                <li key={c.id}>
                  <strong>{c.descripcion || c.hostname}</strong> — {c.edificio} · {c.piso} · {c.area}
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

      {solicitudes.length === 0 && <p className="text-muted">No hay solicitudes para este filtro.</p>}
    </Layout>
  );
}
