import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import client, { urlFoto } from '../api/client';
import Layout from '../components/Layout';
import UbicacionSelector from '../components/UbicacionSelector';
import NavModal from '../components/NavModal';
import { AREAS_SUGERIDAS } from '../constants/areasSugeridas';
import { useAuth } from '../context/AuthContext';

const TABS = [
  { id: 'camaras', label: 'Camaras' },
  { id: 'nvrs', label: 'NVR' },
  { id: 'edificios', label: 'Edificios' },
  { id: 'pisos', label: 'Pisos' },
  { id: 'areas', label: 'Areas' },
];

const ESTADOS = ['activa', 'inactiva'];
const SIN_MARCA = '__sin_marca__';
const ESTADO_LABEL = { activa: 'Activa', inactiva: 'Inactiva' };
const ESTADO_BADGE = { activa: 'text-bg-success', inactiva: 'text-bg-secondary' };

// Panel CRUD (por ahora) para el inventario: Camaras, NVR, Edificio, Piso y
// Area. El alta/edicion de camaras vive aca (no en "Inventario de camaras",
// que quedo de solo lectura para Admin y Sistemas-lectura). No hay borrado
// de camaras a proposito (RNF-06: baja logica via el campo Activa/Inactiva,
// nunca DELETE — mismo criterio que el resto del sistema). Edificio/Piso/
// Area son catalogos globales independientes (ver 011_pisos_globales.sql):
// borrarlos o renombrarlos si tienen camaras o NVRs asociados queda
// bloqueado en el backend, para no romper referencias.

// Busca `q` como substring, sin importar mayusculas/minusculas, dentro de
// cualquiera de los campos de texto que se le pasen.
function coincideBusqueda(fila, q, campos) {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return campos.some((campo) => (fila[campo] || '').toString().toLowerCase().includes(needle));
}

const FILTRO_VACIO = { edificioId: null, pisoId: null, areaId: null, nvrId: '' };

// Los links de "Compartir" de Google Drive (.../file/d/<ID>/view o
// ?id=<ID>) muestran una pagina de vista previa, no la imagen directa, asi
// que un <img src> nunca los renderiza — se convierten aca al formato que si
// sirve como imagen embebida.
function normalizarUrlImagen(url) {
  if (!url) return url;
  const porRuta = url.match(/drive\.google\.com\/file\/d\/([\w-]+)/);
  const porQuery = url.match(/drive\.google\.com\/.*[?&]id=([\w-]+)/);
  const id = (porRuta || porQuery || [])[1];
  return id ? `https://drive.google.com/uc?export=view&id=${id}` : url;
}

// Compara IPs octeto por octeto (numerico), no como texto — si no, "192.168.0.9"
// quedaria despues de "192.168.0.10". Las camaras sin IP cargada van siempre al final.
function compararIp(a, b) {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  for (let i = 0; i < 4; i++) {
    const diff = (pa[i] ?? -1) - (pb[i] ?? -1);
    if (diff !== 0) return diff;
  }
  return 0;
}

// Edificio/Piso/Area/NVR + un buscador de texto, reutilizado en las 5
// pestanas. Edificio/Piso/Area usan el mismo UbicacionSelector de siempre;
// NVR es un select aparte porque UbicacionSelector no lo conoce.
function FiltrosCrud({ busqueda, onBusqueda, placeholderBusqueda, filtro, onFiltro, nvrs, extra, camposUbicacion, mostrarNvr = true }) {
  return (
    <div className="card-body border-bottom">
      <div className="row g-3 align-items-end">
        <div className="col-12 col-lg-4">
          <label className="form-label fw-semibold">Buscar</label>
          <input className="form-control" placeholder={placeholderBusqueda} value={busqueda} onChange={(e) => onBusqueda(e.target.value)} />
        </div>
        {camposUbicacion?.length !== 0 && (
          <div className="col-12 col-lg-8">
            <UbicacionSelector
              edificioId={filtro.edificioId}
              pisoId={filtro.pisoId}
              areaId={filtro.areaId}
              onChange={(u) => onFiltro({ ...filtro, ...u })}
              {...(camposUbicacion ? { campos: camposUbicacion } : {})}
            />
          </div>
        )}
        {mostrarNvr && (
          <div className="col-6 col-md-3">
            <label className="form-label fw-semibold">NVR</label>
            <select className="form-select" value={filtro.nvrId} onChange={(e) => onFiltro({ ...filtro, nvrId: e.target.value })}>
              <option value="">Todos</option>
              <option value="sin">Sin NVR</option>
              {nvrs.map((n) => <option key={n.id} value={n.id}>{n.hostname}</option>)}
            </select>
          </div>
        )}
        {extra}
      </div>
    </div>
  );
}

export default function Crud() {
  const { user, permisos } = useAuth();
  // El rol "avanzado" tiene el mismo acceso que admin salvo borrado fisico
  // (edificios/pisos/areas/NVR) — esos son los unicos DELETE reales del
  // sistema, asi que los botones de Borrar quedan exclusivos de admin.
  const puedeBorrar = user?.rol === 'admin';
  // sistemas_lectura llega a Camaras/NVR de Recursos de solo lectura — el
  // backend ya rechaza sus POST/PUT (camaras.js/nvrs.js piden admin/avanzado),
  // asi que ocultar estos botones aca es solo para no ofrecer una accion que
  // termina en 403.
  const puedeEditar = user?.rol !== 'sistemas_lectura';
  // Columnas/filtros ocultos por rol (Configuracion → Roles y permisos).
  // admin/sin cargar todavia = nada oculto.
  const colOculta = (tabla, columna) => !!permisos?.columnasOcultas?.[tabla]?.includes(columna);
  const filtroOculto = (tabla, filtro) => !!permisos?.filtrosOcultos?.[tabla]?.includes(filtro);
  // El tab activo vive en la URL (?tab=...) para que el sidebar (Layout,
  // grupo "CRUD" desplegable estilo GLPI) pueda linkear directo a cada uno.
  const [searchParams, setSearchParams] = useSearchParams();
  const tabIds = TABS.map((t) => t.id);
  const [tab, setTabState] = useState(() => {
    const desdeUrl = searchParams.get('tab');
    return tabIds.includes(desdeUrl) ? desdeUrl : 'camaras';
  });
  const setTab = (nuevoTab) => {
    setTabState(nuevoTab);
    setSearchParams((prev) => {
      const siguiente = new URLSearchParams(prev);
      siguiente.set('tab', nuevoTab);
      return siguiente;
    }, { replace: true });
  };
  // Si cambia el ?tab= por afuera (click en el sidebar, atras/adelante del
  // navegador) hay que reflejarlo aca — Crud no se remonta entre esos clicks
  // porque siguen siendo la misma ruta /crud.
  useEffect(() => {
    const desdeUrl = searchParams.get('tab');
    if (tabIds.includes(desdeUrl) && desdeUrl !== tab) setTabState(desdeUrl);
    else if (!desdeUrl) setSearchParams((prev) => { const s = new URLSearchParams(prev); s.set('tab', tab); return s; }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  // Dashboard.jsx manda aca con ?tab=camaras&nvrId=... o &marca=... para
  // llegar a Camaras ya filtrado (ej. "Grabando" → nvrId=con). Se consume
  // una sola vez al montar y se limpia de la URL, para no reaplicar el
  // filtro si despues el usuario cambia de tab y vuelve.
  useEffect(() => {
    const nvrId = searchParams.get('nvrId');
    const marca = searchParams.get('marca');
    if (!nvrId && !marca) return;
    if (nvrId) setFiltroCam((f) => ({ ...f, nvrId }));
    if (marca) setFiltroCamMarca(marca);
    setSearchParams((prev) => {
      const s = new URLSearchParams(prev);
      s.delete('nvrId');
      s.delete('marca');
      return s;
    }, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [camaras, setCamaras] = useState([]);
  const [nvrs, setNvrs] = useState([]);
  const [edificios, setEdificios] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [areas, setAreas] = useState([]);

  const [busquedaCamaras, setBusquedaCamaras] = useState('');
  const [vistaCamaras, setVistaCamaras] = useState('tabla');
  const [ordenIp, setOrdenIp] = useState(null); // null | 'asc' | 'desc'
  const [filtroCam, setFiltroCam] = useState(FILTRO_VACIO);
  const [filtroCamEstado, setFiltroCamEstado] = useState('');
  const [filtroCamMarca, setFiltroCamMarca] = useState('');
  const [busquedaNvrs, setBusquedaNvrs] = useState('');
  const [filtroNvrTab, setFiltroNvrTab] = useState(FILTRO_VACIO);
  const [busquedaEdificios, setBusquedaEdificios] = useState('');
  const [filtroEdifTab, setFiltroEdifTab] = useState(FILTRO_VACIO);
  const [busquedaPisos, setBusquedaPisos] = useState('');
  const [filtroPisoTab, setFiltroPisoTab] = useState(FILTRO_VACIO);
  const [busquedaAreas, setBusquedaAreas] = useState('');

  const [modal, setModal] = useState(null);
  const [detalleCamara, setDetalleCamara] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargarCamaras = () => client.get('/camaras').then((res) => setCamaras(res.data));
  const cargarNvrs = () => client.get('/nvrs').then((res) => setNvrs(res.data));
  const cargarEdificios = () => client.get('/ubicaciones/edificios').then((res) => setEdificios(res.data));
  const cargarPisos = () => client.get('/ubicaciones/pisos').then((res) => setPisos(res.data));
  const cargarAreas = () => client.get('/ubicaciones/areas').then((res) => setAreas(res.data));

  useEffect(() => { cargarCamaras(); cargarNvrs(); cargarEdificios(); cargarPisos(); cargarAreas(); }, []);

  const cerrarModal = () => { setModal(null); setError(''); };

  const abrirModalCamara = (fila) => setModal({
    tipo: 'camara',
    id: fila?.id ?? null,
    hostname: fila?.hostname ?? '',
    descripcion: fila?.descripcion ?? '',
    observaciones: fila?.observaciones ?? '',
    marca: fila?.marca ?? '',
    modelo: fila?.modelo ?? '',
    ip: fila?.ip ?? '',
    mac_address: fila?.mac_address ?? '',
    usuario: fila?.usuario ?? '',
    contrasena: fila?.contrasena ?? '',
    estado: fila?.estado ?? 'activa',
    edificio_id: fila?.edificio_id ?? '',
    piso_id: fila?.piso_id ?? '',
    area_id: fila?.area_id ?? '',
    nvr_id: fila?.nvr_id ?? '',
    imagenArchivo: null,
    imagenUrl: fila?.imagen_url ?? '',
    imagenActual: fila?.imagen_url ?? '',
  });
  const abrirModalNvr = (fila) => setModal({
    tipo: 'nvr',
    id: fila?.id ?? null,
    hostname: fila?.hostname ?? '',
    ip: fila?.ip ?? '',
    mac_address: fila?.mac_address ?? '',
    edificio_id: fila?.edificio_id ?? '',
    piso_id: fila?.piso_id ?? '',
    marca: fila?.marca ?? '',
    modelo: fila?.modelo ?? '',
    canales_totales: fila?.canales_totales ?? '',
  });
  const abrirModalEdificio = (fila) => setModal({ tipo: 'edificio', id: fila?.id ?? null, nombre: fila?.nombre ?? '' });
  const abrirModalPiso = (fila) => setModal({ tipo: 'piso', id: fila?.id ?? null, nombre: fila?.nombre ?? '' });
  const abrirModalArea = (fila) => setModal({ tipo: 'area', id: fila?.id ?? null, nombre: fila?.nombre ?? '' });

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    setGuardando(true);
    try {
      if (modal.tipo === 'camara') {
        if (!modal.edificio_id || !modal.piso_id || !modal.area_id) {
          setError('Elegi edificio, piso y area para la camara.');
          return;
        }
        const datos = new FormData();
        datos.append('hostname', modal.hostname.trim());
        datos.append('descripcion', modal.descripcion);
        datos.append('observaciones', modal.observaciones);
        datos.append('marca', modal.marca);
        datos.append('modelo', modal.modelo);
        datos.append('ip', modal.ip);
        datos.append('mac_address', modal.mac_address);
        datos.append('usuario', modal.usuario);
        datos.append('contrasena', modal.contrasena);
        datos.append('estado', modal.estado);
        datos.append('edificio_id', modal.edificio_id);
        datos.append('piso_id', modal.piso_id);
        datos.append('area_id', modal.area_id);
        datos.append('nvr_id', modal.nvr_id);
        if (modal.imagenArchivo) datos.append('imagen', modal.imagenArchivo);
        else datos.append('imagen_url', normalizarUrlImagen(modal.imagenUrl.trim()));

        if (modal.id) await client.put(`/camaras/${modal.id}`, datos);
        else await client.post('/camaras', datos);
        await cargarCamaras();
      } else if (modal.tipo === 'nvr') {
        const datos = {
          hostname: modal.hostname.trim(),
          ip: modal.ip.trim() || undefined,
          mac_address: modal.mac_address.trim() || undefined,
          edificio_id: modal.edificio_id || undefined,
          piso_id: modal.piso_id || undefined,
          marca: modal.marca.trim() || undefined,
          modelo: modal.modelo.trim() || undefined,
          canales_totales: modal.canales_totales || undefined,
        };
        if (modal.id) await client.put(`/nvrs/${modal.id}`, datos);
        else await client.post('/nvrs', datos);
        await cargarNvrs();
      } else if (modal.tipo === 'edificio') {
        const datos = { nombre: modal.nombre.trim() };
        if (modal.id) await client.put(`/ubicaciones/edificios/${modal.id}`, datos);
        else await client.post('/ubicaciones/edificios', datos);
        await cargarEdificios();
      } else if (modal.tipo === 'piso') {
        const datos = { nombre: modal.nombre.trim() };
        if (modal.id) await client.put(`/ubicaciones/pisos/${modal.id}`, datos);
        else await client.post('/ubicaciones/pisos', datos);
        await cargarPisos();
      } else if (modal.tipo === 'area') {
        const datos = { nombre: modal.nombre.trim() };
        if (modal.id) await client.put(`/ubicaciones/areas/${modal.id}`, datos);
        else await client.post('/ubicaciones/areas', datos);
        await cargarAreas();
      }
      cerrarModal();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  const borrar = async (tipo, id) => {
    if (!window.confirm('¿Borrar este registro?')) return;
    const rutas = { nvr: `/nvrs/${id}`, edificio: `/ubicaciones/edificios/${id}`, piso: `/ubicaciones/pisos/${id}`, area: `/ubicaciones/areas/${id}` };
    try {
      await client.delete(rutas[tipo]);
      if (tipo === 'nvr') await cargarNvrs();
      else if (tipo === 'edificio') await cargarEdificios();
      else if (tipo === 'piso') await cargarPisos();
      else if (tipo === 'area') await cargarAreas();
    } catch (err) {
      window.alert(err.response?.data?.error || 'No se pudo borrar');
    }
  };

  const camarasFiltradas = camaras.filter((c) => {
    if (!coincideBusqueda(c, busquedaCamaras, ['hostname', 'ip', 'mac_address', 'area', 'descripcion'])) return false;
    if (filtroCam.edificioId && c.edificio_id !== filtroCam.edificioId) return false;
    if (filtroCam.pisoId && c.piso_id !== filtroCam.pisoId) return false;
    if (filtroCam.areaId && c.area_id !== filtroCam.areaId) return false;
    if (filtroCam.nvrId === 'sin' && c.nvr_id) return false;
    if (filtroCam.nvrId === 'con' && !c.nvr_id) return false;
    if (filtroCam.nvrId && filtroCam.nvrId !== 'sin' && filtroCam.nvrId !== 'con' && String(c.nvr_id) !== filtroCam.nvrId) return false;
    if (filtroCamEstado && c.estado !== filtroCamEstado) return false;
    if (filtroCamMarca === SIN_MARCA && c.marca) return false;
    if (filtroCamMarca && filtroCamMarca !== SIN_MARCA && c.marca !== filtroCamMarca) return false;
    return true;
  });
  const camarasOrdenadas = ordenIp
    ? [...camarasFiltradas].sort((a, b) => (ordenIp === 'asc' ? compararIp(a.ip, b.ip) : compararIp(b.ip, a.ip)))
    : camarasFiltradas;
  const toggleOrdenIp = () => setOrdenIp((actual) => (actual === 'asc' ? 'desc' : 'asc'));
  const indiceDetalleCamara = detalleCamara ? camarasOrdenadas.findIndex((c) => c.id === detalleCamara.id) : -1;
  const moverDetalleCamara = (delta) => {
    const nuevo = camarasOrdenadas[indiceDetalleCamara + delta];
    if (nuevo) setDetalleCamara(nuevo);
  };
  const marcasDisponibles = [...new Set(camaras.map((c) => c.marca).filter(Boolean))].sort();
  const hayFiltrosCamaras = busquedaCamaras || filtroCam.edificioId || filtroCam.pisoId
    || filtroCam.areaId || filtroCam.nvrId || filtroCamEstado || filtroCamMarca;
  const limpiarFiltrosCamaras = () => {
    setBusquedaCamaras('');
    setFiltroCam(FILTRO_VACIO);
    setFiltroCamEstado('');
    setFiltroCamMarca('');
  };

  const nvrsFiltrados = nvrs.filter((n) =>
    coincideBusqueda(n, busquedaNvrs, ['hostname', 'ip', 'mac_address', 'edificio', 'piso']) &&
    (!filtroNvrTab.edificioId || n.edificio_id === filtroNvrTab.edificioId) &&
    (filtroNvrTab.nvrId === 'sin' ? false : (!filtroNvrTab.nvrId || String(n.id) === filtroNvrTab.nvrId))
  );

  // Sin filtro de ubicacion/NVR en estos dos tabs (ver FiltrosCrud mas abajo)
  // — alcanza con el buscador de texto.
  const edificiosFiltrados = edificios.filter((e) => coincideBusqueda(e, busquedaEdificios, ['nombre']));
  const pisosFiltrados = pisos.filter((p) => coincideBusqueda(p, busquedaPisos, ['nombre']));

  const areasFiltradas = areas.filter((a) => coincideBusqueda(a, busquedaAreas, ['nombre']));

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-1">Recursos</h1>
      <p className="text-body-secondary mb-4">
        Camaras, NVR, Edificio, Piso y Area. Edificio, Piso y Area son listas independientes entre si (un
        piso no pertenece a un edificio puntual). No hay borrado de camaras — dar de baja es marcarla
        Inactiva. Borrar un edificio/piso/area/NVR que ya esta en uso queda bloqueado, para no romper
        referencias.
      </p>

      <ul className="nav nav-tabs mb-3">
        {TABS.map((t) => (
          <li className="nav-item" key={t.id}>
            <button className={`nav-link ${tab === t.id ? 'active' : ''}`} onClick={() => setTab(t.id)}>{t.label}</button>
          </li>
        ))}
      </ul>

      {tab === 'camaras' && (
        <div className="card shadow-sm">
          <div className="card-header d-flex justify-content-between align-items-center flex-wrap gap-2">
            <span className="fw-semibold">Camaras <span className="text-body-secondary fw-normal">({camarasFiltradas.length} de {camaras.length})</span></span>
            <div className="d-flex gap-2">
              <div className="btn-group" role="group">
                <button
                  type="button"
                  className={`btn btn-sm ${vistaCamaras === 'tabla' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setVistaCamaras('tabla')}
                >
                  Tabla
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${vistaCamaras === 'tarjetas' ? 'btn-primary' : 'btn-outline-primary'}`}
                  onClick={() => setVistaCamaras('tarjetas')}
                >
                  Tarjetas
                </button>
              </div>
              {puedeEditar && <button className="btn btn-primary btn-sm" onClick={() => abrirModalCamara()}>+ Agregar</button>}
            </div>
          </div>
          <FiltrosCrud
            busqueda={busquedaCamaras}
            onBusqueda={setBusquedaCamaras}
            placeholderBusqueda="IP, MAC, Hostname, Area o Descripcion..."
            filtro={filtroCam}
            onFiltro={setFiltroCam}
            nvrs={nvrs}
            camposUbicacion={['edificio', 'piso', 'area'].filter((c) => !filtroOculto('camaras', c))}
            mostrarNvr={!filtroOculto('camaras', 'nvr')}
            extra={(
              <>
                {!filtroOculto('camaras', 'marca') && (
                  <div className="col-6 col-md-3">
                    <label className="form-label fw-semibold">Marca</label>
                    <select className="form-select" value={filtroCamMarca} onChange={(e) => setFiltroCamMarca(e.target.value)}>
                      <option value="">Todas las marcas</option>
                      {marcasDisponibles.map((m) => <option key={m} value={m}>{m}</option>)}
                      <option value={SIN_MARCA}>Sin marca</option>
                    </select>
                  </div>
                )}
                {!filtroOculto('camaras', 'estado') && (
                  <div className="col-6 col-md-3">
                    <label className="form-label fw-semibold">Estado</label>
                    <select className="form-select" value={filtroCamEstado} onChange={(e) => setFiltroCamEstado(e.target.value)}>
                      <option value="">Todos los estados</option>
                      {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                    </select>
                  </div>
                )}
                <div className="col-12 col-md-3">
                  <button className="btn btn-outline-secondary w-100" onClick={limpiarFiltrosCamaras} disabled={!hayFiltrosCamaras}>Limpiar filtros</button>
                </div>
              </>
            )}
          />
          {vistaCamaras === 'tabla' ? (
            <div className="table-responsive">
              <table className="table table-hover align-middle mb-0">
                <thead className="table-light">
                  <tr>
                    {!colOculta('camaras', 'hostname') && <th>Hostname</th>}
                    {!colOculta('camaras', 'ip') && (
                      <th role="button" onClick={toggleOrdenIp} style={{ cursor: 'pointer', userSelect: 'none' }}>
                        IP {ordenIp === 'asc' ? '▲' : ordenIp === 'desc' ? '▼' : ''}
                      </th>
                    )}
                    {!colOculta('camaras', 'edificio') && <th>Edificio</th>}
                    {!colOculta('camaras', 'piso') && <th>Piso</th>}
                    {!colOculta('camaras', 'area') && <th>Area</th>}
                    {!colOculta('camaras', 'marca') && <th>Marca</th>}
                    {!colOculta('camaras', 'estado') && <th>Estado</th>}
                    {!colOculta('camaras', 'nvr') && <th>NVR</th>}
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  {camarasOrdenadas.map((c) => (
                    <tr key={c.id} role="button" onClick={() => setDetalleCamara(c)} style={{ cursor: 'pointer' }}>
                      {!colOculta('camaras', 'hostname') && <td>{c.hostname}</td>}
                      {!colOculta('camaras', 'ip') && <td>{c.ip || '—'}</td>}
                      {!colOculta('camaras', 'edificio') && <td>{c.edificio}</td>}
                      {!colOculta('camaras', 'piso') && <td>{c.piso}</td>}
                      {!colOculta('camaras', 'area') && <td>{c.area}</td>}
                      {!colOculta('camaras', 'marca') && <td>{c.marca || '—'}</td>}
                      {!colOculta('camaras', 'estado') && (
                        <td><span className={`badge ${ESTADO_BADGE[c.estado] || 'text-bg-secondary'}`}>{ESTADO_LABEL[c.estado] || c.estado}</span></td>
                      )}
                      {!colOculta('camaras', 'nvr') && <td>{c.nvr || '—'}</td>}
                      <td className="text-end">
                        {puedeEditar && <button className="btn btn-sm btn-outline-secondary" onClick={(e) => { e.stopPropagation(); abrirModalCamara(c); }}>Editar</button>}
                      </td>
                    </tr>
                  ))}
                  {camarasFiltradas.length === 0 && (
                    <tr><td colSpan={9} className="text-body-secondary">
                      {camaras.length === 0 ? 'Todavia no hay camaras cargadas' : 'Ninguna camara coincide con la busqueda/filtros'}
                    </td></tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="camera-grid p-3">
              {camarasOrdenadas.map((c) => (
                <div className="card camera-card shadow-sm" key={c.id} role="button" onClick={() => setDetalleCamara(c)}>
                  <div className="camera-thumb">
                    {c.imagen_url ? (
                      <img src={urlFoto(c.imagen_url)} alt={c.hostname} />
                    ) : (
                      <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="7" width="15" height="12" rx="2" /><path d="M18 10l4-2v10l-4-2" />
                      </svg>
                    )}
                    <span className={`badge ${ESTADO_BADGE[c.estado] || 'text-bg-secondary'} camera-estado-badge`}>
                      {ESTADO_LABEL[c.estado] || c.estado}
                    </span>
                  </div>
                  <div className="card-body">
                    <div className="fw-semibold mb-1">{c.hostname}</div>
                    <div className="small text-body-secondary mb-1">{c.ip || '—'}</div>
                    <div className="small text-body-secondary mb-1">{c.piso} · {c.edificio}</div>
                    <div className="small text-body-secondary mb-1">{c.area}</div>
                    <div className="small text-body-secondary">{c.marca || '—'} {c.nvr ? `· ${c.nvr}` : ''}</div>
                  </div>
                </div>
              ))}
              {camarasFiltradas.length === 0 && (
                <p className="text-body-secondary mb-0">
                  {camaras.length === 0 ? 'Todavia no hay camaras cargadas' : 'Ninguna camara coincide con la busqueda/filtros'}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {tab === 'nvrs' && (
        <div className="card shadow-sm">
          <div className="card-header d-flex justify-content-between align-items-center">
            <span className="fw-semibold">NVR <span className="text-body-secondary fw-normal">({nvrsFiltrados.length} de {nvrs.length})</span></span>
            {puedeEditar && <button className="btn btn-primary btn-sm" onClick={() => abrirModalNvr()}>+ Agregar</button>}
          </div>
          <FiltrosCrud
            busqueda={busquedaNvrs}
            onBusqueda={setBusquedaNvrs}
            placeholderBusqueda="Hostname, IP, MAC..."
            filtro={filtroNvrTab}
            onFiltro={setFiltroNvrTab}
            nvrs={nvrs}
            camposUbicacion={filtroOculto('nvrs', 'edificio') ? [] : ['edificio']}
            mostrarNvr={!filtroOculto('nvrs', 'nvr')}
          />
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0 text-nowrap">
              <thead className="table-light">
                <tr>
                  {!colOculta('nvrs', 'hostname') && <th>Hostname</th>}
                  {!colOculta('nvrs', 'ip') && <th>IP</th>}
                  {!colOculta('nvrs', 'edificio') && <th>Edificio</th>}
                  {!colOculta('nvrs', 'piso') && <th>Piso</th>}
                  {!colOculta('nvrs', 'marca') && <th>Marca</th>}
                  {!colOculta('nvrs', 'modelo') && <th>Modelo</th>}
                  {!colOculta('nvrs', 'ocupados') && <th>Ocupados</th>}
                  {!colOculta('nvrs', 'disponibles') && <th>Disponibles</th>}
                  {!colOculta('nvrs', 'canales') && <th>Canales</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {nvrsFiltrados.map((n) => (
                  <tr key={n.id}>
                    {!colOculta('nvrs', 'hostname') && <td>{n.hostname}</td>}
                    {!colOculta('nvrs', 'ip') && <td>{n.ip || '—'}</td>}
                    {!colOculta('nvrs', 'edificio') && <td>{n.edificio || '—'}</td>}
                    {!colOculta('nvrs', 'piso') && <td>{n.piso || '—'}</td>}
                    {!colOculta('nvrs', 'marca') && <td>{n.marca || '—'}</td>}
                    {!colOculta('nvrs', 'modelo') && <td>{n.modelo || '—'}</td>}
                    {!colOculta('nvrs', 'ocupados') && (
                      <td><span className="badge text-bg-warning">{n.cantidad_camaras}</span></td>
                    )}
                    {!colOculta('nvrs', 'disponibles') && (
                      <td>
                        {n.canales_totales ? (
                          <span className="badge text-bg-success">{n.canales_totales - n.cantidad_camaras}</span>
                        ) : '—'}
                      </td>
                    )}
                    {!colOculta('nvrs', 'canales') && <td>{n.canales_totales || '—'}</td>}
                    <td className="text-end">
                      {puedeEditar && <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => abrirModalNvr(n)}>Editar</button>}
                      {puedeBorrar && <button className="btn btn-sm btn-outline-danger" onClick={() => borrar('nvr', n.id)}>Borrar</button>}
                    </td>
                  </tr>
                ))}
                {nvrsFiltrados.length === 0 && (
                  <tr><td colSpan={10} className="text-body-secondary">
                    {nvrs.length === 0 ? 'Todavia no hay NVRs cargados' : 'Ningun NVR coincide con la busqueda'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'edificios' && (
        <div className="card shadow-sm">
          <div className="card-header d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Edificios <span className="text-body-secondary fw-normal">({edificiosFiltrados.length} de {edificios.length})</span></span>
            <button className="btn btn-primary btn-sm" onClick={() => abrirModalEdificio()}>+ Agregar</button>
          </div>
          <FiltrosCrud
            busqueda={busquedaEdificios}
            onBusqueda={setBusquedaEdificios}
            placeholderBusqueda="Nombre del edificio..."
            filtro={filtroEdifTab}
            onFiltro={setFiltroEdifTab}
            nvrs={nvrs}
            camposUbicacion={[]}
            mostrarNvr={false}
          />
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  {!colOculta('edificios', 'nombre') && <th>Nombre</th>}
                  {!colOculta('edificios', 'camaras') && <th>Camaras</th>}
                  {!colOculta('edificios', 'nvrs') && <th>NVRs</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {edificiosFiltrados.map((ed) => (
                  <tr key={ed.id}>
                    {!colOculta('edificios', 'nombre') && <td>{ed.nombre}</td>}
                    {!colOculta('edificios', 'camaras') && <td><span className="badge text-bg-secondary">{ed.cantidad_camaras}</span></td>}
                    {!colOculta('edificios', 'nvrs') && <td><span className="badge text-bg-secondary">{ed.cantidad_nvrs}</span></td>}
                    <td className="text-end">
                      <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => abrirModalEdificio(ed)}>Editar</button>
                      {puedeBorrar && <button className="btn btn-sm btn-outline-danger" onClick={() => borrar('edificio', ed.id)}>Borrar</button>}
                    </td>
                  </tr>
                ))}
                {edificiosFiltrados.length === 0 && (
                  <tr><td colSpan={4} className="text-body-secondary">
                    {edificios.length === 0 ? 'Todavia no hay edificios cargados' : 'Ningun edificio coincide con la busqueda'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'pisos' && (
        <div className="card shadow-sm">
          <div className="card-header d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Pisos <span className="text-body-secondary fw-normal">({pisosFiltrados.length} de {pisos.length})</span></span>
            <button className="btn btn-primary btn-sm" onClick={() => abrirModalPiso()}>+ Agregar</button>
          </div>
          <FiltrosCrud
            busqueda={busquedaPisos}
            onBusqueda={setBusquedaPisos}
            placeholderBusqueda="Nombre del piso..."
            filtro={filtroPisoTab}
            onFiltro={setFiltroPisoTab}
            nvrs={nvrs}
            camposUbicacion={[]}
            mostrarNvr={false}
          />
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  {!colOculta('pisos', 'nombre') && <th>Nombre</th>}
                  {!colOculta('pisos', 'camaras') && <th>Camaras</th>}
                  {!colOculta('pisos', 'nvrs') && <th>NVRs</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {pisosFiltrados.map((p) => (
                  <tr key={p.id}>
                    {!colOculta('pisos', 'nombre') && <td>{p.nombre}</td>}
                    {!colOculta('pisos', 'camaras') && <td><span className="badge text-bg-secondary">{p.cantidad_camaras}</span></td>}
                    {!colOculta('pisos', 'nvrs') && <td><span className="badge text-bg-secondary">{p.cantidad_nvrs}</span></td>}
                    <td className="text-end">
                      <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => abrirModalPiso(p)}>Editar</button>
                      {puedeBorrar && <button className="btn btn-sm btn-outline-danger" onClick={() => borrar('piso', p.id)}>Borrar</button>}
                    </td>
                  </tr>
                ))}
                {pisosFiltrados.length === 0 && (
                  <tr><td colSpan={4} className="text-body-secondary">
                    {pisos.length === 0 ? 'Todavia no hay pisos cargados' : 'Ningun piso coincide con la busqueda'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tab === 'areas' && (
        <div className="card shadow-sm">
          <div className="card-header d-flex justify-content-between align-items-center">
            <span className="fw-semibold">Areas <span className="text-body-secondary fw-normal">({areasFiltradas.length} de {areas.length})</span></span>
            <button className="btn btn-primary btn-sm" onClick={() => abrirModalArea()}>+ Agregar</button>
          </div>
          <div className="card-body border-bottom">
            <label className="form-label fw-semibold">Buscar</label>
            <input className="form-control" placeholder="Nombre del area..." value={busquedaAreas} onChange={(e) => setBusquedaAreas(e.target.value)} />
          </div>
          <div className="table-responsive">
            <table className="table table-hover align-middle mb-0">
              <thead className="table-light">
                <tr>
                  {!colOculta('areas', 'nombre') && <th>Nombre</th>}
                  {!colOculta('areas', 'camaras') && <th>Camaras</th>}
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {areasFiltradas.map((a) => (
                  <tr key={a.id}>
                    {!colOculta('areas', 'nombre') && <td>{a.nombre}</td>}
                    {!colOculta('areas', 'camaras') && <td><span className="badge text-bg-secondary">{a.cantidad_camaras}</span></td>}
                    <td className="text-end">
                      <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => abrirModalArea(a)}>Editar</button>
                      {puedeBorrar && <button className="btn btn-sm btn-outline-danger" onClick={() => borrar('area', a.id)}>Borrar</button>}
                    </td>
                  </tr>
                ))}
                {areasFiltradas.length === 0 && (
                  <tr><td colSpan={3} className="text-body-secondary">
                    {areas.length === 0 ? 'Todavia no hay areas cargadas' : 'Ninguna area coincide con la busqueda'}
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {modal && (
        <>
          <div className="modal d-block" tabIndex="-1" role="dialog" onClick={(e) => { if (e.target === e.currentTarget) cerrarModal(); }}>
            <div className={`modal-dialog modal-dialog-centered ${modal.tipo === 'camara' ? 'modal-lg' : ''}`} role="document">
              <div className="modal-content">
                <form onSubmit={guardar}>
                  <div className="modal-header">
                    <h2 className="modal-title h5">
                      {modal.id ? 'Editar' : 'Agregar'} {TABS.find((t) => t.id === `${modal.tipo}s`)?.label || modal.tipo}
                    </h2>
                    <button type="button" className="btn-close" aria-label="Cerrar" onClick={cerrarModal} />
                  </div>
                  <div className="modal-body">
                    {modal.tipo === 'camara' && (
                      <>
                        <h3 className="h6 fw-semibold mb-2">Ubicacion</h3>
                        <UbicacionSelector
                          edificioId={modal.edificio_id || null}
                          pisoId={modal.piso_id || null}
                          areaId={modal.area_id || null}
                          onChange={({ edificioId, pisoId, areaId }) => setModal((m) => ({ ...m, edificio_id: edificioId, piso_id: pisoId, area_id: areaId }))}
                          placeholderTodos={false}
                        />

                        <div className="row g-3 mt-1">
                          <div className="col-12">
                            <label className="form-label">Descripcion</label>
                            <input className="form-control" value={modal.descripcion} onChange={(e) => setModal((m) => ({ ...m, descripcion: e.target.value }))} />
                          </div>
                          <div className="col-12">
                            <label className="form-label">Observaciones</label>
                            <textarea className="form-control" rows={2} value={modal.observaciones} onChange={(e) => setModal((m) => ({ ...m, observaciones: e.target.value }))} />
                          </div>
                          <div className="col-12 col-md-6">
                            <label className="form-label">Marca</label>
                            <input className="form-control" value={modal.marca} onChange={(e) => setModal((m) => ({ ...m, marca: e.target.value }))} />
                          </div>
                          <div className="col-12 col-md-6">
                            <label className="form-label">Modelo</label>
                            <input className="form-control" value={modal.modelo} onChange={(e) => setModal((m) => ({ ...m, modelo: e.target.value }))} />
                          </div>
                          <div className="col-12 col-md-6">
                            <label className="form-label">Direccion IP</label>
                            <input className="form-control" value={modal.ip} onChange={(e) => setModal((m) => ({ ...m, ip: e.target.value }))} />
                          </div>
                          <div className="col-12 col-md-6">
                            <label className="form-label">Direccion MAC</label>
                            <input className="form-control" value={modal.mac_address} onChange={(e) => setModal((m) => ({ ...m, mac_address: e.target.value }))} />
                          </div>
                          <div className="col-12">
                            <label className="form-label">ID / Hostname</label>
                            <input className="form-control" value={modal.hostname} onChange={(e) => setModal((m) => ({ ...m, hostname: e.target.value }))} required autoFocus />
                          </div>
                          <div className="col-12 col-md-6">
                            <label className="form-label">Usuario</label>
                            <input className="form-control" value={modal.usuario} onChange={(e) => setModal((m) => ({ ...m, usuario: e.target.value }))} autoComplete="off" />
                          </div>
                          <div className="col-12 col-md-6">
                            <label className="form-label">Contrasena</label>
                            <input className="form-control" value={modal.contrasena} onChange={(e) => setModal((m) => ({ ...m, contrasena: e.target.value }))} autoComplete="off" />
                          </div>
                          <div className="col-12 col-md-6">
                            <label className="form-label">Activa</label>
                            <select className="form-select" value={modal.estado} onChange={(e) => setModal((m) => ({ ...m, estado: e.target.value }))}>
                              {ESTADOS.map((e) => <option key={e} value={e}>{ESTADO_LABEL[e]}</option>)}
                            </select>
                          </div>
                          <div className="col-12">
                            <label className="form-label">NVR</label>
                            <select className="form-select" value={modal.nvr_id} onChange={(e) => setModal((m) => ({ ...m, nvr_id: e.target.value }))}>
                              <option value="">Sin NVR asignado</option>
                              {nvrs.map((n) => <option key={n.id} value={n.id}>{n.hostname}</option>)}
                            </select>
                          </div>
                        </div>

                        <h3 className="h6 fw-semibold mb-2 mt-4">Imagen</h3>
                        {modal.imagenActual && (
                          <div className="d-flex align-items-center gap-2 mb-2">
                            <img src={urlFoto(modal.imagenActual)} alt="" style={{ width: 80, height: 80, objectFit: 'cover', borderRadius: 6 }} />
                            <button
                              type="button"
                              className="btn btn-sm btn-outline-danger"
                              onClick={() => setModal((m) => ({ ...m, imagenArchivo: null, imagenUrl: '', imagenActual: '' }))}
                            >
                              Quitar foto
                            </button>
                          </div>
                        )}
                        <div className="row g-3">
                          <div className="col-12 col-md-6">
                            <label className="form-label">Subir archivo (jpg o png)</label>
                            <input
                              type="file"
                              accept="image/jpeg,image/png"
                              className="form-control"
                              onChange={(e) => setModal((m) => ({ ...m, imagenArchivo: e.target.files[0] || null }))}
                            />
                          </div>
                          <div className="col-12 col-md-6">
                            <label className="form-label">...o URL de una imagen ya hosteada</label>
                            <input
                              className="form-control"
                              placeholder="https://..."
                              value={modal.imagenUrl}
                              onChange={(e) => setModal((m) => ({ ...m, imagenUrl: e.target.value }))}
                              disabled={!!modal.imagenArchivo}
                            />
                          </div>
                        </div>
                      </>
                    )}

                    {modal.tipo === 'nvr' && (
                      <>
                        <div className="mb-3">
                          <label className="form-label">Hostname</label>
                          <input className="form-control" value={modal.hostname} onChange={(e) => setModal((m) => ({ ...m, hostname: e.target.value }))} required autoFocus />
                        </div>
                        <div className="mb-3">
                          <label className="form-label">IP</label>
                          <input className="form-control" value={modal.ip} onChange={(e) => setModal((m) => ({ ...m, ip: e.target.value }))} />
                        </div>
                        <div className="mb-3">
                          <label className="form-label">MAC</label>
                          <input className="form-control" value={modal.mac_address} onChange={(e) => setModal((m) => ({ ...m, mac_address: e.target.value }))} />
                        </div>
                        <div className="row g-3 mb-3">
                          <div className="col-5">
                            <label className="form-label">Marca</label>
                            <input className="form-control" value={modal.marca} onChange={(e) => setModal((m) => ({ ...m, marca: e.target.value }))} />
                          </div>
                          <div className="col-5">
                            <label className="form-label">Modelo</label>
                            <input className="form-control" value={modal.modelo} onChange={(e) => setModal((m) => ({ ...m, modelo: e.target.value }))} />
                          </div>
                          <div className="col-2">
                            <label className="form-label">Canales</label>
                            <input type="number" min="1" className="form-control" value={modal.canales_totales} onChange={(e) => setModal((m) => ({ ...m, canales_totales: e.target.value }))} />
                          </div>
                        </div>
                        <div className="row g-3">
                          <div className="col-6">
                            <label className="form-label">Edificio</label>
                            <select className="form-select" value={modal.edificio_id} onChange={(e) => setModal((m) => ({ ...m, edificio_id: e.target.value }))}>
                              <option value="">Sin definir</option>
                              {edificios.map((ed) => <option key={ed.id} value={ed.id}>{ed.nombre}</option>)}
                            </select>
                          </div>
                          <div className="col-6">
                            <label className="form-label">Piso</label>
                            <select className="form-select" value={modal.piso_id} onChange={(e) => setModal((m) => ({ ...m, piso_id: e.target.value }))}>
                              <option value="">Sin definir</option>
                              {pisos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
                            </select>
                          </div>
                        </div>
                      </>
                    )}

                    {modal.tipo === 'edificio' && (
                      <div className="mb-1">
                        <label className="form-label">Nombre</label>
                        <input className="form-control" value={modal.nombre} onChange={(e) => setModal((m) => ({ ...m, nombre: e.target.value }))} required autoFocus />
                      </div>
                    )}

                    {modal.tipo === 'piso' && (
                      <div className="mb-1">
                        <label className="form-label">Nombre</label>
                        <input className="form-control" value={modal.nombre} onChange={(e) => setModal((m) => ({ ...m, nombre: e.target.value }))} required autoFocus />
                      </div>
                    )}

                    {modal.tipo === 'area' && (
                      <div className="mb-1">
                        <label className="form-label">Nombre</label>
                        <input className="form-control" list="areas-sugeridas" value={modal.nombre} onChange={(e) => setModal((m) => ({ ...m, nombre: e.target.value }))} required autoFocus />
                        <datalist id="areas-sugeridas">
                          {AREAS_SUGERIDAS.map((nombre) => <option key={nombre} value={nombre} />)}
                        </datalist>
                      </div>
                    )}

                    {error && <div className="alert alert-danger small py-2 mt-3 mb-0">{error}</div>}
                  </div>
                  <div className="modal-footer">
                    <button type="button" className="btn btn-outline-secondary" onClick={cerrarModal}>Cancelar</button>
                    <button type="submit" className="btn btn-primary" disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar'}</button>
                  </div>
                </form>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show" />
        </>
      )}

      {detalleCamara && (
        <>
          <NavModal
            onAnterior={indiceDetalleCamara > 0 ? () => moverDetalleCamara(-1) : null}
            onSiguiente={indiceDetalleCamara < camarasOrdenadas.length - 1 ? () => moverDetalleCamara(1) : null}
          />
          <div
            className="modal d-block"
            tabIndex="-1"
            role="dialog"
            onClick={(e) => { if (e.target === e.currentTarget) setDetalleCamara(null); }}
          >
            <div className="modal-dialog modal-dialog-centered" role="document" style={{ maxWidth: 750 }}>
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title h5">{detalleCamara.hostname}</h2>
                  <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setDetalleCamara(null)} />
                </div>
                <div className="modal-body">
                  <div className="camera-thumb camera-thumb-lg mb-3">
                    {detalleCamara.imagen_url ? (
                      <img src={urlFoto(detalleCamara.imagen_url)} alt={detalleCamara.hostname} />
                    ) : (
                      <svg width="64" height="64" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                        <rect x="3" y="7" width="15" height="12" rx="2" /><path d="M18 10l4-2v10l-4-2" />
                      </svg>
                    )}
                    {!colOculta('camaras', 'estado') && (
                      <span className={`badge ${ESTADO_BADGE[detalleCamara.estado] || 'text-bg-secondary'} camera-estado-badge`}>
                        {ESTADO_LABEL[detalleCamara.estado] || detalleCamara.estado}
                      </span>
                    )}
                  </div>

                  <dl className="mb-0" style={{ display: 'grid', gridTemplateColumns: 'max-content 1fr', columnGap: '1.5rem', rowGap: '0.5rem' }}>
                    {!colOculta('camaras', 'edificio') && (<><dt className="text-body-secondary fw-normal text-nowrap">Edificio</dt><dd className="mb-0">{detalleCamara.edificio}</dd></>)}
                    {!colOculta('camaras', 'piso') && (<><dt className="text-body-secondary fw-normal text-nowrap">Piso</dt><dd className="mb-0">{detalleCamara.piso}</dd></>)}
                    {!colOculta('camaras', 'area') && (<><dt className="text-body-secondary fw-normal text-nowrap">Area</dt><dd className="mb-0">{detalleCamara.area}</dd></>)}
                    {detalleCamara.ubicacion && (<><dt className="text-body-secondary fw-normal text-nowrap">Ubicacion</dt><dd className="mb-0">{detalleCamara.ubicacion}</dd></>)}
                    {!colOculta('camaras', 'descripcion') && detalleCamara.descripcion && (<><dt className="text-body-secondary fw-normal text-nowrap">Descripcion</dt><dd className="mb-0">{detalleCamara.descripcion}</dd></>)}
                    {!colOculta('camaras', 'marca') && detalleCamara.marca && (<><dt className="text-body-secondary fw-normal text-nowrap">Marca</dt><dd className="mb-0">{detalleCamara.marca}</dd></>)}
                    {detalleCamara.modelo && (<><dt className="text-body-secondary fw-normal text-nowrap">Modelo</dt><dd className="mb-0">{detalleCamara.modelo}</dd></>)}
                    {!colOculta('camaras', 'ip') && detalleCamara.ip && (<><dt className="text-body-secondary fw-normal text-nowrap">IP</dt><dd className="mb-0">{detalleCamara.ip}</dd></>)}
                    {!colOculta('camaras', 'mac') && detalleCamara.mac_address && (<><dt className="text-body-secondary fw-normal text-nowrap">MAC</dt><dd className="mb-0">{detalleCamara.mac_address}</dd></>)}
                    {detalleCamara.switch_conectado && (<><dt className="text-body-secondary fw-normal text-nowrap">Switch</dt><dd className="mb-0">{detalleCamara.switch_conectado}</dd></>)}
                    {!colOculta('camaras', 'usuario') && detalleCamara.usuario && (<><dt className="text-body-secondary fw-normal text-nowrap">Usuario</dt><dd className="mb-0">{detalleCamara.usuario}</dd></>)}
                    {!colOculta('camaras', 'contrasena') && detalleCamara.contrasena && (<><dt className="text-body-secondary fw-normal text-nowrap">Contrasena</dt><dd className="mb-0">{detalleCamara.contrasena}</dd></>)}
                    {!colOculta('camaras', 'nvr') && (<><dt className="text-body-secondary fw-normal text-nowrap">NVR</dt><dd className="mb-0">{detalleCamara.nvr || '—'}</dd></>)}
                    {detalleCamara.observaciones && (<><dt className="text-body-secondary fw-normal text-nowrap">Observaciones</dt><dd className="mb-0">{detalleCamara.observaciones}</dd></>)}
                  </dl>
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setDetalleCamara(null)}>Cerrar</button>
                  {puedeEditar && <button type="button" className="btn btn-primary" onClick={() => { const c = detalleCamara; setDetalleCamara(null); abrirModalCamara(c); }}>Editar</button>}
                </div>
              </div>
            </div>
          </div>
          <div className="modal-backdrop show" />
        </>
      )}

    </Layout>
  );
}
