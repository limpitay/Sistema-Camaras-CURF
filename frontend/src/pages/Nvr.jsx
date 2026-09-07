import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';

// Panel NVR: a diferencia de Recursos > NVR (inventario cargado a mano), esto
// consulta el equipo en vivo por ISAPI (ver backend/src/utils/isapiClient.js)
// — info de dispositivo, discos, y retencion de grabacion por canal. Todo de
// solo lectura y disparado a mano (boton "Actualizar"), nunca automatico, para
// no bombardear NVRs embebidos que aceptan pocas sesiones HTTP simultaneas.
function formatearMb(mb) {
  if (!mb && mb !== 0) return '—';
  const gb = mb / 1024;
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${mb} MB`;
}

function formatearFecha(iso) {
  if (!iso) return '—';
  return new Date(iso).toLocaleDateString('es-AR');
}

export default function Nvr() {
  const [nvrs, setNvrs] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [estado, setEstado] = useState(null);
  const [canales, setCanales] = useState(null);
  const [cargandoEstado, setCargandoEstado] = useState(false);
  const [cargandoCanales, setCargandoCanales] = useState(false);
  const [errorEstado, setErrorEstado] = useState('');
  const [errorCanales, setErrorCanales] = useState('');

  useEffect(() => { client.get('/nvrs').then((res) => setNvrs(res.data)); }, []);

  const elegir = (nvr) => {
    setSeleccionado(nvr);
    setEstado(null);
    setCanales(null);
    setErrorEstado('');
    setErrorCanales('');
  };

  const consultarEstado = async () => {
    setCargandoEstado(true);
    setErrorEstado('');
    try {
      const { data } = await client.get(`/nvrs/${seleccionado.id}/estado`);
      setEstado(data);
    } catch (err) {
      setErrorEstado(err.response?.data?.error || 'No se pudo consultar el NVR.');
    } finally {
      setCargandoEstado(false);
    }
  };

  const consultarCanales = async () => {
    setCargandoCanales(true);
    setErrorCanales('');
    try {
      const { data } = await client.get(`/nvrs/${seleccionado.id}/canales`);
      setCanales(data);
    } catch (err) {
      setErrorCanales(err.response?.data?.error || 'No se pudo consultar los canales.');
    } finally {
      setCargandoCanales(false);
    }
  };

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-1">Panel NVR</h1>
      <p className="text-body-secondary small mb-4">
        Consulta en vivo a cada equipo (ISAPI) — no reemplaza el inventario de Recursos &gt; NVR, lo complementa con
        el estado real del dispositivo.
      </p>

      <div className="row g-3">
        <div className="col-12 col-md-3">
          <div className="card shadow-sm">
            <div className="card-header fw-semibold">NVRs</div>
            <div className="list-group list-group-flush">
              {nvrs.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  className={`list-group-item list-group-item-action${seleccionado?.id === n.id ? ' active' : ''}`}
                  onClick={() => elegir(n)}
                >
                  <div className="fw-semibold">{n.hostname}</div>
                  <div className="small text-body-secondary">{n.ip || 'sin IP'}</div>
                </button>
              ))}
              {nvrs.length === 0 && <div className="list-group-item text-body-secondary small">Sin NVRs cargados.</div>}
            </div>
          </div>
        </div>

        <div className="col-12 col-md-9">
          {!seleccionado && (
            <div className="text-body-secondary">Elegi un NVR de la lista para ver su estado.</div>
          )}

          {seleccionado && (
            <div className="d-flex flex-column gap-3">
              <div className="card shadow-sm">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <span className="fw-semibold">Dashboard — {seleccionado.hostname}</span>
                  <button type="button" className="btn btn-sm btn-outline-secondary" disabled={cargandoEstado} onClick={consultarEstado}>
                    {cargandoEstado ? 'Consultando...' : 'Actualizar'}
                  </button>
                </div>
                <div className="card-body">
                  {errorEstado && <div className="alert alert-danger py-2">{errorEstado}</div>}
                  {!estado && !errorEstado && (
                    <div className="text-body-secondary small">Todavia no consultado en esta sesion.</div>
                  )}
                  {estado && (
                    <div className="row g-3">
                      <div className="col-12 col-md-6">
                        <h3 className="h6 fw-semibold">Dispositivo</h3>
                        <dl className="row mb-0 small">
                          <dt className="col-5 text-body-secondary fw-normal">Nombre</dt><dd className="col-7">{estado.dispositivo.nombre || '—'}</dd>
                          <dt className="col-5 text-body-secondary fw-normal">Modelo</dt><dd className="col-7">{estado.dispositivo.modelo || '—'}</dd>
                          <dt className="col-5 text-body-secondary fw-normal">Firmware</dt><dd className="col-7">{estado.dispositivo.firmware || '—'}</dd>
                          <dt className="col-5 text-body-secondary fw-normal">N° serie</dt><dd className="col-7">{estado.dispositivo.numeroSerie || '—'}</dd>
                        </dl>
                      </div>
                      <div className="col-12 col-md-6">
                        <h3 className="h6 fw-semibold">Discos</h3>
                        {estado.discos.length === 0 && <div className="text-body-secondary small">Sin discos informados.</div>}
                        {estado.discos.map((d) => {
                          const usadoPct = d.capacidadMb ? Math.round(((d.capacidadMb - d.libreMb) / d.capacidadMb) * 100) : 0;
                          return (
                            <div key={d.id} className="mb-2">
                              <div className="d-flex justify-content-between small mb-1">
                                <span>Disco {d.id} {d.estado ? `(${d.estado})` : ''}</span>
                                <span className="text-body-secondary">{formatearMb(d.libreMb)} libres de {formatearMb(d.capacidadMb)}</span>
                              </div>
                              <div className="progress" role="progressbar" aria-valuenow={usadoPct} aria-valuemin={0} aria-valuemax={100} style={{ height: 8 }}>
                                <div className={`progress-bar ${usadoPct > 90 ? 'bg-danger' : ''}`} style={{ width: `${usadoPct}%` }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <div className="card shadow-sm">
                <div className="card-header d-flex justify-content-between align-items-center">
                  <span className="fw-semibold">Consumo de canales</span>
                  <button type="button" className="btn btn-sm btn-outline-secondary" disabled={cargandoCanales} onClick={consultarCanales}>
                    {cargandoCanales ? 'Consultando...' : 'Actualizar'}
                  </button>
                </div>
                <div className="card-body">
                  {errorCanales && <div className="alert alert-danger py-2">{errorCanales}</div>}
                  {!canales && !errorCanales && (
                    <div className="text-body-secondary small">
                      Recorre cada canal (1 a {seleccionado.canales_totales || '?'}) preguntando su grabacion mas
                      antigua — puede tardar, un pedido por canal.
                    </div>
                  )}
                  {canales && (
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th>Canal</th>
                            <th>Camara</th>
                            <th>Estado</th>
                            <th>IP</th>
                            <th>Grabacion mas antigua</th>
                            <th>Dias disponibles</th>
                            <th>Usado (aproximado)</th>
                          </tr>
                        </thead>
                        <tbody>
                          {canales.map((c) => (
                            <tr key={c.canal}>
                              <td>{c.canal}</td>
                              <td>{c.camara ? (c.camara.descripcion || c.camara.hostname) : <span className="text-body-secondary">sin asignar</span>}</td>
                              <td>
                                {c.online === null ? '—' : (
                                  <span className={`badge ${c.online ? 'text-bg-success' : 'text-bg-secondary'}`}>{c.online ? 'Online' : 'Offline'}</span>
                                )}
                              </td>
                              <td className="small text-body-secondary">{c.ip || '—'}</td>
                              <td>{c.error ? <span className="text-danger small">{c.error}</span> : formatearFecha(c.grabacionMasAntigua)}</td>
                              <td>{c.diasDisponibles ?? '—'}</td>
                              <td>{c.gbEstimado != null ? `~${c.gbEstimado.toFixed(1)} GB` : '—'}</td>
                            </tr>
                          ))}
                        </tbody>
                        {canales.some((c) => c.gbEstimado != null) && (
                          <tfoot>
                            <tr className="fw-semibold">
                              <td colSpan={5} className="text-end">Total usado (aproximado)</td>
                              <td>~{canales.reduce((acc, c) => acc + (c.gbEstimado || 0), 0).toFixed(0)} GB</td>
                            </tr>
                          </tfoot>
                        )}
                      </table>
                    </div>
                  )}
                  <p className="small text-body-secondary mt-2 mb-0">
                    El almacenamiento es una estimacion (bitrate maximo configurado x dias grabados), no el consumo
                    real medido por el NVR — no existe ese endpoint en modo overwrite/pool compartido.
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
