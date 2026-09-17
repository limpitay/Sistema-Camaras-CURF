import { useEffect, useMemo, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import { quitarAcentos } from '../utils/texto';

const TABS = [
  { id: 'grabaciones', label: 'Grabaciones' },
  { id: 'metricas', label: 'Metricas' },
];

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
function aArgentina(iso) {
  if (!iso) return null;
  const argentina = new Date(new Date(iso).getTime() - 3 * 60 * 60 * 1000);
  const pad = (n) => String(n).padStart(2, '0');
  return {
    fecha: `${pad(argentina.getUTCDate())}-${pad(argentina.getUTCMonth() + 1)}-${argentina.getUTCFullYear()}`,
    hora: `${pad(argentina.getUTCHours())}:${pad(argentina.getUTCMinutes())}:${pad(argentina.getUTCSeconds())}`,
  };
}

function formatearFecha(iso) {
  const partes = aArgentina(iso);
  return partes ? `${partes.fecha} ${partes.hora} (ARG)` : '—';
}

function formatearSoloFecha(iso) { return aArgentina(iso)?.fecha ?? '—'; }
function formatearSoloHora(iso) { return aArgentina(iso)?.hora ?? '—'; }

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

// Mismo set de 4 colores ya validado (CVD/contraste) en Dashboard.jsx
// (COLORES_MARCA) -- se reusa aca en vez de armar y validar una paleta
// categorica aparte para las mismas 4 tarjetas de NVR.
const COLORES_NVR = ['#3987e5', '#d95926', '#199e70', '#c98500'];

// El color de cada NVR sale de su nombre en orden alfabetico, no del orden
// en que llegan del backend -- si el dia de manana cambia ese orden, el
// color de cada NVR no se reacomoda con el (mismo criterio que Dashboard.jsx).
function colorPorHostname(hostname, ordenAlfabetico) {
  const i = ordenAlfabetico.indexOf(hostname);
  return COLORES_NVR[i % COLORES_NVR.length];
}

// Linea de tiempo del espacio ocupado por NVR (ultimos ~60 dias). Los puntos
// solo existen los dias que alguien actualizo ese NVR -- no es una medicion
// continua, por eso se marcan los puntos reales en vez de solo la linea.
function GraficoHistorialStorage({ nvrs, historial }) {
  const ancho = 640;
  const alto = 260;
  const margen = { top: 12, right: 16, bottom: 28, left: 46 };
  const [hoverFecha, setHoverFecha] = useState(null);

  const ordenAlfabetico = useMemo(() => nvrs.map((n) => n.hostname).sort(), [nvrs]);

  const series = useMemo(() => nvrs
    .map((nvr) => {
      const puntos = (historial[nvr.id] || []).map((p) => ({ fecha: p.fecha, valor: p.ocupadoGb }));
      return puntos.length ? { hostname: nvr.hostname, color: colorPorHostname(nvr.hostname, ordenAlfabetico), puntos } : null;
    })
    .filter(Boolean), [nvrs, historial, ordenAlfabetico]);

  const todasLasFechas = useMemo(() => {
    const set = new Set();
    series.forEach((s) => s.puntos.forEach((p) => set.add(p.fecha)));
    return [...set].sort();
  }, [series]);

  if (series.length === 0) {
    return (
      <div className="text-body-secondary small">
        Todavia no hay puntos guardados. Se suma uno por NVR cada dia que lo actualices (arriba, en Grabaciones).
      </div>
    );
  }

  const minFecha = todasLasFechas[0];
  const maxFecha = todasLasFechas[todasLasFechas.length - 1];
  const tMin = new Date(minFecha).getTime();
  const rangoT = Math.max(1, new Date(maxFecha).getTime() - tMin);
  const maxValor = Math.max(1, ...series.flatMap((s) => s.puntos.map((p) => p.valor))) * 1.08;

  const x = (fecha) => margen.left + ((new Date(fecha).getTime() - tMin) / rangoT) * (ancho - margen.left - margen.right);
  const y = (valor) => (alto - margen.bottom) - (valor / maxValor) * (alto - margen.top - margen.bottom);

  const manejarMouseMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = ((e.clientX - rect.left) / rect.width) * ancho;
    let mejor = todasLasFechas[0];
    let mejorDist = Infinity;
    todasLasFechas.forEach((f) => {
      const d = Math.abs(x(f) - px);
      if (d < mejorDist) { mejorDist = d; mejor = f; }
    });
    setHoverFecha(mejor);
  };

  return (
    <div>
      <svg
        viewBox={`0 0 ${ancho} ${alto}`}
        className="w-100"
        role="img"
        aria-label="Espacio ocupado por NVR en el tiempo"
        onMouseMove={manejarMouseMove}
        onMouseLeave={() => setHoverFecha(null)}
      >
        {[0, 0.5, 1].map((f) => {
          const valor = maxValor * f;
          return (
            <g key={f}>
              <line x1={margen.left} x2={ancho - margen.right} y1={y(valor)} y2={y(valor)} stroke="var(--bs-border-color)" strokeWidth="1" />
              <text x={margen.left - 6} y={y(valor)} textAnchor="end" dominantBaseline="middle" fontSize="9" fill="var(--bs-secondary-color)">
                {num(valor)}
              </text>
            </g>
          );
        })}
        <text x={x(minFecha)} y={alto - 8} fontSize="9" fill="var(--bs-secondary-color)">{formatearSoloFecha(minFecha)}</text>
        <text x={x(maxFecha)} y={alto - 8} fontSize="9" fill="var(--bs-secondary-color)" textAnchor="end">{formatearSoloFecha(maxFecha)}</text>

        {hoverFecha && (
          <line x1={x(hoverFecha)} x2={x(hoverFecha)} y1={margen.top} y2={alto - margen.bottom} stroke="var(--bs-secondary-color)" strokeWidth="1" strokeDasharray="3,3" />
        )}

        {series.map((s) => (
          <g key={s.hostname}>
            <path
              d={s.puntos.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(p.fecha)} ${y(p.valor)}`).join(' ')}
              fill="none"
              stroke={s.color}
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {s.puntos.map((p) => (
              <circle key={p.fecha} cx={x(p.fecha)} cy={y(p.valor)} r={hoverFecha === p.fecha ? 4 : 2.5} fill={s.color} />
            ))}
          </g>
        ))}
      </svg>

      <div className="d-flex flex-wrap gap-3 mt-2">
        {series.map((s) => {
          const punto = hoverFecha ? s.puntos.find((p) => p.fecha === hoverFecha) : null;
          return (
            <div key={s.hostname} className="d-flex align-items-center gap-2 small">
              <span style={{ width: 10, height: 10, borderRadius: 2, background: s.color, display: 'inline-block', flexShrink: 0 }} />
              {s.hostname}
              {hoverFecha && <span className="font-monospace text-body-secondary">{punto ? `${num(punto.valor)} GB` : 'sin dato'}</span>}
            </div>
          );
        })}
      </div>
      {hoverFecha && <div className="small text-body-secondary mt-1">{formatearSoloFecha(hoverFecha)}</div>}
    </div>
  );
}

// Evolucion del espacio ocupado (no una comparativa del dia de hoy como
// antes -- ver GraficoHistorialStorage). Un punto por NVR por dia, solo los
// dias que alguien lo actualiza; el historial recien arranca desde que se
// sumo esta pantalla, no hay como completar el pasado.
function SeccionMetricas({ nvrs }) {
  const [historial, setHistorial] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/nvrs/historial?dias=60')
      .then((res) => setHistorial(res.data))
      .catch((err) => setError(err.response?.data?.error || 'No se pudo consultar el historial.'));
  }, []);

  return (
    <section>
      <p className="text-body-secondary small mb-3">
        Espacio ocupado por NVR, ultimos 60 dias. Un punto por NVR por dia, solo en los dias que alguien lo
        actualiza (en Grabaciones) -- no es una medicion continua, y el historial recien empieza a partir de
        que se sumo esta pantalla.
      </p>
      {error && <div className="alert alert-danger py-2 small">{error}</div>}
      {!historial && !error && <div className="text-body-secondary small">Cargando historial...</div>}
      {historial && (
        <div className="card shadow-sm">
          <div className="card-body">
            <div className="fw-semibold small mb-3">Espacio ocupado (GB)</div>
            <GraficoHistorialStorage nvrs={nvrs} historial={historial} />
          </div>
        </div>
      )}
    </section>
  );
}

export default function Nvr() {
  const { user } = useAuth();
  // El tab activo vive en la URL (?tab=...) para que el sidebar (Layout,
  // grupo "Panel NVR" desplegable) pueda linkear directo a cada uno -- mismo
  // patron que los tabs de Recursos en Crud.jsx.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabIds = TABS.map((t) => t.id);
  const [tab, setTabState] = useState(() => {
    const desdeUrl = searchParams.get('tab');
    return tabIds.includes(desdeUrl) ? desdeUrl : 'grabaciones';
  });
  const setTab = (nuevoTab) => {
    setTabState(nuevoTab);
    setSearchParams((prev) => {
      const siguiente = new URLSearchParams(prev);
      siguiente.set('tab', nuevoTab);
      return siguiente;
    }, { replace: true });
  };
  useEffect(() => {
    const desdeUrl = searchParams.get('tab');
    if (tabIds.includes(desdeUrl) && desdeUrl !== tab) setTabState(desdeUrl);
    else if (!desdeUrl) setSearchParams((prev) => { const s = new URLSearchParams(prev); s.set('tab', tab); return s; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  const [nvrs, setNvrs] = useState([]);
  const [detallePorNvr, setDetallePorNvr] = useState({});
  const [cargandoTodo, setCargandoTodo] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [erroresActualizacion, setErroresActualizacion] = useState([]);
  const [abiertas, setAbiertas] = useState({});
  const [cargandoUno, setCargandoUno] = useState({});
  const [busqueda, setBusqueda] = useState('');
  const [busquedaAbierta, setBusquedaAbierta] = useState(false);
  const busquedaRef = useRef(null);

  // El cache compartido (/nvrs/snapshots) trae lo ultimo que alguien haya
  // actualizado -- pinta la pantalla al toque, sin pegarle a ningun NVR real
  // solo por entrar. "Actualizar"/"Actualizar todo" son los unicos gatillos
  // de una consulta en vivo, y esa consulta pisa el cache para todos.
  useEffect(() => {
    client.get('/nvrs').then((res) => setNvrs(res.data));
    client.get('/nvrs/snapshots').then((res) => setDetallePorNvr((prev) => ({ ...prev, ...res.data })));
  }, []);

  useEffect(() => {
    const alClickear = (e) => {
      if (busquedaRef.current && !busquedaRef.current.contains(e.target)) setBusquedaAbierta(false);
    };
    document.addEventListener('click', alClickear);
    return () => document.removeEventListener('click', alClickear);
  }, []);

  // Hikvision habla ISAPI y Dahua su propio CGI (ver backend/src/routes/nvrs.js
  // > clienteDeNvr) -- las dos marcas entran aca por igual. Dahua todavia
  // cubre menos (sin busqueda de grabaciones ni bitrate por canal), asi que
  // esos campos van a quedar en "—" para esos NVR hasta que se agreguen.
  const nvrsConApi = nvrs;

  // En exito devuelve el snapshot nuevo completo; en error devuelve solo el
  // error, sin tocar estado/canales -- asi una consulta fallida no borra el
  // ultimo dato bueno que ya estaba en pantalla (compartido con el resto de
  // los usuarios via /nvrs/snapshots, ver backend).
  const consultarUno = async (nvr) => {
    try {
      const estadoRes = await client.get(`/nvrs/${nvr.id}/estado`);
      const canalesRes = nvr.canales_totales ? await client.get(`/nvrs/${nvr.id}/canales`) : { data: [] };
      return {
        estado: estadoRes.data,
        canales: canalesRes.data,
        error: null,
        actualizadoEn: new Date().toISOString(),
        actualizadoPor: user?.nombre || null,
      };
    } catch (err) {
      return { error: err.response?.data?.error || err.message || 'Error desconocido' };
    }
  };

  const actualizarUno = async (nvr) => {
    setCargandoUno((prev) => ({ ...prev, [nvr.id]: true }));
    const resultado = await consultarUno(nvr);
    setDetallePorNvr((prev) => ({ ...prev, [nvr.id]: { ...prev[nvr.id], ...resultado } }));
    setCargandoUno((prev) => ({ ...prev, [nvr.id]: false }));
  };

  // Secuencial, NVR por NVR -- son equipos embebidos que rechazan conexiones
  // si se los consulta todos a la vez (mismo criterio que el backend aplica
  // canal por canal dentro de /:id/canales).
  const actualizarTodo = async () => {
    setCargandoTodo(true);
    setErroresActualizacion([]);
    const errores = [];
    for (let i = 0; i < nvrsConApi.length; i += 1) {
      const nvr = nvrsConApi[i];
      setProgreso({ actual: i + 1, total: nvrsConApi.length, hostname: nvr.hostname });
      const resultado = await consultarUno(nvr);
      if (resultado.error) errores.push(`${nvr.hostname}: ${resultado.error}`);
      setDetallePorNvr((prev) => ({ ...prev, [nvr.id]: { ...prev[nvr.id], ...resultado } }));
    }
    setErroresActualizacion(errores);
    setProgreso(null);
    setCargandoTodo(false);
  };

  const toggleCard = (id) => setAbiertas((prev) => ({ ...prev, [id]: !prev[id] }));

  // Derivada del cache, no de esta sesion -- si otro usuario actualizo un
  // NVR hace un rato, la fecha tiene que reflejar eso aunque yo nunca haya
  // tocado "Actualizar".
  const ultimaActualizacion = useMemo(() => {
    const fechas = Object.values(detallePorNvr).map((d) => d?.actualizadoEn).filter(Boolean);
    return fechas.length ? fechas.reduce((a, b) => (a > b ? a : b)) : null;
  }, [detallePorNvr]);

  const resumen = useMemo(() => {
    let canalesInstalados = 0;
    let canalesUsados = 0;
    let storageTotalGb = 0;
    let consumoTotalGbDia = 0;
    let nvrConDatos = 0;
    const retenciones = [];
    for (const nvr of nvrsConApi) {
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
  }, [nvrsConApi, detallePorNvr]);

  const camarasIndex = useMemo(() => {
    const lista = [];
    for (const nvr of nvrsConApi) {
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
  }, [nvrsConApi, detallePorNvr]);

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
            Estado en vivo de cada NVR (Hikvision/ISAPI o Dahua/CGI segun la marca): discos, canales ocupados,
            retencion estimada y camaras. No se consulta nada solo -- se dispara a mano para no bombardear equipos embebidos.
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
            <button type="button" className="btn btn-sm btn-primary text-nowrap" disabled={cargandoTodo || nvrsConApi.length === 0} onClick={actualizarTodo}>
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

      <ul className="nav nav-tabs mt-3 mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.id}>
            <button className={`nav-link ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          </li>
        ))}
      </ul>

      {tab === 'metricas' && <SeccionMetricas nvrs={nvrsConApi} />}

      {tab === 'grabaciones' && (
      <>
      <div className="row row-cols-2 row-cols-md-5 g-3 mt-1 mb-4">
        <KpiTile label="NVR" value={nvrsConApi.length} sub={`${resumen.canalesInstalados} canales instalados`} />
        <KpiTile
          label="Camaras en uso"
          value={resumen.nvrConDatos ? resumen.canalesUsados : '—'}
          sub={resumen.nvrConDatos === 0 ? 'Actualiza para ver' : `${resumen.nvrConDatos}/${nvrsConApi.length} NVR actualizados`}
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

      <section className="mb-4">
        <div className="row g-3">
          {nvrsConApi.length === 0 && <div className="col-12 text-body-secondary">Sin NVR con API disponible en Recursos.</div>}
          {nvrsConApi.map((nvr) => {
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
                        {detalle?.actualizadoEn
                          ? `Actualizado ${formatearFecha(detalle.actualizadoEn)}${detalle.actualizadoPor ? ` por ${detalle.actualizadoPor}` : ''}`
                          : 'Sin actualizar todavia -- nadie lo consulto aun'}
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
                          <Metric label={`Retencion minima (${usados} can.)`} value={retActual != null ? `${num(retActual)} dias` : '—'} className={claseRetencion(retActual)} />
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
                        <div className="table-responsive">
                          <table className="table table-sm align-middle mb-0">
                            <thead className="table-light">
                              <tr>
                                <th>Canal</th>
                                <th>Hostname</th>
                                <th>IP</th>
                                <th>Estado</th>
                                <th>GB/dia</th>
                                <th>Fecha inicio grab.</th>
                                <th>Hora inicio grab.</th>
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
                                  <td className="font-monospace small text-body-secondary">{formatearSoloFecha(c.grabacionMasAntigua)}</td>
                                  <td className="font-monospace small text-body-secondary">{formatearSoloHora(c.grabacionMasAntigua)}</td>
                                  <td>
                                    {c.error ? <span className="text-danger small" title={c.error}>error</span>
                                      : c.online == null && c.diasGrabados != null
                                        ? <span className="text-body-secondary">({num(c.diasGrabados)} dias de grabacion)</span>
                                        : (c.diasDisponibles ?? '—')}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                        <div className="small text-body-secondary mt-2">
                          GB/dia estimado a partir del bitrate maximo configurado de cada canal (ISAPI) -- no es trafico medido byte a byte.
                          Fecha/hora inicio grab. = grabacion mas antigua encontrada en el canal (hora ARG). Dias disponibles = esa fecha vs. hoy
                          -- en canales sin camara asignada eso solo crece (nada nuevo pisa lo viejo), asi que ahi se muestra cuanto duro esa
                          grabacion (mas antigua hasta la mas reciente encontrada).
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
      </section>

      <CalculadoraRetencion nvrs={nvrsConApi} detallePorNvr={detallePorNvr} />
      </>
      )}
    </Layout>
  );
}
