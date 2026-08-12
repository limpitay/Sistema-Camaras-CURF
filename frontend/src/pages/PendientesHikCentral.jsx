import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

// RF-16/RF-20/RF-21/RF-22: todo lo que Dirección ya aprobó/revocó pero
// Sistemas todavía no replicó en HikCentral. Solo Admin puede marcar acciones.
export default function PendientesHikCentral() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'admin';
  const [items, setItems] = useState([]);

  const cargar = () => {
    client.get('/accesos/pendientes-hikcentral').then((res) => setItems(res.data));
  };

  useEffect(cargar, []);

  const aplicar = async (id) => {
    await client.patch(`/accesos/${id}/aplicar`);
    cargar();
  };

  const confirmarBaja = async (id) => {
    await client.patch(`/accesos/${id}/confirmar-baja`);
    cargar();
  };

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-4">Pendientes de aplicar en HikCentral</h1>

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Usuario</th><th>Email</th><th>Cámara</th><th>Tipo</th><th>Fecha</th>{esAdmin && <th>Acción</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((it) => {
                const esAlta = it.activo && !it.aplicado_en_hikcentral;
                return (
                  <tr key={it.id}>
                    <td>{it.usuario_nombre}</td>
                    <td>{it.email_institucional}</td>
                    <td>{it.descripcion || it.hostname}</td>
                    <td>
                      <span className={`badge ${esAlta ? 'bg-warning text-dark' : 'bg-danger'}`}>
                        {esAlta ? 'Alta pendiente' : 'Baja pendiente'}
                      </span>
                    </td>
                    <td>{new Date(esAlta ? it.fecha_otorgado : it.fecha_revocacion).toLocaleString()}</td>
                    {esAdmin && (
                      <td>
                        {esAlta
                          ? <button className="btn btn-sm btn-success" onClick={() => aplicar(it.id)}>Marcar aplicado</button>
                          : <button className="btn btn-sm btn-outline-danger" onClick={() => confirmarBaja(it.id)}>Confirmar baja</button>}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
      {items.length === 0 && <p className="text-muted mt-3">No hay nada pendiente de aplicar.</p>}
    </Layout>
  );
}
