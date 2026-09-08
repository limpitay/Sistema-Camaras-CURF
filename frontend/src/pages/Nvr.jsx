import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

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

function formatearBytes(bytes) {
  if (!bytes && bytes !== 0) return '—';
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

// Valor por defecto para los <input type="datetime-local"> — ahora y hace 24h.
function isoLocal(date) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

// dd-mm-aaaa hh:mm:ss en hora Argentina (UTC-3 fijo, sin horario de
// verano) -- mismo formato que el script de referencia por fuera de la app.
function formatearFecha(iso) {
  if (!iso) return '—';
  const argentina = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  const fecha = `${pad(argentina.getUTCDate())}-${pad(argentina.getUTCMonth() + 1)}-${argentina.getUTCFullYear()}`;
  const hora = `${pad(argentina.getUTCHours())}:${pad(argentina.getUTCMinutes())}:${pad(argentina.getUTCSeconds())}`;
  return `${fecha} ${hora} (ARG)`;
}

export default function Nvr() {
  const { user } = useAuth();
  const puedeDescargarGrabaciones = user?.rol === 'admin' || user?.rol === 'avanzado';

  const [nvrs, setNvrs] = useState([]);
  const [seleccionado, setSeleccionado] = useState(null);
  const [estado, setEstado] = useState(null);
  const [canales, setCanales] = useState(null);
  const [cargandoEstado, setCargandoEstado] = useState(false);
  const [cargandoCanales, setCargandoCanales] = useState(false);
  const [errorEstado, setErrorEstado] = useState('');
  const [errorCanales, setErrorCanales] = useState('');

  const [canalGrab, setCanalGrab] = useState('');
  const [desdeGrab, setDesdeGrab] = useState(() => isoLocal(new Date(Date.now() - 24 * 60 * 60 * 1000)));
  const [hastaGrab, setHastaGrab] = useState(() => isoLocal(new Date()));
  const [segmentos, setSegmentos] = useState(null);
  const [cargandoBuscar, setCargandoBuscar] = useState(false);
  const [errorBuscar, setErrorBuscar] = useState('');
  const [descargando, setDescargando] = useState(null);
  const [archivos, setArchivos] = useState([]);
  const [errorArchivos, setErrorArchivos] = useState('');

  useEffect(() => { client.get('/nvrs').then((res) => setNvrs(res.data)); }, []);

  const cargarArchivos = () => {
    if (!puedeDescargarGrabaciones) return;
    client.get('/grabaciones').then((res) => setArchivos(res.data)).catch(() => {});
  };
  useEffect(cargarArchivos, [puedeDescargarGrabaciones]);

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

  const buscarSegmentos = async () => {
    setCargandoBuscar(true);
    setErrorBuscar('');
    setSegmentos(null);
    try {
      const desde = new Date(desdeGrab).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const hasta = new Date(hastaGrab).toISOString().replace(/\.\d{3}Z$/, 'Z');
      const { data } = await client.get(`/grabaciones/buscar/${seleccionado.id}/${canalGrab}`, { params: { desde, hasta } });
      setSegmentos(data);
    } catch (err) {
      setErrorBuscar(err.response?.data?.error || 'No se pudo buscar grabaciones.');
    } finally {
      setCargandoBuscar(false);
    }
  };

  const traerSegmento = async (segmento, idx) => {
    setDescargando(idx);
    try {
      await client.post(`/grabaciones/traer/${seleccionado.id}/${canalGrab}`, {
        playbackURI: segmento.playbackURI,
        inicio: segmento.inicio,
      }, { timeout: 30 * 60 * 1000 });
      cargarArchivos();
    } catch (err) {
      window.alert(err.response?.data?.error || 'No se pudo descargar el segmento.');
    } finally {
      setDescargando(null);
    }
  };

  const bajarArchivo = async (nombre) => {
    const res = await client.get(`/grabaciones/${encodeURIComponent(nombre)}`, { responseType: 'blob', timeout: 30 * 60 * 1000 });
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = nombre;
    a.click();
    URL.revokeObjectURL(url);
  };

  const borrarArchivo = async (nombre) => {
    if (!window.confirm(`Borrar ${nombre} del servidor?`)) return;
    await client.delete(`/grabaciones/${encodeURIComponent(nombre)}`);
    cargarArchivos();
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
                        {estado.discos.length > 0 && (() => {
                          const capacidadTotal = estado.discos.reduce((acc, d) => acc + d.capacidadMb, 0);
                          const libreTotal = estado.discos.reduce((acc, d) => acc + d.libreMb, 0);
                          const usadoPctTotal = capacidadTotal ? Math.round(((capacidadTotal - libreTotal) / capacidadTotal) * 100) : 0;
                          return (
                            <div className="mb-0 mt-3 pt-2 border-top">
                              <div className="d-flex justify-content-between small mb-1 fw-semibold">
                                <span>Total ({estado.discos.length} disco{estado.discos.length > 1 ? 's' : ''})</span>
                                <span className="text-body-secondary fw-normal">{formatearMb(libreTotal)} libres de {formatearMb(capacidadTotal)}</span>
                              </div>
                              <div className="progress" role="progressbar" aria-valuenow={usadoPctTotal} aria-valuemin={0} aria-valuemax={100} style={{ height: 10 }}>
                                <div className={`progress-bar ${usadoPctTotal > 90 ? 'bg-danger' : ''}`} style={{ width: `${usadoPctTotal}%` }} />
                              </div>
                            </div>
                          );
                        })()}
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

              {puedeDescargarGrabaciones && (
                <div className="card shadow-sm">
                  <div className="card-header">
                    <span className="fw-semibold">Grabaciones</span>
                    <span className="badge text-bg-warning ms-2">Temporal</span>
                  </div>
                  <div className="card-body">
                    <p className="small text-body-secondary">
                      Trae clips puntuales del NVR al servidor para descargarlos. El archivo que devuelve el equipo es
                      su formato propietario (aunque se guarde como .mp4) — puede necesitar conversion para
                      reproducirse fuera de las herramientas de Hikvision. Cada segmento puede pesar varios cientos de
                      MB o mas de 1 GB.
                    </p>
                    <div className="row g-2 align-items-end mb-3">
                      <div className="col-6 col-md-2">
                        <label className="form-label small mb-1">Canal</label>
                        <input type="number" min="1" className="form-control form-control-sm" value={canalGrab} onChange={(e) => setCanalGrab(e.target.value)} />
                      </div>
                      <div className="col-6 col-md-3">
                        <label className="form-label small mb-1">Desde</label>
                        <input type="datetime-local" className="form-control form-control-sm" value={desdeGrab} onChange={(e) => setDesdeGrab(e.target.value)} />
                      </div>
                      <div className="col-6 col-md-3">
                        <label className="form-label small mb-1">Hasta</label>
                        <input type="datetime-local" className="form-control form-control-sm" value={hastaGrab} onChange={(e) => setHastaGrab(e.target.value)} />
                      </div>
                      <div className="col-6 col-md-2">
                        <button type="button" className="btn btn-sm btn-outline-secondary w-100" disabled={!canalGrab || cargandoBuscar} onClick={buscarSegmentos}>
                          {cargandoBuscar ? 'Buscando...' : 'Buscar'}
                        </button>
                      </div>
                    </div>

                    {errorBuscar && <div className="alert alert-danger py-2">{errorBuscar}</div>}

                    {segmentos && (
                      <div className="table-responsive mb-3">
                        <table className="table table-sm align-middle">
                          <thead>
                            <tr>
                              <th>Desde</th>
                              <th>Hasta</th>
                              <th>Tamano</th>
                              <th></th>
                            </tr>
                          </thead>
                          <tbody>
                            {segmentos.map((s, idx) => (
                              <tr key={idx}>
                                <td className="small">{formatearFecha(s.inicio)}</td>
                                <td className="small">{formatearFecha(s.fin)}</td>
                                <td className="small">{formatearBytes(s.tamanoBytes)}</td>
                                <td>
                                  <button
                                    type="button"
                                    className="btn btn-sm btn-outline-primary"
                                    disabled={descargando === idx}
                                    onClick={() => traerSegmento(s, idx)}
                                  >
                                    {descargando === idx ? 'Trayendo...' : 'Traer al servidor'}
                                  </button>
                                </td>
                              </tr>
                            ))}
                            {segmentos.length === 0 && (
                              <tr><td colSpan={4} className="text-body-secondary small">Sin grabaciones en ese rango.</td></tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}

                    <h3 className="h6 fw-semibold">Archivos en el servidor</h3>
                    {errorArchivos && <div className="alert alert-danger py-2">{errorArchivos}</div>}
                    <div className="table-responsive">
                      <table className="table table-sm align-middle mb-0">
                        <thead>
                          <tr>
                            <th>Archivo</th>
                            <th>Tamano</th>
                            <th>Creado</th>
                            <th></th>
                          </tr>
                        </thead>
                        <tbody>
                          {archivos.map((a) => (
                            <tr key={a.nombre}>
                              <td className="small">{a.nombre}</td>
                              <td className="small">{formatearBytes(a.bytes)}</td>
                              <td className="small">{formatearFecha(a.creado)}</td>
                              <td className="text-end">
                                <button type="button" className="btn btn-sm btn-outline-secondary me-1" onClick={() => bajarArchivo(a.nombre)}>Bajar</button>
                                <button type="button" className="btn btn-sm btn-outline-danger" onClick={() => borrarArchivo(a.nombre)}>Borrar</button>
                              </td>
                            </tr>
                          ))}
                          {archivos.length === 0 && (
                            <tr><td colSpan={4} className="text-body-secondary small">Sin archivos descargados todavia.</td></tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </Layout>
  );
}
