import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';
import UbicacionSelector from '../components/UbicacionSelector';
import { useAuth } from '../context/AuthContext';

const ESTADOS = ['funcionando', 'a_reemplazar', 'nueva', 'dada_de_baja'];
const ESTADO_BADGE = {
  funcionando: 'bg-success',
  a_reemplazar: 'bg-warning text-dark',
  nueva: 'bg-info text-dark',
  dada_de_baja: 'bg-body-secondary text-body',
};
const CAMARA_VACIA = { hostname: '', descripcion: '', ip: '', mac_address: '', switch_conectado: '', observaciones: '', nvr: '' };

// RF-04/RF-05/RF-07: inventario completo, solo Admin puede crear/editar/dar
// de baja. Sistemas-lectura ve la misma tabla, sin controles de edición.
export default function InventarioAdmin() {
  const { user } = useAuth();
  const esAdmin = user?.rol === 'admin';

  const [camaras, setCamaras] = useState([]);
  const [filtroUbicacion, setFiltroUbicacion] = useState({ edificioId: null, pisoId: null, areaId: null });
  const [filtroEstado, setFiltroEstado] = useState('');

  const [nuevaUbicacion, setNuevaUbicacion] = useState({ edificioId: null, pisoId: null, areaId: null });
  const [nueva, setNueva] = useState(CAMARA_VACIA);
  const [imagenArchivo, setImagenArchivo] = useState(null);
  const [imagenUrl, setImagenUrl] = useState('');
  const [error, setError] = useState('');

  const cargar = () => {
    const params = {
      edificio_id: filtroUbicacion.edificioId || undefined,
      piso_id: filtroUbicacion.pisoId || undefined,
      area_id: filtroUbicacion.areaId || undefined,
      estado: filtroEstado || undefined,
    };
    client.get('/camaras', { params }).then((res) => setCamaras(res.data));
  };

  useEffect(cargar, [filtroUbicacion, filtroEstado]);

  const crearCamara = async (e) => {
    e.preventDefault();
    setError('');
    if (!nuevaUbicacion.areaId) {
      setError('Elegí (o creá) edificio, piso y área para la cámara');
      return;
    }
    try {
      const datos = new FormData();
      Object.entries(nueva).forEach(([campo, valor]) => datos.append(campo, valor));
      datos.append('area_id', nuevaUbicacion.areaId);
      if (imagenArchivo) datos.append('imagen', imagenArchivo);
      else if (imagenUrl) datos.append('imagen_url', imagenUrl);

      await client.post('/camaras', datos);
      setNueva(CAMARA_VACIA);
      setImagenArchivo(null);
      setImagenUrl('');
      cargar();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo crear la cámara');
    }
  };

  const cambiarEstado = async (id, estado) => {
    await client.patch(`/camaras/${id}/estado`, { estado });
    cargar();
  };

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-4">Inventario de cámaras</h1>

      <div className="card shadow-sm mb-4">
        <div className="card-body">
          <div className="row g-3 align-items-end">
            <div className="col-12 col-lg-9">
              <UbicacionSelector {...filtroUbicacion} onChange={setFiltroUbicacion} />
            </div>
            <div className="col-12 col-lg-3">
              <select className="form-select" value={filtroEstado} onChange={(e) => setFiltroEstado(e.target.value)}>
                <option value="">Todos los estados</option>
                {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>
        </div>
      </div>

      <div className="card shadow-sm">
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                <th>Foto</th><th>Hostname</th><th>Descripción</th><th>IP</th><th>MAC</th>
                <th>Edificio</th><th>Piso</th><th>Área</th>
                <th>Switch</th><th>NVR</th><th>Estado</th><th>Origen</th>{esAdmin && <th>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {camaras.map((c) => (
                <tr key={c.id}>
                  <td>
                    {c.imagen_url && (
                      <img src={c.imagen_url} alt={c.descripcion || c.hostname} style={{ width: 48, height: 48, objectFit: 'cover', borderRadius: 6 }} />
                    )}
                  </td>
                  <td>{c.hostname}</td><td>{c.descripcion}</td><td>{c.ip}</td><td>{c.mac_address}</td>
                  <td>{c.edificio}</td><td>{c.piso}</td><td>{c.area}</td>
                  <td>{c.switch_conectado}</td><td>{c.nvr}</td>
                  <td><span className={`badge ${ESTADO_BADGE[c.estado] || 'bg-secondary'}`}>{c.estado}</span></td>
                  <td>{c.origen}</td>
                  {esAdmin && (
                    <td>
                      <select className="form-select form-select-sm" value={c.estado} onChange={(e) => cambiarEstado(c.id, e.target.value)}>
                        {ESTADOS.map((e) => <option key={e} value={e}>{e}</option>)}
                      </select>
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {esAdmin && (
        <div className="card shadow-sm mt-4">
          <div className="card-body">
            <h2 className="h6 fw-bold mb-3">Nueva cámara</h2>
            <form onSubmit={crearCamara}>
              <UbicacionSelector {...nuevaUbicacion} onChange={setNuevaUbicacion} permitirCrear />

              <div className="row g-3 mt-1">
                {Object.keys(CAMARA_VACIA).map((campo) => (
                  <div className="col-12 col-md-3" key={campo}>
                    <input
                      className="form-control"
                      placeholder={campo}
                      value={nueva[campo]}
                      onChange={(e) => setNueva((n) => ({ ...n, [campo]: e.target.value }))}
                      required={campo === 'hostname'}
                    />
                  </div>
                ))}
              </div>

              <div className="row g-3 mt-1">
                <div className="col-12 col-md-4">
                  <label className="form-label small fw-semibold">Foto (jpg o png)</label>
                  <input
                    type="file"
                    accept="image/jpeg,image/png"
                    className="form-control"
                    onChange={(e) => setImagenArchivo(e.target.files[0] || null)}
                  />
                </div>
                <div className="col-12 col-md-4 d-flex align-items-end">
                  <div className="w-100">
                    <label className="form-label small fw-semibold">...o URL de una imagen ya hosteada</label>
                    <input
                      className="form-control"
                      placeholder="https://..."
                      value={imagenUrl}
                      onChange={(e) => setImagenUrl(e.target.value)}
                      disabled={!!imagenArchivo}
                    />
                  </div>
                </div>
              </div>

              {error && <div className="alert alert-danger small py-2 mt-3 mb-0">{error}</div>}
              <button type="submit" className="btn btn-primary mt-3">Crear cámara</button>
            </form>
          </div>
        </div>
      )}
    </Layout>
  );
}
