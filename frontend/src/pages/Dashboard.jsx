import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import Layout from '../components/Layout';

const SIN_MARCA = '__sin_marca__';
// Paleta categorica para el grafico de torta de "Camaras por marca" — azul y
// naranja, validados con scripts/validate_palette.js de la skill de dataviz
// (separacion CVD, piso de contraste y banda de luminosidad, los 3 en verde
// sobre el fondo oscuro del panel). El azul institucional del tema ($primary)
// no pasa el piso de contraste como marca de grafico chico, por eso son
// colores aparte, no --bs-primary.
const COLORES_MARCA = ['#3987e5', '#d95926', '#199e70', '#c98500'];

function contarPorMarca(lista) {
  const mapa = {};
  for (const c of lista) {
    const valor = c.marca || SIN_MARCA;
    mapa[valor] = (mapa[valor] || 0) + 1;
  }
  return Object.entries(mapa)
    .map(([valor, cantidad]) => ({ valor, marca: valor === SIN_MARCA ? 'Sin marca' : valor, cantidad }))
    .sort((a, b) => b.cantidad - a.cantidad);
}

export default function Dashboard() {
  const navigate = useNavigate();
  const [camaras, setCamaras] = useState([]);
  const [nvrs, setNvrs] = useState([]);
  const [nvrDetalle, setNvrDetalle] = useState(null);

  useEffect(() => {
    client.get('/camaras').then((res) => setCamaras(res.data));
    client.get('/nvrs').then((res) => setNvrs(res.data));
  }, []);

  // "graba"/"no graba" no es un campo propio de la camara — no es lo mismo
  // que activa/inactiva (eso es de alta/baja en el panel de accesos, no dice
  // si el equipo real esta grabando). Una camara sin NVR asignado no tiene
  // donde grabar, asi que se toma nvr_id como el indicador.
  const camarasGrabando = camaras.filter((c) => c.nvr_id);
  const camarasSinGrabar = camaras.filter((c) => !c.nvr_id);
  const camarasSinNvr = camarasSinGrabar;

  // Los tiles/grafico navegan a CRUD → Camaras ya filtrado (Crud.jsx lee
  // estos query params una vez al montar y los aplica como filtro).
  const irACamarasFiltradas = (params) => navigate(`/crud?tab=camaras${params ? `&${params}` : ''}`);

  const porMarca = contarPorMarca(camaras);

  // El color de cada marca sale de su nombre (orden alfabetico), no de su
  // lugar en el ranking de porMarca — si no, el dia que Hikvision supere a
  // Dahua en cantidad, las dos intercambiarian de color entre un refresh y
  // el otro, y eso rompe la asociacion color→marca que ya aprendio el ojo.
  const marcasParaColor = [...new Set(camaras.map((c) => c.marca || 'Sin marca'))].sort();
  const colorPorMarca = Object.fromEntries(marcasParaColor.map((m, i) => [m, COLORES_MARCA[i % COLORES_MARCA.length]]));

  const gradienteMarca = (() => {
    if (camaras.length === 0) return null;
    let acumulado = 0;
    const paradas = porMarca.map(({ marca, cantidad }) => {
      const desde = (acumulado / camaras.length) * 100;
      acumulado += cantidad;
      const hasta = (acumulado / camaras.length) * 100;
      return `${colorPorMarca[marca]} ${desde}% ${hasta}%`;
    });
    return `conic-gradient(${paradas.join(', ')})`;
  })();

  const camarasDelNvrDetalle = nvrDetalle
    ? camaras.filter((c) => (nvrDetalle.id === 'sin' ? !c.nvr_id : c.nvr_id === nvrDetalle.id))
    : [];
  const porMarcaDelNvrDetalle = contarPorMarca(camarasDelNvrDetalle);
  const maxPorMarcaDelNvrDetalle = porMarcaDelNvrDetalle[0]?.cantidad || 1;

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-4">Dashboard</h1>

      <div className="d-flex flex-column gap-3">
        <div className="row g-3">
          <div className="col-6 col-md-3">
            <button type="button" className="card shadow-sm h-100 w-100 text-start dashboard-tile" onClick={() => irACamarasFiltradas()}>
              <div className="card-body">
                <div className="text-body-secondary small">Total camaras</div>
                <div className="fs-3 fw-bold">{camaras.length}</div>
              </div>
            </button>
          </div>
          <div className="col-6 col-md-3">
            <button type="button" className="card shadow-sm h-100 w-100 text-start dashboard-tile" onClick={() => irACamarasFiltradas('nvrId=con')}>
              <div className="card-body">
                <div className="text-body-secondary small">Grabando</div>
                <div className="fs-3 fw-bold text-success">{camarasGrabando.length}</div>
              </div>
            </button>
          </div>
          <div className="col-6 col-md-3">
            <button type="button" className="card shadow-sm h-100 w-100 text-start dashboard-tile" onClick={() => irACamarasFiltradas('nvrId=sin')}>
              <div className="card-body">
                <div className="text-body-secondary small">No graban</div>
                <div className="fs-3 fw-bold text-body-secondary">{camarasSinGrabar.length}</div>
              </div>
            </button>
          </div>
          <div className="col-6 col-md-3">
            <button type="button" className="card shadow-sm h-100 w-100 text-start dashboard-tile" onClick={() => navigate('/crud?tab=nvrs')}>
              <div className="card-body">
                <div className="text-body-secondary small">NVRs</div>
                <div className="fs-3 fw-bold">{nvrs.length}</div>
              </div>
            </button>
          </div>
        </div>

        <div className="row g-3">
          <div className="col-12 col-lg-6">
            <div className="card shadow-sm h-100">
              <div className="card-header fw-semibold">
                Camaras por marca <span className="text-body-secondary fw-normal small">(clic para filtrar)</span>
              </div>
              <div className="card-body">
                {porMarca.length > 0 ? (
                  <div className="d-flex align-items-center gap-4 flex-wrap">
                    <div
                      role="img"
                      aria-label={`Camaras por marca: ${porMarca.map((m) => `${m.marca} ${m.cantidad}`).join(', ')}`}
                      style={{ width: 160, height: 160, borderRadius: '50%', background: gradienteMarca, flexShrink: 0 }}
                    />
                    <ul className="list-unstyled mb-0 flex-grow-1">
                      {porMarca.map(({ marca, valor, cantidad }) => (
                        <li key={valor} className="mb-2">
                          <button
                            type="button"
                            className="btn p-0 border-0 bg-transparent w-100 d-flex align-items-center gap-2 dashboard-marca"
                            onClick={() => irACamarasFiltradas(`marca=${encodeURIComponent(valor)}`)}
                          >
                            <span style={{ width: 14, height: 14, borderRadius: 3, background: colorPorMarca[marca], flexShrink: 0 }} />
                            <span>{marca}</span>
                            <span className="text-body-secondary ms-auto">{cantidad} ({Math.round((cantidad / camaras.length) * 100)}%)</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <p className="text-body-secondary mb-0">Todavia no hay camaras cargadas</p>
                )}
              </div>
            </div>
          </div>

          <div className="col-12 col-lg-6">
            <div className="card shadow-sm h-100">
              <div className="card-header fw-semibold">
                NVR <span className="text-body-secondary fw-normal small">(clic para ver detalle)</span>
              </div>
              <div className="list-group list-group-flush" style={{ maxHeight: 420, overflowY: 'auto' }}>
                {nvrs.map((n) => (
                  <button
                    key={n.id}
                    type="button"
                    className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                    onClick={() => setNvrDetalle(n)}
                  >
                    <span>{n.hostname}</span>
                    <span className="badge text-bg-secondary rounded-pill">{camaras.filter((c) => c.nvr_id === n.id).length}</span>
                  </button>
                ))}
                {camarasSinNvr.length > 0 && (
                  <button
                    type="button"
                    className="list-group-item list-group-item-action d-flex justify-content-between align-items-center"
                    onClick={() => setNvrDetalle({ id: 'sin', hostname: 'Sin NVR' })}
                  >
                    <span className="text-body-secondary fst-italic">Sin NVR</span>
                    <span className="badge text-bg-secondary rounded-pill">{camarasSinNvr.length}</span>
                  </button>
                )}
                {nvrs.length === 0 && camarasSinNvr.length === 0 && <div className="list-group-item text-body-secondary">Todavia no hay NVRs cargados</div>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {nvrDetalle && (
        <>
          <div
            className="modal d-block"
            tabIndex="-1"
            role="dialog"
            onClick={(e) => { if (e.target === e.currentTarget) setNvrDetalle(null); }}
          >
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <div className="modal-header">
                  <h2 className="modal-title h5">{nvrDetalle.hostname}</h2>
                  <button type="button" className="btn-close" aria-label="Cerrar" onClick={() => setNvrDetalle(null)} />
                </div>
                <div className="modal-body">
                  <div className="mb-3">
                    <span className="text-body-secondary">Camaras totales: </span>
                    <span className="fw-semibold">{camarasDelNvrDetalle.length}</span>
                  </div>
                  {porMarcaDelNvrDetalle.map(({ marca, cantidad }) => (
                    <div key={marca} className="mb-2">
                      <div className="d-flex justify-content-between small mb-1">
                        <span>{marca}</span>
                        <span className="text-body-secondary">{cantidad}</span>
                      </div>
                      <div className="progress" role="progressbar" aria-label={marca} aria-valuenow={cantidad} aria-valuemin={0} aria-valuemax={maxPorMarcaDelNvrDetalle} style={{ height: 8 }}>
                        <div className="progress-bar" style={{ width: `${(cantidad / maxPorMarcaDelNvrDetalle) * 100}%` }} />
                      </div>
                    </div>
                  ))}
                  {porMarcaDelNvrDetalle.length === 0 && <p className="text-body-secondary mb-0">Este NVR todavia no tiene camaras asignadas</p>}
                </div>
                <div className="modal-footer">
                  <button type="button" className="btn btn-outline-secondary" onClick={() => setNvrDetalle(null)}>Cerrar</button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={camarasDelNvrDetalle.length === 0}
                    onClick={() => irACamarasFiltradas(`nvrId=${nvrDetalle.id === 'sin' ? 'sin' : String(nvrDetalle.id)}`)}
                  >
                    Ver camaras
                  </button>
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
