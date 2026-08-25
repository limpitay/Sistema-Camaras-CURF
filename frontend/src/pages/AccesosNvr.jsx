import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import client from '../api/client';
import Layout from '../components/Layout';
import NavModal from '../components/NavModal';
import { useAuth } from '../context/AuthContext';

// Cuentas configuradas directamente en el NVR/HikCentral (vigilancia,
// sistemas, enfermeriaqx, etc.) — no son usuarios de este panel, son logins
// del equipo real. Acá se navega en dos niveles: lista de cuentas -> detalle
// de qué cámaras puede ver cada una, discriminando en vivo vs reproducción.
// Alta/edición/baja de cuentas y de accesos puntuales es solo para Admin
// (Sistemas-lectura ve todo en modo lectura, igual que el resto del panel).
const ESTADO_LABEL = { activa: 'Activa', inactiva: 'Inactiva' };
const ESTADO_BADGE = { activa: 'text-bg-success', inactiva: 'text-bg-secondary' };

function CamaraThumb({ camara, grande }) {
  return (
    <div className={`camera-thumb ${grande ? 'camera-thumb-lg' : ''}`}>
      {camara.imagen_url ? (
        <img src={camara.imagen_url} alt={camara.descripcion || camara.hostname} />
      ) : (
        <svg width={grande ? 64 : 40} height={grande ? 64 : 40} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
          <rect x="3" y="7" width="15" height="12" rx="2" /><path d="M18 10l4-2v10l-4-2" />
        </svg>
      )}
      {camara.estado && (
        <span className={`badge ${ESTADO_BADGE[camara.estado] || 'text-bg-secondary'} camera-estado-badge`}>
          {ESTADO_LABEL[camara.estado] || camara.estado}
        </span>
      )}
    </div>
  );
}

const NUEVA_CUENTA = '__nueva__';

// Formulario suelto para dar de alta un acceso desde Pendientes HikCentral:
// la cámara ya viene elegida, acá solo se elige a qué cuenta NVR agregarla —
// al elegirla se muestra su login/contraseña de HikCentral para tenerlos a
// mano y aplicar el acceso en el equipo real. Si la cuenta todavía no existe
// (ej. "dvega" para un usuario nuevo), se puede crear ahí mismo sin salir del
// flujo — se crea primero, y con esa misma cámara ya queda cargada.
function ModalAccesoRapido({ modalRapido, setModalRapido, cuentas, usuarios, error, guardando, onSubmit }) {
  const cuentaElegida = cuentas.find((c) => String(c.id) === String(modalRapido.cuenta_id));
  const creandoCuenta = modalRapido.cuenta_id === NUEVA_CUENTA;
  return (
    <>
      <div className="modal d-block" tabIndex="-1" role="dialog" onClick={(e) => { if (e.target === e.currentTarget) setModalRapido(null); }}>
        <div className="modal-dialog modal-dialog-centered" role="document">
          <form className="modal-content" onSubmit={onSubmit}>
            <div className="modal-header">
              <h2 className="modal-title h5">
                Agregar acceso — {modalRapido.camaras.length === 1
                  ? (modalRapido.camaras[0].descripcion || modalRapido.camaras[0].hostname)
                  : `${modalRapido.camaras.length} cámaras`}
              </h2>
              <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setModalRapido(null)} />
            </div>
            <div className="modal-body">
              <div className="mb-3" style={{ maxHeight: 180, overflowY: 'auto' }}>
                {modalRapido.camaras.map((cam) => (
                  <div key={cam.id} className="border-bottom pb-2 mb-2">
                    <div className="fw-semibold">{cam.hostname}</div>
                    {cam.descripcion && <div className="text-body-secondary small">{cam.descripcion}</div>}
                    <div className="text-body-secondary small">{cam.piso} · {cam.edificio} · {cam.area}</div>
                  </div>
                ))}
              </div>

              <div className="mb-3">
                <label className="form-label">Cuenta NVR</label>
                <select
                  className="form-select"
                  value={modalRapido.cuenta_id}
                  onChange={(e) => setModalRapido((m) => ({ ...m, cuenta_id: e.target.value }))}
                  required
                  autoFocus
                >
                  <option value="" disabled>Elegí una cuenta...</option>
                  <option value={NUEVA_CUENTA}>+ Crear cuenta nueva...</option>
                  {cuentas.map((c) => <option key={c.id} value={c.id}>{c.nombre}</option>)}
                </select>
              </div>

              {cuentaElegida && (
                <div className="alert alert-secondary small py-2">
                  Login de HikCentral: <strong>{cuentaElegida.nombre}</strong>
                  {cuentaElegida.contrasena
                    ? <> / <strong>{cuentaElegida.contrasena}</strong></>
                    : <span className="text-body-secondary"> (sin contraseña cargada — editá la cuenta para agregarla)</span>}
                </div>
              )}

              {creandoCuenta && (
                <div className="border rounded p-3 mb-3">
                  <div className="mb-3">
                    <label className="form-label">Nombre / login de la cuenta nueva</label>
                    <input
                      className="form-control"
                      placeholder="Ej: dvega"
                      value={modalRapido.cuentaNombre}
                      onChange={(e) => setModalRapido((m) => ({ ...m, cuentaNombre: e.target.value }))}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Usuario del sistema vinculado (opcional)</label>
                    <select
                      className="form-select"
                      value={modalRapido.cuentaUsuarioId}
                      onChange={(e) => setModalRapido((m) => ({ ...m, cuentaUsuarioId: e.target.value }))}
                    >
                      <option value="">Sin vincular</option>
                      {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.email_institucional})</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">Contraseña de HikCentral (opcional)</label>
                    <input
                      className="form-control"
                      placeholder="Contraseña de este login en HikCentral"
                      value={modalRapido.cuentaContrasena}
                      onChange={(e) => setModalRapido((m) => ({ ...m, cuentaContrasena: e.target.value }))}
                      autoComplete="off"
                    />
                  </div>
                </div>
              )}

              <div className="mb-3">
                <label className="form-label">Grupo (opcional)</label>
                <input
                  className="form-control"
                  placeholder="Ej: Grupo 1 - UTI/UCO"
                  value={modalRapido.grupo}
                  onChange={(e) => setModalRapido((m) => ({ ...m, grupo: e.target.value }))}
                />
              </div>
              <div className="d-flex gap-4">
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="chk-rapido-en-vivo"
                    checked={modalRapido.en_vivo}
                    onChange={(e) => setModalRapido((m) => ({ ...m, en_vivo: e.target.checked }))}
                  />
                  <label className="form-check-label" htmlFor="chk-rapido-en-vivo">En vivo</label>
                </div>
                <div className="form-check">
                  <input
                    className="form-check-input"
                    type="checkbox"
                    id="chk-rapido-reproduccion"
                    checked={modalRapido.reproduccion}
                    onChange={(e) => setModalRapido((m) => ({ ...m, reproduccion: e.target.checked }))}
                  />
                  <label className="form-check-label" htmlFor="chk-rapido-reproduccion">Reproducción</label>
                </div>
              </div>
              {error && <div className="alert alert-danger small py-2 mt-3 mb-0">{error}</div>}
            </div>
            <div className="modal-footer">
              <button type="button" className="btn btn-outline-secondary" onClick={() => setModalRapido(null)}>Cancelar</button>
              <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar acceso'}</button>
            </div>
          </form>
        </div>
      </div>
      <div className="modal-backdrop show" />
    </>
  );
}

export default function AccesosNvr() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'admin';
  // "avanzado" edita/agrega igual que admin, pero nunca puede eliminar
  // cuentas ni accesos NVR (los únicos DELETE reales acá) — esos botones
  // siguen gateados con esAdmin puntualmente.
  const puedeEditar = esAdmin || user?.rol === 'avanzado';

  const [cuentas, setCuentas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [camaras, setCamaras] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [cuentaId, setCuentaId] = useState(null);
  const [detalle, setDetalle] = useState(null);
  const [cargandoDetalle, setCargandoDetalle] = useState(false);
  const [vista, setVista] = useState('cuadricula');
  const [camaraDetalle, setCamaraDetalle] = useState(null);

  const [modalCuenta, setModalCuenta] = useState(null);
  const [modalAcceso, setModalAcceso] = useState(null);
  const [modalRapido, setModalRapido] = useState(null);
  const [busquedaCamaraModal, setBusquedaCamaraModal] = useState('');
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const location = useLocation();
  const navigate = useNavigate();

  // Llegada desde Pendientes HikCentral (botón "Agregar en Accesos NVR"): las
  // cámaras tildadas viajan en el state de la navegación, no por query
  // string, para no dejarlas pegadas en la URL. Se limpia el state al toque
  // (navigate replace) para que un F5 no vuelva a abrir el modal solo.
  useEffect(() => {
    if (location.state?.camarasParaAcceso?.length) {
      setModalRapido({
        camaras: location.state.camarasParaAcceso, cuenta_id: '', grupo: '', en_vivo: true, reproduccion: true,
        cuentaNombre: '', cuentaUsuarioId: '', cuentaContrasena: '',
      });
      navigate(location.pathname, { replace: true, state: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.state]);

  const cargarCuentas = () => client.get('/cuentas-nvr').then((res) => setCuentas(res.data));
  const cargarDetalle = () => {
    if (!cuentaId) return Promise.resolve();
    return client.get(`/cuentas-nvr/${cuentaId}`).then((res) => setDetalle(res.data));
  };

  useEffect(() => {
    cargarCuentas();
    if (puedeEditar) {
      client.get('/usuarios').then((res) => setUsuarios(res.data));
      client.get('/camaras').then((res) => setCamaras(res.data));
    }
  }, [puedeEditar]);

  useEffect(() => {
    setCamaraDetalle(null);
    if (!cuentaId) { setDetalle(null); return; }
    setCargandoDetalle(true);
    cargarDetalle().finally(() => setCargandoDetalle(false));
  }, [cuentaId]);

  const cuentasFiltradas = cuentas.filter((c) => !busqueda.trim() || c.nombre.toLowerCase().includes(busqueda.trim().toLowerCase()));

  const indiceCamaraDetalle = camaraDetalle && detalle ? detalle.camaras.findIndex((c) => c.acceso_id === camaraDetalle.acceso_id) : -1;
  const moverCamaraDetalle = (delta) => {
    const nuevo = detalle.camaras[indiceCamaraDetalle + delta];
    if (nuevo) setCamaraDetalle(nuevo);
  };

  // --- Cuentas: alta / edición / baja ---
  const abrirNuevaCuenta = () => { setError(''); setModalCuenta({ id: null, nombre: '', usuario_id: '', contrasena: '' }); };
  const abrirEditarCuenta = (c) => { setError(''); setModalCuenta({ id: c.id, nombre: c.nombre, usuario_id: c.usuario_id || '', contrasena: c.contrasena || '' }); };

  const guardarCuenta = async (e) => {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      const datos = { nombre: modalCuenta.nombre.trim(), usuario_id: modalCuenta.usuario_id || null, contrasena: modalCuenta.contrasena.trim() || null };
      if (modalCuenta.id) await client.put(`/cuentas-nvr/${modalCuenta.id}`, datos);
      else await client.post('/cuentas-nvr', datos);
      setModalCuenta(null);
      await cargarCuentas();
      await cargarDetalle();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar la cuenta');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarCuenta = async (c) => {
    if (!window.confirm(`¿Eliminar la cuenta "${c.nombre}" y sus ${c.cantidad_camaras} acceso(s)?`)) return;
    await client.delete(`/cuentas-nvr/${c.id}`);
    await cargarCuentas();
    if (cuentaId === c.id) setCuentaId(null);
  };

  // --- Accesos a cámaras: alta / edición / baja ---
  const idsConAcceso = new Set((detalle?.camaras || []).map((c) => c.camara_id));
  const camarasParaElegir = camaras.filter((c) => c.id === modalAcceso?.camara_id || !idsConAcceso.has(c.id));
  const camarasFiltradasModal = camarasParaElegir.filter((c) => {
    if (!busquedaCamaraModal.trim()) return true;
    const q = busquedaCamaraModal.trim().toLowerCase();
    return [c.hostname, c.descripcion, c.edificio, c.area].some((v) => (v || '').toLowerCase().includes(q));
  });

  const abrirNuevoAcceso = () => { setError(''); setBusquedaCamaraModal(''); setModalAcceso({ accesoId: null, camara_id: '', grupo: '', en_vivo: true, reproduccion: true }); };
  const abrirEditarAcceso = (c) => {
    setError('');
    setBusquedaCamaraModal('');
    setModalAcceso({ accesoId: c.acceso_id, camara_id: c.camara_id, grupo: c.grupo || '', en_vivo: c.en_vivo, reproduccion: c.reproduccion, nombre: c.descripcion || c.hostname });
  };

  const guardarAcceso = async (e) => {
    e.preventDefault();
    if (!modalAcceso.camara_id) { setError('Elegí una cámara.'); return; }
    setError('');
    setGuardando(true);
    try {
      await client.post(`/cuentas-nvr/${cuentaId}/accesos`, {
        camara_id: modalAcceso.camara_id,
        grupo: modalAcceso.grupo.trim() || undefined,
        en_vivo: modalAcceso.en_vivo,
        reproduccion: modalAcceso.reproduccion,
      });
      setModalAcceso(null);
      await cargarDetalle();
      await cargarCuentas();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el acceso');
    } finally {
      setGuardando(false);
    }
  };

  // Alta rápida desde Pendientes HikCentral: la cámara ya viene elegida, acá
  // solo falta decidir a qué cuenta NVR se le da el acceso.
  const guardarAccesoRapido = async (e) => {
    e.preventDefault();
    if (!modalRapido.cuenta_id) { setError('Elegí una cuenta.'); return; }
    if (modalRapido.cuenta_id === NUEVA_CUENTA && !modalRapido.cuentaNombre.trim()) {
      setError('Poné un nombre para la cuenta nueva.');
      return;
    }
    setError('');
    setGuardando(true);
    try {
      let cuentaIdUsada = modalRapido.cuenta_id;
      if (cuentaIdUsada === NUEVA_CUENTA) {
        const { data: cuentaNueva } = await client.post('/cuentas-nvr', {
          nombre: modalRapido.cuentaNombre.trim(),
          usuario_id: modalRapido.cuentaUsuarioId || null,
          contrasena: modalRapido.cuentaContrasena.trim() || null,
        });
        cuentaIdUsada = cuentaNueva.id;
      }

      // Secuencial (no Promise.all) para no pisar la fila de accesos_nvr si
      // dos cámaras de la tanda generaran algún conflicto raro — son pocas
      // por tanda, la diferencia de tiempo no se nota.
      for (const cam of modalRapido.camaras) {
        await client.post(`/cuentas-nvr/${cuentaIdUsada}/accesos`, {
          camara_id: cam.id,
          grupo: modalRapido.grupo.trim() || undefined,
          en_vivo: modalRapido.en_vivo,
          reproduccion: modalRapido.reproduccion,
        });
      }
      setModalRapido(null);
      await cargarCuentas();
      // Entra directo al detalle de la cuenta usada — ahí ya se ve la
      // cámara recién agregada, sin tener que buscarla de nuevo.
      setCuentaId(cuentaIdUsada);
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar el acceso');
    } finally {
      setGuardando(false);
    }
  };

  const eliminarAcceso = async (c) => {
    if (!window.confirm(`¿Quitar el acceso a "${c.descripcion || c.hostname}"?`)) return;
    await client.delete(`/cuentas-nvr/${cuentaId}/accesos/${c.acceso_id}`);
    if (camaraDetalle?.acceso_id === c.acceso_id) setCamaraDetalle(null);
    await cargarDetalle();
    await cargarCuentas();
  };

  // El estado pendiente/concedido es el "borrador" del admin: pendiente hasta
  // que aplica el permiso a mano en el NVR/HikCentral real y vuelve acá a
  // tildarlo como concedido.
  const toggleEstadoAcceso = async (c) => {
    const nuevoEstado = c.acceso_estado === 'concedido' ? 'pendiente' : 'concedido';
    await client.patch(`/cuentas-nvr/${cuentaId}/accesos/${c.acceso_id}`, { estado: nuevoEstado });
    if (camaraDetalle?.acceso_id === c.acceso_id) setCamaraDetalle((d) => ({ ...d, acceso_estado: nuevoEstado }));
    await cargarDetalle();
  };

  if (cuentaId) {
    return (
      <Layout>
        <button className="btn btn-sm btn-outline-secondary mb-3" onClick={() => setCuentaId(null)}>← Volver a cuentas</button>

        {cargandoDetalle && <p className="text-body-secondary">Cargando...</p>}

        {detalle && (
          <>
            <div className="mb-4 d-flex justify-content-between align-items-end flex-wrap gap-3">
              <div>
                <div className="d-flex align-items-center gap-2">
                  <h1 className="h4 fw-bold mb-1">{detalle.nombre}</h1>
                  {puedeEditar && (
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => abrirEditarCuenta(detalle)}>Editar cuenta</button>
                  )}
                </div>
                <p className="text-body-secondary mb-0">
                  {detalle.camaras.length} cámara{detalle.camaras.length === 1 ? '' : 's'} con acceso
                  {detalle.usuario_nombre && <> · vinculada a {detalle.usuario_nombre} ({detalle.usuario_email})</>}
                </p>
              </div>
              <div className="d-flex gap-2">
                {puedeEditar && (
                  <button className="btn btn-primary btn-sm" onClick={abrirNuevoAcceso}>+ Agregar cámara</button>
                )}
                <div className="btn-group" role="group">
                  <button
                    type="button"
                    className={`btn btn-sm ${vista === 'tabla' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setVista('tabla')}
                  >
                    Tabla
                  </button>
                  <button
                    type="button"
                    className={`btn btn-sm ${vista === 'cuadricula' ? 'btn-primary' : 'btn-outline-primary'}`}
                    onClick={() => setVista('cuadricula')}
                  >
                    Cuadrícula
                  </button>
                </div>
              </div>
            </div>

            {vista === 'tabla' ? (
              <div className="card shadow-sm">
                <div className="table-responsive">
                  <table className="table table-hover align-middle mb-0">
                    <thead className="table-light">
                      <tr>
                        <th>Cámara</th><th>Edificio</th><th>Piso</th><th>Área</th><th>Grupo</th>
                        <th>En vivo</th><th>Reproducción</th><th>Estado</th>{puedeEditar && <th></th>}
                      </tr>
                    </thead>
                    <tbody>
                      {detalle.camaras.map((c) => (
                        <tr key={c.acceso_id}>
                          <td>{c.descripcion || c.hostname}</td>
                          <td>{c.edificio}</td>
                          <td>{c.piso}</td>
                          <td>{c.area}</td>
                          <td className="text-body-secondary small">{c.grupo || '—'}</td>
                          <td>
                            <span className={`badge ${c.en_vivo ? 'text-bg-success' : 'text-bg-secondary'}`}>{c.en_vivo ? 'Sí' : 'No'}</span>
                          </td>
                          <td>
                            <span className={`badge ${c.reproduccion ? 'text-bg-success' : 'text-bg-secondary'}`}>{c.reproduccion ? 'Sí' : 'No'}</span>
                          </td>
                          <td>
                            {puedeEditar ? (
                              <button
                                type="button"
                                className={`badge border-0 ${c.acceso_estado === 'concedido' ? 'text-bg-success' : 'text-bg-warning'}`}
                                onClick={() => toggleEstadoAcceso(c)}
                                title="Click para cambiar"
                              >
                                {c.acceso_estado === 'concedido' ? 'Concedido' : 'Pendiente'}
                              </button>
                            ) : (
                              <span className={`badge ${c.acceso_estado === 'concedido' ? 'text-bg-success' : 'text-bg-warning'}`}>
                                {c.acceso_estado === 'concedido' ? 'Concedido' : 'Pendiente'}
                              </span>
                            )}
                          </td>
                          {puedeEditar && (
                            <td className="text-end">
                              <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => abrirEditarAcceso(c)}>Editar</button>
                              {esAdmin && <button className="btn btn-sm btn-outline-danger" onClick={() => eliminarAcceso(c)}>Quitar</button>}
                            </td>
                          )}
                        </tr>
                      ))}
                      {detalle.camaras.length === 0 && (
                        <tr><td colSpan={puedeEditar ? 9 : 8} className="text-body-secondary">Esta cuenta todavía no tiene cámaras asignadas</td></tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : detalle.camaras.length === 0 ? (
              <div className="text-center text-body-secondary py-5">Esta cuenta todavía no tiene cámaras asignadas.</div>
            ) : (
              <div className="camera-grid">
                {detalle.camaras.map((c) => (
                  <div className="card camera-card shadow-sm" key={c.acceso_id}>
                    <div role="button" onClick={() => setCamaraDetalle(c)}>
                      <CamaraThumb camara={c} />
                    </div>
                    <div className="card-body">
                      <div className="fw-semibold mb-1">{c.hostname}</div>
                      {c.descripcion && <div className="small mb-1">{c.descripcion}</div>}
                      <div className="small text-body-secondary mb-1">{c.piso} · {c.edificio} · {c.area}</div>
                      {c.ip && <div className="small text-body-secondary mb-2">{c.ip}</div>}
                      <div className="d-flex gap-1 flex-wrap">
                        <span className={`badge ${c.en_vivo ? 'text-bg-success' : 'text-bg-secondary'}`}>En vivo{c.en_vivo ? '' : ' no'}</span>
                        <span className={`badge ${c.reproduccion ? 'text-bg-success' : 'text-bg-secondary'}`}>Reprod.{c.reproduccion ? '' : ' no'}</span>
                        <span className={`badge ${c.acceso_estado === 'concedido' ? 'text-bg-success' : 'text-bg-warning'}`}>
                          {c.acceso_estado === 'concedido' ? 'Concedido' : 'Pendiente'}
                        </span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {camaraDetalle && (
          <>
            <NavModal
              onAnterior={indiceCamaraDetalle > 0 ? () => moverCamaraDetalle(-1) : null}
              onSiguiente={indiceCamaraDetalle < detalle.camaras.length - 1 ? () => moverCamaraDetalle(1) : null}
            />
            <div
              className="modal d-block"
              tabIndex="-1"
              role="dialog"
              onClick={(e) => { if (e.target === e.currentTarget) setCamaraDetalle(null); }}
            >
              <div className="modal-dialog modal-dialog-centered" role="document">
                <div className="modal-content">
                  <div className="modal-header">
                    <h2 className="modal-title h5">{camaraDetalle.descripcion || camaraDetalle.hostname}</h2>
                    <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setCamaraDetalle(null)} />
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <CamaraThumb camara={camaraDetalle} grande />
                    </div>
                    <dl className="row mb-3">
                      <dt className="col-4 text-body-secondary fw-normal">Edificio</dt>
                      <dd className="col-8">{camaraDetalle.edificio}</dd>
                      <dt className="col-4 text-body-secondary fw-normal">Piso</dt>
                      <dd className="col-8">{camaraDetalle.piso}</dd>
                      <dt className="col-4 text-body-secondary fw-normal">Área</dt>
                      <dd className="col-8">{camaraDetalle.area}</dd>
                      {camaraDetalle.ip && (<><dt className="col-4 text-body-secondary fw-normal">IP</dt><dd className="col-8">{camaraDetalle.ip}</dd></>)}
                      {camaraDetalle.descripcion && (<><dt className="col-4 text-body-secondary fw-normal">Descripción</dt><dd className="col-8">{camaraDetalle.descripcion}</dd></>)}
                      {camaraDetalle.observaciones && (<><dt className="col-4 text-body-secondary fw-normal">Observaciones</dt><dd className="col-8">{camaraDetalle.observaciones}</dd></>)}
                      {camaraDetalle.grupo && (<><dt className="col-4 text-body-secondary fw-normal">Grupo</dt><dd className="col-8">{camaraDetalle.grupo}</dd></>)}
                    </dl>
                    <div className="d-flex gap-2 flex-wrap">
                      <span className={`badge ${camaraDetalle.en_vivo ? 'text-bg-success' : 'text-bg-secondary'}`}>En vivo: {camaraDetalle.en_vivo ? 'Sí' : 'No'}</span>
                      <span className={`badge ${camaraDetalle.reproduccion ? 'text-bg-success' : 'text-bg-secondary'}`}>Reproducción: {camaraDetalle.reproduccion ? 'Sí' : 'No'}</span>
                      <span className={`badge ${camaraDetalle.acceso_estado === 'concedido' ? 'text-bg-success' : 'text-bg-warning'}`}>
                        {camaraDetalle.acceso_estado === 'concedido' ? 'Concedido' : 'Pendiente'}
                      </span>
                    </div>
                  </div>
                  {puedeEditar && (
                    <div className="modal-footer">
                      {esAdmin && <button type="button" className="btn btn-outline-danger" onClick={() => eliminarAcceso(camaraDetalle)}>Quitar acceso</button>}
                      <button
                        type="button"
                        className={`btn ${camaraDetalle.acceso_estado === 'concedido' ? 'btn-outline-warning' : 'btn-outline-success'}`}
                        onClick={() => toggleEstadoAcceso(camaraDetalle)}
                      >
                        {camaraDetalle.acceso_estado === 'concedido' ? 'Marcar como pendiente' : 'Marcar como concedido'}
                      </button>
                      <button type="button" className="btn btn-primary" onClick={() => { const c = camaraDetalle; setCamaraDetalle(null); abrirEditarAcceso(c); }}>Editar</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
            <div className="modal-backdrop show" />
          </>
        )}

        {modalAcceso && (
          <>
            <div className="modal d-block" tabIndex="-1" role="dialog" onClick={(e) => { if (e.target === e.currentTarget) setModalAcceso(null); }}>
              <div className="modal-dialog modal-dialog-centered" role="document">
                <form className="modal-content" onSubmit={guardarAcceso}>
                  <div className="modal-header">
                    <h2 className="modal-title h5">{modalAcceso.accesoId ? `Editar acceso — ${modalAcceso.nombre}` : 'Agregar cámara'}</h2>
                    <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setModalAcceso(null)} />
                  </div>
                  <div className="modal-body">
                    {!modalAcceso.accesoId && (
                      <p className="text-body-secondary small">
                        Se crea como <span className="badge text-bg-warning">Pendiente</span> — es tu borrador hasta que apliques
                        el permiso en el NVR/HikCentral real y vuelvas a marcarlo como Concedido.
                      </p>
                    )}
                    {!modalAcceso.accesoId && (
                      <div className="mb-3">
                        <label className="form-label">Cámara</label>
                        <input
                          className="form-control mb-2"
                          placeholder="Buscar por hostname, descripción, edificio o área..."
                          value={busquedaCamaraModal}
                          onChange={(e) => setBusquedaCamaraModal(e.target.value)}
                        />
                        <select
                          className="form-select"
                          size={8}
                          value={modalAcceso.camara_id}
                          onChange={(e) => setModalAcceso((m) => ({ ...m, camara_id: Number(e.target.value) }))}
                          required
                        >
                          <option value="" disabled>Elegí una cámara...</option>
                          {camarasFiltradasModal.map((c) => (
                            <option key={c.id} value={c.id}>
                              {(c.descripcion || c.hostname)} — {c.edificio} · {c.piso} · {c.area}
                            </option>
                          ))}
                        </select>
                      </div>
                    )}
                    <div className="mb-3">
                      <label className="form-label">Grupo (opcional)</label>
                      <input
                        className="form-control"
                        placeholder="Ej: Grupo 1 - UTI/UCO"
                        value={modalAcceso.grupo}
                        onChange={(e) => setModalAcceso((m) => ({ ...m, grupo: e.target.value }))}
                      />
                    </div>
                    <div className="d-flex gap-4">
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="chk-en-vivo"
                          checked={modalAcceso.en_vivo}
                          onChange={(e) => setModalAcceso((m) => ({ ...m, en_vivo: e.target.checked }))}
                        />
                        <label className="form-check-label" htmlFor="chk-en-vivo">En vivo</label>
                      </div>
                      <div className="form-check">
                        <input
                          className="form-check-input"
                          type="checkbox"
                          id="chk-reproduccion"
                          checked={modalAcceso.reproduccion}
                          onChange={(e) => setModalAcceso((m) => ({ ...m, reproduccion: e.target.checked }))}
                        />
                        <label className="form-check-label" htmlFor="chk-reproduccion">Reproducción</label>
                      </div>
                    </div>
                    {error && <div className="alert alert-danger small py-2 mt-3 mb-0">{error}</div>}
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setModalAcceso(null)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                </form>
              </div>
            </div>
            <div className="modal-backdrop show" />
          </>
        )}

        {modalCuenta && (
          <>
            <div className="modal d-block" tabIndex="-1" role="dialog" onClick={(e) => { if (e.target === e.currentTarget) setModalCuenta(null); }}>
              <div className="modal-dialog modal-dialog-centered" role="document">
                <form className="modal-content" onSubmit={guardarCuenta}>
                  <div className="modal-header">
                    <h2 className="modal-title h5">{modalCuenta.id ? 'Editar cuenta' : 'Nueva cuenta NVR'}</h2>
                    <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setModalCuenta(null)} />
                  </div>
                  <div className="modal-body">
                    <div className="mb-3">
                      <label className="form-label">Nombre / login</label>
                      <input
                        className="form-control"
                        placeholder="Ej: vigilancia, enfermeriaqx..."
                        value={modalCuenta.nombre}
                        onChange={(e) => setModalCuenta((m) => ({ ...m, nombre: e.target.value }))}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Usuario del sistema vinculado (opcional)</label>
                      <select
                        className="form-select"
                        value={modalCuenta.usuario_id}
                        onChange={(e) => setModalCuenta((m) => ({ ...m, usuario_id: e.target.value }))}
                      >
                        <option value="">Sin vincular</option>
                        {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.email_institucional})</option>)}
                      </select>
                    </div>
                    <div className="mb-3">
                      <label className="form-label">Contraseña de HikCentral (opcional)</label>
                      <input
                        className="form-control"
                        placeholder="Contraseña de este login en HikCentral"
                        value={modalCuenta.contrasena}
                        onChange={(e) => setModalCuenta((m) => ({ ...m, contrasena: e.target.value }))}
                        autoComplete="off"
                      />
                      <div className="form-text">Sirve para tenerla a mano al aplicar accesos pendientes — no es la contraseña de este panel.</div>
                    </div>
                    {error && <div className="alert alert-danger small py-2 mb-0">{error}</div>}
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={() => setModalCuenta(null)}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                </form>
              </div>
            </div>
            <div className="modal-backdrop show" />
          </>
        )}

        {modalRapido && <ModalAccesoRapido modalRapido={modalRapido} setModalRapido={setModalRapido} cuentas={cuentas} usuarios={usuarios} error={error} guardando={guardando} onSubmit={guardarAccesoRapido} />}
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="mb-4 d-flex justify-content-between align-items-end flex-wrap gap-3">
        <div>
          <h1 className="h4 fw-bold mb-1">Accesos NVR</h1>
          <p className="text-body-secondary mb-0">
            Cuentas configuradas en el NVR/HikCentral y a qué cámaras accede cada una — reflejan lo que ya
            está armado en el equipo real. Elegí una cuenta para ver el detalle.
          </p>
        </div>
        {puedeEditar && <button className="btn btn-primary btn-sm" onClick={abrirNuevaCuenta}>+ Agregar cuenta</button>}
      </div>

      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <input
            className="form-control"
            placeholder="Buscar cuenta..."
            value={busqueda}
            onChange={(e) => setBusqueda(e.target.value)}
          />
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr><th>Cuenta</th><th>Usuario vinculado</th><th>Cámaras</th><th></th>{puedeEditar && <th></th>}</tr>
            </thead>
            <tbody>
              {cuentasFiltradas.map((c) => (
                <tr key={c.id} role="button" style={{ cursor: 'pointer' }} onClick={() => setCuentaId(c.id)}>
                  <td className="fw-semibold">{c.nombre}</td>
                  <td>{c.usuario_nombre || '—'}</td>
                  <td><span className="badge text-bg-secondary">{c.cantidad_camaras}</span></td>
                  <td className="text-end"><span className="text-body-secondary small">Ver detalle →</span></td>
                  {puedeEditar && (
                    <td className="text-end" onClick={(e) => e.stopPropagation()}>
                      <button className="btn btn-sm btn-outline-secondary me-1" onClick={() => abrirEditarCuenta(c)}>Editar</button>
                      {esAdmin && <button className="btn btn-sm btn-outline-danger" onClick={() => eliminarCuenta(c)}>Eliminar</button>}
                    </td>
                  )}
                </tr>
              ))}
              {cuentasFiltradas.length === 0 && (
                <tr><td colSpan={puedeEditar ? 5 : 4} className="text-body-secondary">
                  {cuentas.length === 0 ? 'Todavía no hay cuentas NVR cargadas' : 'Ninguna cuenta coincide con la búsqueda'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modalCuenta && (
        <>
          <div className="modal d-block" tabIndex="-1" role="dialog" onClick={(e) => { if (e.target === e.currentTarget) setModalCuenta(null); }}>
            <div className="modal-dialog modal-dialog-centered" role="document">
              <form className="modal-content" onSubmit={guardarCuenta}>
                <div className="modal-header">
                  <h2 className="modal-title h5">{modalCuenta.id ? 'Editar cuenta' : 'Nueva cuenta NVR'}</h2>
                  <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setModalCuenta(null)} />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <label className="form-label">Nombre / login</label>
                    <input
                      className="form-control"
                      placeholder="Ej: vigilancia, enfermeriaqx..."
                      value={modalCuenta.nombre}
                      onChange={(e) => setModalCuenta((m) => ({ ...m, nombre: e.target.value }))}
                      required
                      autoFocus
                    />
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Usuario del sistema vinculado (opcional)</label>
                    <select
                      className="form-select"
                      value={modalCuenta.usuario_id}
                      onChange={(e) => setModalCuenta((m) => ({ ...m, usuario_id: e.target.value }))}
                    >
                      <option value="">Sin vincular</option>
                      {usuarios.map((u) => <option key={u.id} value={u.id}>{u.nombre} ({u.email_institucional})</option>)}
                    </select>
                  </div>
                  <div className="mb-3">
                    <label className="form-label">Contraseña de HikCentral (opcional)</label>
                    <input
                      className="form-control"
                      placeholder="Contraseña de este login en HikCentral"
                      value={modalCuenta.contrasena}
                      onChange={(e) => setModalCuenta((m) => ({ ...m, contrasena: e.target.value }))}
                      autoComplete="off"
                    />
                    <div className="form-text">Sirve para tenerla a mano al aplicar accesos pendientes — no es la contraseña de este panel.</div>
                  </div>
                  {error && <div className="alert alert-danger small py-2 mb-0">{error}</div>}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setModalCuenta(null)}>Cancelar</button>
                  <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
                </div>
              </form>
            </div>
          </div>
          <div className="modal-backdrop show" />
        </>
      )}

      {modalRapido && <ModalAccesoRapido modalRapido={modalRapido} setModalRapido={setModalRapido} cuentas={cuentas} usuarios={usuarios} error={error} guardando={guardando} onSubmit={guardarAccesoRapido} />}
    </Layout>
  );
}
