import { useEffect, useMemo, useRef, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';
import { quitarAcentos } from '../utils/texto';

// Panel NVR: a diferencia de Recursos > NVR (inventario cargado a mano), esto
// consulta el equipo en vivo por ISAPI (ver backend/src/utils/isapiClient.js)
// -- info de dispositivo, discos, y retencion de grabacion por canal. Todo de
// solo lectura y disparado a mano ("Actualizar" / "Actualizar todo"), nunca
// automatico, para no bombardear NVRs embebidos que aceptan pocas sesiones
// HTTP simultaneas (el detalle de canales hace un pedido ISAPI por canal).
const RETENCION_ALERTA_DIAS = 30; // umbral visual (rojo/amarillo/verde), no es un compromiso contractual
const GB_POR_TB = 1000; // convencion decimal de los fabricantes de disco (para la calculadora manual)

function num(n, decimales = 0) {
  if (n == null || Number.isNaN(n)) return '—';
  return n.toLocaleString('es-AR', { minimumFractionDigits: decimales, maximumFractionDigits: decimales });
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

// Nombres/descripciones de camara vienen del propio NVR o de HikCentral (los
// carga el instalador o se ven en su pantalla) -- pueden traer tildes/n, que
// sacamos para no mezclar convenciones dentro de la app.
function limpio(texto) {
  const t = quitarAcentos(texto || '').trim();
  return t || null;
}

function calcularStorage(estado) {
  const discos = estado?.discos || [];
  if (!discos.length) return null;
  const capacidadMb = discos.reduce((a, d) => a + (d.capacidadMb || 0), 0);
  const libreMb = discos.reduce((a, d) => a + (d.libreMb || 0), 0);
  if (!capacidadMb) return null;
  return {
    totalGb: capacidadMb / 1024,
    libreGb: libreMb / 1024,
    usadoGb: (capacidadMb - libreMb) / 1024,
    pctUsado: ((capacidadMb - libreMb) / capacidadMb) * 100,
  };
}

// Promedio de GB/dia estimado (bitrate maximo configurado por canal, real
// del equipo -- ver gbDiaDesdeBitrate en backend/src/routes/nvrs.js) entre
// los canales con camara conectada que informaron ese dato.
function promedioGbDia(canales) {
  const valores = (canales || []).filter((c) => c.online && c.gbDiaEstimado != null).map((c) => c.gbDiaEstimado);
  if (!valores.length) return null;
  return valores.reduce((a, b) => a + b, 0) / valores.length;
}

// Retencion actual = el canal que se queda sin historial antes (el "cuello
// de botella"), no un promedio -- es lo que de verdad importa operativamente.
function retencionActualDias(canales) {
  const valores = (canales || []).filter((c) => c.online && c.diasDisponibles != null).map((c) => c.diasDisponibles);
  if (!valores.length) return null;
  return Math.min(...valores);
}

function retencionProyectada(estado, canales, canalesTotales) {
  const st = calcularStorage(estado);
  const gbDia = promedioGbDia(canales);
  if (!st || gbDia == null || !canalesTotales) return null;
  return st.totalGb / (gbDia * canalesTotales);
}

function claseRetencion(dias) {
  if (dias == null) return 'text-body-secondary';
  if (dias < RETENCION_ALERTA_DIAS) return 'text-danger';
  if (dias < RETENCION_ALERTA_DIAS * 1.5) return 'text-warning';
  return 'text-success';
}

function KpiTile({ label, value, sub, warn }) {
  return (
    <div className="col">
      <div className="card shadow-sm h-100">
        <div className="card-body py-3">
          <div className="small text-body-secondary">{label}</div>
          <div className={`h5 mb-0 font-monospace fw-bold ${warn ? 'text-danger' : ''}`}>{value}</div>
          {sub && <div className="small text-body-secondary mt-1">{sub}</div>}
        </div>
      </div>
    </div>
  );
}

function Metric({ label, value, className = '' }) {
  return (
    <div className="col">
      <div className="bg-body-tertiary border rounded p-2 h-100">
        <div className="small text-body-secondary">{label}</div>
        <div className={`font-monospace fw-semibold ${className}`}>{value}</div>
      </div>
    </div>
  );
}

function CalculadoraRetencion({ nvrs, detallePorNvr }) {
  const [nvrId, setNvrId] = useState('');
  const [discos, setDiscos] = useState(2);
  const [gbPorDisco, setGbPorDisco] = useState(9314);
  const [canales, setCanales] = useState(32);
  const [consumo, setConsumo] = useState(8.6);
  const [presetActivo, setPresetActivo] = useState('1080p');

  const presetsEstaticos = [
    { id: '720p', label: '720p / 2 Mbps', v: 4.3 },
    { id: '1080p', label: '1080p / 4 Mbps', v: 8.6 },
    { id: '4mp', label: '4MP / 8 Mbps', v: 17.2 },
  ];

  const nvrPreload = nvrs.find((n) => String(n.id) === nvrId);
  const detallePreload = nvrPreload ? detallePorNvr[nvrPreload.id] : null;
  const gbDiaRealPreload = detallePreload?.canales ? promedioGbDia(detallePreload.canales) : null;

  const aplicarNvr = (id) => {
    setNvrId(id);
    const nvr = nvrs.find((n) => String(n.id) === id);
    if (!nvr) return;
    if (nvr.canales_totales) setCanales(nvr.canales_totales);
    const st = calcularStorage(detallePorNvr[nvr.id]?.estado);
    if (st) {
      const cantidadDiscos = detallePorNvr[nvr.id].estado.discos.length || 1;
      setDiscos(cantidadDiscos);
      setGbPorDisco(Math.round(st.totalGb / cantidadDiscos));
    }
  };

  const totalGb = (Number(discos) || 0) * (Number(gbPorDisco) || 0);
  const gbDia = (Number(canales) || 0) * (Number(consumo) || 0);
  const dias = gbDia > 0 ? totalGb / gbDia : null;

  return (
    <div className="card shadow-sm">
      <div className="card-header fw-semibold">Calculadora de retencion</div>
      <div className="card-body">
        <p className="text-body-secondary small">
          Dias de grabacion disponibles segun almacenamiento y canales ocupados, grabando 24h los 7 dias. Es una
          herramienta manual para planificar -- eligi un NVR para precargar sus valores reales (si ya lo actualizaste),
          o cargalos a mano.
        </p>
        <div className="row g-4">
          <div className="col-12 col-lg-6">
            <div className="mb-3">
              <label className="form-label small text-body-secondary">Precargar desde un NVR</label>
              <select className="form-select form-select-sm" value={nvrId} onChange={(e) => aplicarNvr(e.target.value)}>
                <option value="">-- cargar manualmente --</option>
                {nvrs.map((n) => (
                  <option key={n.id} value={n.id}>
                    {n.hostname} -- {n.canales_totales ?? '?'} canales
                  </option>
                ))}
              </select>
            </div>
            <div className="row g-2 mb-3">
              <div className="col-6">
                <label className="form-label small text-body-secondary">Discos</label>
                <input type="number" min="1" className="form-control form-control-sm font-monospace" value={discos} onChange={(e) => setDiscos(e.target.value)} />
              </div>
              <div className="col-6">
                <label className="form-label small text-body-secondary">Capacidad por disco (GB)</label>
                <input type="number" min="1" className="form-control form-control-sm font-monospace" value={gbPorDisco} onChange={(e) => setGbPorDisco(e.target.value)} />
              </div>
            </div>
            <div className="mb-3">
              <label className="form-label small text-body-secondary">Canales ocupados</label>
              <input type="number" min="1" className="form-control form-control-sm font-monospace" value={canales} onChange={(e) => setCanales(e.target.value)} />
            </div>
            <div>
              <label className="form-label small text-body-secondary">Consumo por canal (GB/dia)</label>
              <input type="number" min="0.1" step="0.1" className="form-control form-control-sm font-monospace mb-2" value={consumo} onChange={(e) => { setConsumo(e.target.value); setPresetActivo(''); }} />
              <div className="d-flex flex-wrap gap-1">
                {presetsEstaticos.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`btn btn-sm ${presetActivo === p.id ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => { setConsumo(p.v); setPresetActivo(p.id); }}
                  >
                    {p.label} · {num(p.v, 1)}
                  </button>
                ))}
                {gbDiaRealPreload != null && (
                  <button
                    type="button"
                    className={`btn btn-sm ${presetActivo === 'real' ? 'btn-primary' : 'btn-outline-secondary'}`}
                    onClick={() => { setConsumo(Number(gbDiaRealPreload.toFixed(1))); setPresetActivo('real'); }}
                  >
                    Promedio real {nvrPreload.hostname} · {num(gbDiaRealPreload, 1)}
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="col-12 col-lg-6 border-start-lg ps-lg-4 text-center d-flex flex-column justify-content-center">
            <div className="display-5 font-monospace fw-bold text-primary">{dias != null ? num(dias) : '—'}</div>
            <div className="text-body-secondary small mb-3">dias de grabacion</div>
            <div className="d-flex justify-content-center gap-4 small">
              <div>
                <div className="font-monospace fw-semibold">{num(totalGb / GB_POR_TB, 1)} TB</div>
                <div className="text-body-secondary">almacenamiento total</div>
              </div>
              <div>
                <div className="font-monospace fw-semibold">{num(gbDia)} GB</div>
                <div className="text-body-secondary">consumo GB/dia</div>
              </div>
              <div>
                <div className="font-monospace fw-semibold">{dias != null ? num(dias / 7, 1) : '—'}</div>
                <div className="text-body-secondary">semanas aprox.</div>
              </div>
            </div>
            <div className="small text-body-secondary font-monospace mt-3">
              dias = almacenamiento (GB) / (canales x consumo por canal)
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Nvr() {
  const [nvrs, setNvrs] = useState([]);
  const [detallePorNvr, setDetallePorNvr] = useState({});
  const [cargandoTodo, setCargandoTodo] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [erroresActualizacion, setErroresActualizacion] = useState([]);
  const [ultimaActualizacion, setUltimaActualizacion] = useState(null);
  const [abiertas, setAbiertas] = useState({});
  const [cargandoUno, setCargandoUno] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const busquedaRef = useRef(null);

  useEffect(() => { client.get('/nvrs').then((res) => setNvrs(res.data)); }, []);

  useEffect(() => {
    const alClickear = (e) => {
      if (busquedaRef.current && !busquedaRef.current.contains(e.target)) setBusquedaAbierta(false);
    };
    document.addEventListener('click', alClickear);
    return () => document.removeEventListener('click', alClickear);
  }, []);

  const consultarUno = async (nvr) => {
    try {
      const estadoRes = await client.get(`/nvrs/${nvr.id}/estado`);
      const canalesRes = nvr.canales_totales ? await client.get(`/nvrs/${nvr.id}/canales`) : { data: [] };
      return { estado: estadoRes.data, canales: canalesRes.data, error: null, actualizadoEn: new Date().toISOString() };
    } catch (err) {
      return { estado: null, canales: null, error: err.response?.data?.error || err.message || 'Error desconocido', actualizadoEn: null };
    }
  };

  const actualizarUno = async (nvr) => {
    setCargandoUno((prev) => ({ ...prev, [nvr.id]: true }));
    const detalle = await consultarUno(nvr);
    setDetallePorNvr((prev) => ({ ...prev, [nvr.id]: detalle }));
    setCargandoUno((prev) => ({ ...prev, [nvr.id]: false }));
  };

  // Secuencial, NVR por NVR -- son equipos embebidos que rechazan conexiones
  // si se los consulta todos a la vez (mismo criterio que el backend aplica
  // canal por canal dentro de /:id/canales).
  const actualizarTodo = async () => {
    setCargandoTodo(true);
    setErroresActualizacion([]);
    const errores = [];
    for (let i = 0; i < nvrs.length; i += 1) {
      const nvr = nvrs[i];
      setProgreso({ actual: i + 1, total: nvrs.length, hostname: nvr.hostname });
      const detalle = await consultarUno(nvr);
      if (detalle.error) errores.push(`${nvr.hostname}: ${detalle.error}`);
      setDetallePorNvr((prev) => ({ ...prev, [nvr.id]: detalle }));
    }
    setErroresActualizacion(errores);
    setUltimaActualizacion(new Date().toISOString());
    setProgreso(null);
    setCargandoTodo(false);
  };

  const toggleCard = (id) => setAbiertas((prev) => ({ ...prev, [id]: !prev[id] }));

  const resumen = useMemo(() => {
    let canalesInstalados = 0;
    let canalesUsados = 0;
    let storageTotalGb = 0;
    let consumoTotalGbDia = 0;
    let nvrConDatos = 0;
    const retenciones = [];
    for (const nvr of nvrs) {
      canalesInstalados += nvr.canales_totales || 0;
      const detalle = detallePorNvr[nvr.id];
      if (!detalle?.estado || !detalle?.canales) continue;
      nvrConDatos += 1;
      const st = calcularStorage(detalle.estado);
      if (st) storageTotalGb += st.totalGb;
      const usados = detalle.canales.filter((c) => c.online === true).length;
      canalesUsados += usados;
      const gbDiaProm = promedioGbDia(detalle.canales);
      if (gbDiaProm != null) consumoTotalGbDia += gbDiaProm * usados;
      const retActual = retencionActualDias(detalle.canales);
      if (retActual != null) retenciones.push({ nvr: nvr.hostname, dias: retActual });
    }
    const minRet = retenciones.length ? retenciones.reduce((a, b) => (a.dias < b.dias ? a : b)) : null;
    return { canalesInstalados, canalesUsados, storageTotalGb, consumoTotalGbDia, nvrConDatos, minRet };
  }, [nvrs, detallePorNvr]);

  const camarasIndex = useMemo(() => {
    const lista = [];
    for (const nvr of nvrs) {
      const canales = detallePorNvr[nvr.id]?.canales;
      if (!canales) continue;
      for (const c of canales) {
        if (!c.online) continue;
        lista.push({
          nvrId: nvr.id,
          nvr: nvr.hostname,
          canal: c.canal,
          nombre: limpio(c.descripcion) || limpio(c.camara?.descripcion) || limpio(c.camara?.hostname) || `Canal ${c.canal}`,
          ip: c.ip || '—',
        });
      }
    }
    return lista;
  }, [nvrs, detallePorNvr]);

  const resultadosBusqueda = useMemo(() => {
    const q = busqueda.trim().toLowerCase();
    if (!q) return [];
    return camarasIndex.filter((c) => c.nombre.toLowerCase().includes(q) || c.ip.includes(q)).slice(0, 30);
  }, [camarasIndex, busqueda]);

  const irACamara = (r) => {
    setBusquedaAbierta(false);
    setAbiertas((prev) => ({ ...prev, [r.nvrId]: true }));
    requestAnimationFrame(() => {
      document.getElementById(`nvr-card-${r.nvrId}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  };

  return (
    <Layout>
      <div className="d-flex justify-content-between align-items-start flex-wrap gap-3 mb-1">
        <div>
          <h1 className="h4 fw-bold mb-1">Panel NVR</h1>
          <p className="text-body-secondary small mb-0" style={{ maxWidth: '60ch' }}>
            Estado en vivo de cada NVR (ISAPI): discos, canales ocupados, retencion estimada y camaras. No se consulta
            nada solo -- se dispara a mano para no bombardear equipos embebidos.
          </p>
        </div>
        <div className="d-flex flex-column align-items-end gap-1">
          <div className="d-flex align-items-center gap-2">
            <div className="position-relative" ref={busquedaRef} style={{ minWidth: 280 }}>
              <input
                type="text"
                className="form-control form-control-sm"
                placeholder="Buscar camara por nombre o IP..."
                value={busqueda}
                onChange={(e) => { setBusqueda(e.target.value); setBusquedaAbierta(true); }}
                onFocus={() => setBusquedaAbierta(true)}
              />
              {busquedaAbierta && busqueda.trim() && (
                <div className="list-group position-absolute w-100 shadow-sm" style={{ zIndex: 20, maxHeight: 320, overflowY: 'auto' }}>
                  {resultadosBusqueda.length === 0 && (
                    <div className="list-group-item small text-body-secondary">
                      {camarasIndex.length === 0 ? 'Actualiza los NVR para poder buscar' : `Sin resultados para "${busqueda}"`}
                    </div>
                  )}
                  {resultadosBusqueda.map((r) => (
                    <button
                      key={`${r.nvrId}-${r.canal}`}
                      type="button"
                      className="list-group-item list-group-item-action d-flex justify-content-between align-items-center small"
                      onClick={() => irACamara(r)}
                    >
                      <span>
                        <span className="fw-semibold">{r.nombre}</span>{' '}
                        <span className="text-body-secondary font-monospace">{r.ip}</span>
                      </span>
                      <span className="badge text-bg-secondary">{r.nvr} · canal {r.canal}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            <button type="button" className="btn btn-sm btn-primary text-nowrap" disabled={cargandoTodo || nvrs.length === 0} onClick={actualizarTodo}>
              {cargandoTodo ? `Actualizando ${progreso ? `${progreso.actual}/${progreso.total}` : '...'}` : 'Actualizar todo'}
            </button>
          </div>
          {ultimaActualizacion && !cargandoTodo && (
            <span className="small text-body-secondary">Ultima actualizacion: {formatearFecha(ultimaActualizacion)}</span>
          )}
          {cargandoTodo && progreso && (
            <span className="small text-body-secondary">Consultando {progreso.hostname}...</span>
          )}
        </div>
      </div>

      {erroresActualizacion.length > 0 && (
        <div className="alert alert-warning py-2 small mt-3 mb-0">
          No se pudieron consultar {erroresActualizacion.length} NVR:
          <ul className="mb-0">
            {erroresActualizacion.map((e, i) => <li key={i}>{e}</li>)}
          </ul>
        </div>
      )}

      <div className="row row-cols-2 row-cols-md-5 g-3 mt-1 mb-4">
        <KpiTile label="NVR" value={nvrs.length} sub={`${resumen.canalesInstalados} canales instalados`} />
        <KpiTile
          label="Camaras en uso"
          value={resumen.nvrConDatos ? resumen.canalesUsados : '—'}
          sub={resumen.nvrConDatos === 0 ? 'Actualiza para ver' : `${resumen.nvrConDatos}/${nvrs.length} NVR actualizados`}
        />
        <KpiTile
          label="Almacenamiento total"
          value={resumen.storageTotalGb ? `${num(resumen.storageTotalGb / GB_POR_TB, 1)} TB` : '—'}
          sub={resumen.storageTotalGb ? `${num(resumen.storageTotalGb)} GB` : 'Actualiza para ver'}
        />
        <KpiTile
          label="Consumo diario estimado"
          value={resumen.consumoTotalGbDia ? `${num(resumen.consumoTotalGbDia)} GB` : '—'}
          sub="suma de NVR actualizados"
        />
        <KpiTile
          label="Retencion minima"
          value={resumen.minRet ? `${num(resumen.minRet.dias)} d` : '—'}
          sub={resumen.minRet ? resumen.minRet.nvr : 'Actualiza para ver'}
          warn={resumen.minRet != null && resumen.minRet.dias < RETENCION_ALERTA_DIAS}
        />
      </div>

      <div className="row g-3 mb-4">
        {nvrs.length === 0 && <div className="col-12 text-body-secondary">Sin NVR cargados en Recursos.</div>}
        {nvrs.map((nvr) => {
          const detalle = detallePorNvr[nvr.id];
          const abierta = !!abiertas[nvr.id];
          const usadosEnVivo = detalle?.canales ? detalle.canales.filter((c) => c.online).length : null;
          const ocupacion = usadosEnVivo != null ? usadosEnVivo : nvr.cantidad_camaras;
          const pctOcupacion = nvr.canales_totales ? Math.min(100, Math.round((ocupacion / nvr.canales_totales) * 100)) : 0;
          const st = calcularStorage(detalle?.estado);

          return (
            <div className="col-12 col-xl-6" key={nvr.id}>
              <div className="card shadow-sm h-100" id={`nvr-card-${nvr.id}`}>
                <div className="card-header d-flex justify-content-between align-items-start gap-3" role="button" onClick={() => toggleCard(nvr.id)}>
                  <div className="flex-grow-1">
                    <div className="fw-semibold">{nvr.hostname}</div>
                    <div className="small text-body-secondary font-monospace">{nvr.ip || 'sin IP'}</div>
                    <div className="d-flex flex-wrap gap-1 mt-2">
                      {nvr.marca && <span className="badge text-bg-secondary">{nvr.marca}</span>}
                      {nvr.modelo && <span className="badge text-bg-secondary">{nvr.modelo}</span>}
                      {(nvr.edificio || nvr.piso) && (
                        <span className="badge text-bg-secondary">{[nvr.edificio, nvr.piso].filter(Boolean).join(' · ')}</span>
                      )}
                    </div>
                  </div>
                  <div className="text-end flex-shrink-0">
                    <div className="fw-semibold font-monospace">
                      {ocupacion}<span className="text-body-secondary">/{nvr.canales_totales ?? '?'}</span>
                    </div>
                    <div className="small text-body-secondary">{usadosEnVivo != null ? 'canales (en vivo)' : 'camaras (inventario)'}</div>
                    <div className="progress mt-1" style={{ height: 5, width: 110 }}>
                      <div className="progress-bar" style={{ width: `${pctOcupacion}%` }} />
                    </div>
                  </div>
                </div>

                {abierta && (
                  <div className="card-body">
                    <div className="d-flex justify-content-between align-items-center mb-3">
                      <span className="small text-body-secondary">
                        {detalle?.actualizadoEn ? `Actualizado ${formatearFecha(detalle.actualizadoEn)}` : 'Sin consultar en esta sesion'}
                      </span>
                      <button
                        type="button"
                        className="btn btn-sm btn-outline-secondary"
                        disabled={cargandoUno[nvr.id]}
                        onClick={(e) => { e.stopPropagation(); actualizarUno(nvr); }}
                      >
                        {cargandoUno[nvr.id] ? 'Consultando...' : 'Actualizar'}
                      </button>
                    </div>

                    {detalle?.error && <div className="alert alert-danger py-2 small">{detalle.error}</div>}

                    {!detalle && !cargandoUno[nvr.id] && (
                      <div className="text-body-secondary small">Sin datos todavia -- toca Actualizar o Actualizar todo.</div>
                    )}

                    {st && (
                      <div className="mb-3">
                        <div className="d-flex justify-content-between small mb-1">
                          <span>Almacenamiento -- {num(st.totalGb / GB_POR_TB, 1)} TB</span>
                          <span className="text-body-secondary">{num(st.pctUsado)}% ocupado</span>
                        </div>
                        <div className="progress" style={{ height: 8 }}>
                          <div className={`progress-bar ${st.pctUsado > 90 ? 'bg-danger' : 'bg-warning'}`} style={{ width: `${st.pctUsado}%` }} />
                        </div>
                        <div className="small text-body-secondary mt-1">
                          {num(st.usadoGb / GB_POR_TB, 1)} TB ocupados de {num(st.totalGb / GB_POR_TB, 1)} TB ({num(st.libreGb / GB_POR_TB, 1)} TB libres)
                        </div>
                      </div>
                    )}
                    {detalle?.estado && !st && (
                      <div className="text-body-secondary small mb-3">Sin discos informados por el NVR.</div>
                    )}

                    {detalle?.canales && (() => {
                      const usados = detalle.canales.filter((c) => c.online).length;
                      const gbDiaProm = promedioGbDia(detalle.canales);
                      const consumoNvr = gbDiaProm != null ? gbDiaProm * usados : null;
                      const retActual = retencionActualDias(detalle.canales);
                      const retFull = retencionProyectada(detalle.estado, detalle.canales, nvr.canales_totales);
                      return (
                        <div className="row row-cols-2 row-cols-md-4 g-2 mb-3">
                          <Metric label="Consumo diario estimado" value={consumoNvr != null ? `${num(consumoNvr, 1)} GB/d` : '—'} />
                          <Metric label="Promedio por canal" value={gbDiaProm != null ? `${num(gbDiaProm, 1)} GB/d` : '—'} />
                          <Metric label={`Retencion actual (${usados} can.)`} value={retActual != null ? `${num(retActual)} dias` : '—'} className={claseRetencion(retActual)} />
                          <Metric
                            label={`Retencion con ${nvr.canales_totales ?? '?'} can. llenos`}
                            value={retFull != null ? `${num(retFull)} dias` : '—'}
                            className={claseRetencion(retFull)}
                          />
                        </div>
                      );
                    })()}

                    {detalle?.canales && (
                      <>
                        <div className="table-responsive" style={{ maxHeight: 280, overflowY: 'auto' }}>
                          <table className="table table-sm align-middle mb-0">
                            <thead className="table-light sticky-top">
                              <tr>
                                <th>Canal</th>
                                <th>Camara</th>
                                <th>IP</th>
                                <th>Estado</th>
                                <th>GB/dia</th>
                                <th>Dias disp.</th>
                              </tr>
                            </thead>
                            <tbody>
                              {detalle.canales.map((c) => (
                                <tr key={c.canal}>
                                  <td className="font-monospace text-body-secondary">{String(c.canal).padStart(2, '0')}</td>
                                  <td>
                                    {limpio(c.descripcion) || limpio(c.camara?.descripcion) || limpio(c.camara?.hostname)
                                      || <span className="text-body-secondary">sin asignar</span>}
                                  </td>
                                  <td className="font-monospace small text-body-secondary">{c.ip || '—'}</td>
                                  <td>
                                    {c.online === null ? '—' : (
                                      <span className={`badge ${c.online ? 'text-bg-success' : 'text-bg-secondary'}`}>{c.online ? 'Online' : 'Offline'}</span>
                                    )}
                                  </td>
                                  <td className="font-monospace small">{c.gbDiaEstimado != null ? num(c.gbDiaEstimado, 1) : '—'}</td>
                                  <td title={c.grabacionMasAntigua ? `Grabacion mas antigua: ${formatearFecha(c.grabacionMasAntigua)}` : (c.error || '')}>
                                    {c.error ? <span className="text-danger small">error</span> : (c.diasDisponibles ?? '—')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="small text-body-secondary mt-2">
                          GB/dia estimado a partir del bitrate maximo configurado de cada canal (ISAPI) -- no es trafico medido byte a byte.
                          Dias disponibles = grabacion mas antigua encontrada en el canal vs. hoy.
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <CalculadoraRetencion nvrs={nvrs} detallePorNvr={detallePorNvr} />
    </Layout>
  );
}
