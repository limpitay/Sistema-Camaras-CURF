import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';

const BADGE = { pendiente: 'bg-warning text-dark', aprobada: 'bg-success', rechazada: 'bg-danger' };
const ETIQUETAS = { pendiente: 'Pendiente', aprobada: 'Aprobada', rechazada: 'Rechazada' };

export default function MisSolicitudes() {
  const [solicitudes, setSolicitudes] = useState([]);

  useEffect(() => {
    client.get('/solicitudes/mias').then((res) => setSolicitudes(res.data));
  }, []);

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-4">Mis solicitudes</h1>

      {solicitudes.map((s) => (
        <div key={s.id} className="card shadow-sm mb-3">
          <div className="card-body">
            <div className="d-flex justify-content-between align-items-start">
              <span className="text-muted small">{new Date(s.fecha_solicitud).toLocaleString()}</span>
              <span className={`badge ${BADGE[s.estado] || 'bg-secondary'}`}>{ETIQUETAS[s.estado] || s.estado}</span>
            </div>
            {s.comentario && <p className="text-body-secondary small mt-2 mb-2">{s.comentario}</p>}
            <ul className="list-unstyled small mb-0 mt-2">
              {s.camaras.map((c) => (
                <li key={c.id}>
                  <strong>{c.descripcion || c.hostname}</strong> — {c.edificio} · {c.piso} · {c.area}
                </li>
              ))}
            </ul>
            {s.fecha_resolucion && (
              <p className="text-muted small mt-2 mb-0">
                Resuelta el {new Date(s.fecha_resolucion).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      ))}

      {solicitudes.length === 0 && <p className="text-muted">Todavía no hiciste ninguna solicitud.</p>}
    </Layout>
  );
}
