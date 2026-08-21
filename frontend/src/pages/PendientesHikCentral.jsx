import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

// RF-16/RF-20/RF-21/RF-22: todo lo que Dirección ya aprobó/revocó pero
// Sistemas todavía no replicó en HikCentral. Solo Admin puede marcar acciones.
export default function PendientesHikCentral() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'admin';
  const [items, setItems] = useState([]);
  const [seleccionadas, setSeleccionadas] = useState([]);
  const navigate = useNavigate();

  const cargar = () => {
    client.get('/accesos/pendientes-hikcentral').then((res) => setItems(res.data));
  };

  useEffect(cargar, []);

  // Agrupado por usuario (RF-20/RF-21): así se pueden tildar varias cámaras
  // de la misma persona y mandarlas juntas a Accesos NVR de una sola vez, en
  // vez de repetir "Agregar en Accesos NVR" cámara por cámara.
  const grupos = [];
  const indicePorUsuario = new Map();
  for (const it of items) {
    if (!indicePorUsuario.has(it.usuario_id)) {
      indicePorUsuario.set(it.usuario_id, grupos.length);
      grupos.push({ usuario_id: it.usuario_id, usuario_nombre: it.usuario_nombre, email_institucional: it.email_institucional, items: [] });
    }
    grupos[indicePorUsuario.get(it.usuario_id)].items.push(it);
  }

  const aplicar = async (id) => {
    await client.patch(`/accesos/${id}/aplicar`);
    cargar();
  };

  const confirmarBaja = async (id) => {
    await client.patch(`/accesos/${id}/confirmar-baja`);
    cargar();
  };

  const toggleSeleccion = (id) => {
    setSeleccionadas((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const toggleGrupo = (altas) => {
    const ids = altas.map((it) => it.id);
    const todasMarcadas = ids.every((id) => seleccionadas.includes(id));
    setSeleccionadas((prev) => (
      todasMarcadas ? prev.filter((id) => !ids.includes(id)) : [...new Set([...prev, ...ids])]
    ));
  };

  // Lleva las cámaras tildadas de este usuario a Accesos NVR para elegir ahí
  // a qué cuenta NVR se les da el acceso — se aplican todas juntas en un
  // solo paso.
  const irAAccesosNvr = (altas) => {
    const elegidas = altas.filter((it) => seleccionadas.includes(it.id));
    navigate('/accesos-nvr', {
      state: {
        camarasParaAcceso: elegidas.map((it) => ({
          id: it.camara_id, hostname: it.hostname, descripcion: it.descripcion,
          edificio: it.edificio, piso: it.piso, area: it.area,
        })),
      },
    });
  };

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-4">Pendientes de aplicar en HikCentral</h1>

      {grupos.map((grupo) => {
        const altas = grupo.items.filter((it) => it.activo && !it.aplicado_en_hikcentral);
        const marcadas = altas.filter((it) => seleccionadas.includes(it.id));
        const todasMarcadas = altas.length > 0 && marcadas.length === altas.length;
        const hayCheckbox = esAdmin && altas.length > 0;

        return (
          <div key={grupo.usuario_id} className="card shadow-sm mb-3">
            <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
              <div>
                <strong>{grupo.usuario_nombre}</strong>
                <span className="text-body-secondary small ms-2">{grupo.email_institucional}</span>
              </div>
              {hayCheckbox && (
                <button
                  type="button"
                  className="btn btn-sm btn-primary"
                  disabled={marcadas.length === 0}
                  onClick={() => irAAccesosNvr(altas)}
                >
                  Agregar en Accesos NVR{marcadas.length > 0 ? ` (${marcadas.length})` : ''}
                </button>
              )}
            </div>
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    {hayCheckbox && (
                      <th style={{ width: 40 }}>
                        <input
                          type="checkbox"
                          className="form-check-input"
                          checked={todasMarcadas}
                          onChange={() => toggleGrupo(altas)}
                          aria-label="Seleccionar todas"
                        />
                      </th>
                    )}
                    <th>Hostname</th><th>Piso</th><th>Edificio</th><th>Área</th><th>Tipo</th><th>Fecha</th>{esAdmin && <th>Acción</th>}
                  </tr>
                </thead>
                <tbody>
                  {grupo.items.map((it) => {
                    const esAlta = it.activo && !it.aplicado_en_hikcentral;
                    return (
                      <tr key={it.id}>
                        {hayCheckbox && (
                          <td>
                            {esAlta && (
                              <input
                                type="checkbox"
                                className="form-check-input"
                                checked={seleccionadas.includes(it.id)}
                                onChange={() => toggleSeleccion(it.id)}
                                aria-label={`Seleccionar ${it.hostname}`}
                              />
                            )}
                          </td>
                        )}
                        <td>{it.hostname}</td>
                        <td>{it.piso}</td>
                        <td>{it.edificio}</td>
                        <td>{it.area}</td>
                        <td>
                          <span className={`badge ${esAlta ? 'bg-warning text-dark' : 'bg-danger'}`}>{esAlta ? 'Alta' : 'Baja'}</span>
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
        );
      })}

      {items.length === 0 && <p className="text-muted mt-3">No hay nada pendiente de aplicar.</p>}
    </Layout>
  );
}
