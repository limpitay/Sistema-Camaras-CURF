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
              <span className="text-body-secondary small">{new Date(s.fecha_solicitud).toLocaleString()}</span>
              <span className={`badge ${BADGE[s.estado] || 'bg-secondary'}`}>{ETIQUETAS[s.estado] || s.estado}</span>
            </div>
            {s.comentario && <p className="text-body-secondary small mt-2 mb-2">{s.comentario}</p>}

            {s.estado === 'aprobada' ? (
              <div className="table-responsive mt-2">
                <table className="table table-sm align-middle mb-0">
                  <thead>
                    <tr>
                      <th>Camara</th><th>Ubicacion</th><th>IP</th><th>Usuario</th><th>Contrasena</th><th>NVR</th>
                    </tr>
                  </thead>
                  <tbody>
                    {s.camaras.map((c) => (
                      <tr key={c.id}>
                        <td>{c.descripcion || c.hostname}</td>
                        <td>{c.edificio} · {c.piso} · {c.area}</td>
                        <td>{c.ip || '—'}</td>
                        <td>{c.usuario || '—'}</td>
                        <td>{c.contrasena || '—'}</td>
                        <td>{c.nvr || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="text-body-secondary small mt-2 mb-0">
                  Entra con la IP, usuario y contrasena de cada camara desde SmartPSS o el Client de HikCentral.
                </p>
              </div>
            ) : (
              <ul className="list-unstyled small mb-0 mt-2">
                {s.camaras.map((c) => (
                  <li key={c.id}>
                    <strong>{c.descripcion || c.hostname}</strong> — {c.edificio} · {c.piso} · {c.area}
                  </li>
                ))}
              </ul>
            )}

            {s.fecha_resolucion && (
              <p className="text-body-secondary small mt-2 mb-0">
                Resuelta el {new Date(s.fecha_resolucion).toLocaleString()}
              </p>
            )}
          </div>
        </div>
      ))}

      {solicitudes.length === 0 && <p className="text-body-secondary">Todavia no hiciste ninguna solicitud.</p>}
    </Layout>
  );
}
