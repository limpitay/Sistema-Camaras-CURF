import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';

// RF-17/RF-18/RF-19: accesos vigentes o historial completo, filtrable por
// usuario o por cámara.
export default function Historial() {
  const [items, setItems] = useState([]);
  const [soloActivos, setSoloActivos] = useState(true);

  useEffect(() => {
    const params = soloActivos ? { activo: 'true' } : {};
    client.get('/accesos', { params }).then((res) => setItems(res.data));
  }, [soloActivos]);

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-4">Historial de accesos</h1>

      <div className="form-check mb-3">
        <input
          type="checkbox"
          className="form-check-input"
          id="soloActivos"
          checked={soloActivos}
          onChange={(e) => setSoloActivos(e.target.checked)}
        />
        <label className="form-check-label small" htmlFor="soloActivos">Solo accesos vigentes</label>
      </div>

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Email</th><th>Hostname</th><th>Descripción</th><th>Piso</th><th>Edificio</th>
                <th>Otorgado</th><th>Activo</th><th>Aplicado en HikCentral</th><th>Revocado</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it) => (
                <tr key={it.id}>
                  <td>{it.email_institucional}</td>
                  <td>{it.hostname}</td>
                  <td>{it.descripcion}</td>
                  <td>{it.piso}</td>
                  <td>{it.edificio}</td>
                  <td>{new Date(it.fecha_otorgado).toLocaleString()}</td>
                  <td>
                    <span className={`badge ${it.activo ? 'bg-success' : 'bg-body-secondary text-body'}`}>
                      {it.activo ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td>
                    <span className={`badge ${it.aplicado_en_hikcentral ? 'bg-success' : 'bg-warning text-dark'}`}>
                      {it.aplicado_en_hikcentral ? 'Sí' : 'No'}
                    </span>
                  </td>
                  <td>{it.fecha_revocacion ? new Date(it.fecha_revocacion).toLocaleString() : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </Layout>
  );
}
