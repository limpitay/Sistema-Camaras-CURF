import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';

const ROL_LABEL = {
  avanzado: 'Avanzado',
  sistemas_lectura: 'Sistemas (lectura)',
  direccion: 'Direccion',
  mando_medio: 'Mando medio',
};

function claveP(rol, panel) { return `${rol}:${panel}`; }
function claveC(rol, tabla, columna) { return `${rol}:${tabla}:${columna}`; }
function claveF(rol, tabla, filtro) { return `${rol}:${tabla}:${filtro}`; }

export default function RolesPermisos() {
  const [registro, setRegistro] = useState(null);
  const [rolActivo, setRolActivo] = useState(null);
  const [panelesOcultos, setPanelesOcultos] = useState(new Set());
  const [columnasOcultas, setColumnasOcultas] = useState(new Set());
  const [filtrosOcultos, setFiltrosOcultos] = useState(new Set());
  const [guardando, setGuardando] = useState(false);
  const [aviso, setAviso] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    client.get('/permisos').then((res) => {
      setRegistro(res.data);
      setRolActivo(res.data.roles[0]);
      setPanelesOcultos(new Set(res.data.ocultosPaneles.map((o) => claveP(o.rol, o.panel))));
      setColumnasOcultas(new Set(res.data.ocultosColumnas.map((o) => claveC(o.rol, o.tabla, o.columna))));
      setFiltrosOcultos(new Set(res.data.ocultosFiltros.map((o) => claveF(o.rol, o.tabla, o.filtro))));
    });
  }, []);

  const togglePanel = (rol, panel) => setPanelesOcultos((actual) => {
    const nuevo = new Set(actual);
    const k = claveP(rol, panel);
    if (nuevo.has(k)) nuevo.delete(k); else nuevo.add(k);
    return nuevo;
  });

  const toggleColumna = (rol, tabla, columna) => setColumnasOcultas((actual) => {
    const nuevo = new Set(actual);
    const k = claveC(rol, tabla, columna);
    if (nuevo.has(k)) nuevo.delete(k); else nuevo.add(k);
    return nuevo;
  });

  const toggleFiltro = (rol, tabla, filtro) => setFiltrosOcultos((actual) => {
    const nuevo = new Set(actual);
    const k = claveF(rol, tabla, filtro);
    if (nuevo.has(k)) nuevo.delete(k); else nuevo.add(k);
    return nuevo;
  });

  const guardar = async () => {
    setGuardando(true);
    setError('');
    setAviso('');
    try {
      const ocultosPaneles = [...panelesOcultos].map((k) => {
        const [rol, panel] = k.split(':');
        return { rol, panel };
      });
      const ocultosColumnas = [...columnasOcultas].map((k) => {
        const [rol, tabla, columna] = k.split(':');
        return { rol, tabla, columna };
      });
      const ocultosFiltros = [...filtrosOcultos].map((k) => {
        const [rol, tabla, filtro] = k.split(':');
        return { rol, tabla, filtro };
      });
      await client.put('/permisos', { ocultosPaneles, ocultosColumnas, ocultosFiltros });
      setAviso('Guardado. Se aplica para esos roles la proxima vez que carguen una pagina.');
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  if (!registro || !rolActivo) {
    return (
      <Layout>
        <h1 className="h4 fw-bold mb-1">Roles y permisos</h1>
        <p className="text-body-secondary">Cargando...</p>
      </Layout>
    );
  }

  // Las 5 pestanas de adentro de Recursos (recursos-camaras, recursos-nvrs...)
  // se listan anidadas bajo "Recursos", no como paneles sueltos mas — ver
  // permisosRegistro.js.
  const panelesDelRolTodos = registro.panelesPorRol[rolActivo] || [];
  const panelesDelRol = panelesDelRolTodos.filter((p) => !p.startsWith('recursos-'));
  const subPanelesRecursos = panelesDelRolTodos.filter((p) => p.startsWith('recursos-'));

  // ¿Este panel esta tildado ahora mismo para el rol activo? (en base al
  // estado local, no al guardado — asi Columnas/Filtros reaccionan al toque
  // cuando se tilda/destilda un panel, sin esperar a guardar).
  const panelActivo = (panel) => panelesDelRolTodos.includes(panel) && !panelesOcultos.has(claveP(rolActivo, panel));
  // Una tabla de Recursos (camaras/nvrs/edificios/pisos/areas) depende de su
  // propia pestana Y de que "Recursos" en si este prendido; Usuarios depende
  // solo del panel "usuarios" — ver TABLA_PANEL en permisosRegistro.js.
  const tablaAlcanzable = (tabla) => {
    const panel = registro.tablaPanel[tabla];
    if (!panel) return true;
    if (panel.startsWith('recursos-')) return panelActivo('recursos') && panelActivo(panel);
    return panelActivo(panel);
  };

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-1">Roles y permisos</h1>
      <p className="text-body-secondary mb-4">
        Que paneles del menu, que columnas y que filtros de cada tabla ve cada rol. Solo puede ocultar cosas
        — nunca dar acceso a algo que ese rol no tenia de entrada. Admin no aparece aca: siempre ve todo,
        para no poder autobloquearse esta misma pantalla.
      </p>

      <ul className="nav nav-tabs mb-3">
        {registro.roles.map((rol) => (
          <li className="nav-item" key={rol}>
            <button className={`nav-link ${rolActivo === rol ? 'active' : ''}`} onClick={() => setRolActivo(rol)}>
              {ROL_LABEL[rol] || rol}
            </button>
          </li>
        ))}
      </ul>

      {error && <div className="alert alert-danger py-2">{error}</div>}
      {aviso && !error && <div className="alert alert-success py-2">{aviso}</div>}

      <div className="row g-3">
        <div className="col-12 col-lg-4">
          <div className="card shadow-sm h-100">
            <div className="card-header fw-semibold">Paneles visibles</div>
            <div className="list-group list-group-flush">
              {panelesDelRol.map((panel) => {
                const visible = !panelesOcultos.has(claveP(rolActivo, panel));
                return (
                  <div key={panel}>
                    <label className="list-group-item d-flex align-items-center gap-2">
                      <input
                        type="checkbox"
                        className="form-check-input mt-0"
                        checked={visible}
                        onChange={() => togglePanel(rolActivo, panel)}
                      />
                      {registro.panelLabel[panel] || panel}
                    </label>
                    {panel === 'recursos' && subPanelesRecursos.length > 0 && (
                      <div className="ps-4 pb-2 d-flex flex-column gap-1">
                        {subPanelesRecursos.map((sub) => {
                          const subVisible = !panelesOcultos.has(claveP(rolActivo, sub));
                          return (
                            <label key={sub} className="d-flex align-items-center gap-2 small">
                              <input
                                type="checkbox"
                                className="form-check-input mt-0"
                                checked={subVisible}
                                onChange={() => togglePanel(rolActivo, sub)}
                              />
                              {registro.panelLabel[sub] || sub}
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
              {panelesDelRol.length === 0 && <div className="list-group-item text-body-secondary">Este rol no tiene paneles propios.</div>}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-4">
          <div className="card shadow-sm h-100">
            <div className="card-header fw-semibold">Columnas visibles por tabla</div>
            <div className="card-body d-flex flex-column gap-3" style={{ maxHeight: 520, overflowY: 'auto' }}>
              {Object.entries(registro.tablasColumnas).filter(([tabla]) => tablaAlcanzable(tabla)).map(([tabla, { label, columnas }]) => (
                <div key={tabla}>
                  <div className="fw-semibold small text-body-secondary mb-1">{label}</div>
                  <div className="d-flex flex-wrap gap-3">
                    {Object.entries(columnas).map(([columna, columnaLabel]) => {
                      const visible = !columnasOcultas.has(claveC(rolActivo, tabla, columna));
                      return (
                        <label key={columna} className="d-flex align-items-center gap-2 mb-0">
                          <input
                            type="checkbox"
                            className="form-check-input mt-0"
                            checked={visible}
                            onChange={() => toggleColumna(rolActivo, tabla, columna)}
                          />
                          <span className="small">{columnaLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(registro.tablasColumnas).filter((tabla) => tablaAlcanzable(tabla)).length === 0 && (
                <p className="text-body-secondary small mb-0">Ninguna tabla alcanzable con los paneles activados.</p>
              )}
            </div>
          </div>
        </div>

        <div className="col-12 col-lg-4">
          <div className="card shadow-sm h-100">
            <div className="card-header fw-semibold">Filtros visibles por tabla</div>
            <div className="card-body d-flex flex-column gap-3" style={{ maxHeight: 520, overflowY: 'auto' }}>
              {Object.entries(registro.tablasFiltros).filter(([tabla]) => tablaAlcanzable(tabla)).map(([tabla, { label, filtros }]) => (
                <div key={tabla}>
                  <div className="fw-semibold small text-body-secondary mb-1">{label}</div>
                  <div className="d-flex flex-wrap gap-3">
                    {Object.entries(filtros).map(([filtro, filtroLabel]) => {
                      const visible = !filtrosOcultos.has(claveF(rolActivo, tabla, filtro));
                      return (
                        <label key={filtro} className="d-flex align-items-center gap-2 mb-0">
                          <input
                            type="checkbox"
                            className="form-check-input mt-0"
                            checked={visible}
                            onChange={() => toggleFiltro(rolActivo, tabla, filtro)}
                          />
                          <span className="small">{filtroLabel}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              ))}
              {Object.keys(registro.tablasFiltros).filter((tabla) => tablaAlcanzable(tabla)).length === 0 && (
                <p className="text-body-secondary small mb-0">Ninguna tabla alcanzable con los paneles activados.</p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mt-3">
        <button className="btn btn-primary" onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : 'Guardar cambios'}</button>
      </div>
    </Layout>
  );
}
