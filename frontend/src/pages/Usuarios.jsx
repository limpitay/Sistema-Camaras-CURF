import { useEffect, useState } from 'react';
import client from '../api/client';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';

const ROLES_USUARIO = ['admin', 'avanzado', 'sistemas_lectura', 'direccion', 'mando_medio'];
const PASSWORD_MIN = 8;

// Sugerencia de nombre de usuario para login por contrasena: inicial del
// primer nombre + ultimo apellido, sin tildes/n (ej. "Luis Limpitay" →
// "llimpitay", "Daniela Vega" → "dvega"). Es solo una sugerencia editable,
// no se fuerza — un admin puede escribir cualquier otra cosa en el campo.
function sugerirUsuario(nombre) {
  // Quita marcas diacriticas (tildes, dieresis, la virgulilla de la n) filtrando
  // por rango de codigo en vez de un literal/escape unicode en el regex, que es
  // fragil de editar a mano sin corromper el archivo.
  const sinAcentos = Array.from((nombre || '').normalize('NFD'))
    .filter((ch) => { const codigo = ch.codePointAt(0); return codigo < 0x0300 || codigo > 0x036f; })
    .join('');
  const partes = sinAcentos.toLowerCase().replace(/[^a-z\s]/g, '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  if (partes.length === 1) return partes[0];
  return partes[0][0] + partes[partes.length - 1];
}

function coincideBusqueda(fila, q, campos) {
  if (!q.trim()) return true;
  const needle = q.trim().toLowerCase();
  return campos.some((campo) => (fila[campo] || '').toString().toLowerCase().includes(needle));
}

export default function Usuarios() {
  const { permisos } = useAuth();
  const colOculta = (columna) => !!permisos?.columnasOcultas?.usuarios?.includes(columna);
  const [usuarios, setUsuarios] = useState([]);
  const [busqueda, setBusqueda] = useState('');
  const [modal, setModal] = useState(null);
  const [error, setError] = useState('');
  const [guardando, setGuardando] = useState(false);

  const cargarUsuarios = () => client.get('/usuarios').then((res) => setUsuarios(res.data));
  useEffect(() => { cargarUsuarios(); }, []);

  const cerrarModal = () => { setModal(null); setError(''); };

  const abrirModal = (fila) => setModal({
    id: fila?.id ?? null,
    username: fila?.username ?? '',
    // Solo auto-completa el username a partir del nombre en alta nueva — al
    // editar uno existente no se toca lo que ya haya, aunque cambie el nombre.
    usernameAuto: !fila,
    nombre: fila?.nombre ?? '',
    rol: fila?.rol ?? 'mando_medio',
    activo: fila?.activo ?? true,
    password: '',
  });

  const guardar = async (e) => {
    e.preventDefault();
    setError('');
    if (modal.password && modal.password.length < PASSWORD_MIN) {
      setError(`La contrasena debe tener al menos ${PASSWORD_MIN} caracteres`);
      return;
    }
    setGuardando(true);
    try {
      if (modal.id) {
        const datos = { nombre: modal.nombre.trim(), username: modal.username.trim(), rol: modal.rol, activo: modal.activo };
        if (modal.password) datos.password = modal.password;
        await client.patch(`/usuarios/${modal.id}`, datos);
      } else {
        const datos = { username: modal.username.trim(), nombre: modal.nombre.trim(), rol: modal.rol };
        if (modal.password) datos.password = modal.password;
        await client.post('/usuarios', datos);
      }
      await cargarUsuarios();
      cerrarModal();
    } catch (err) {
      setError(err.response?.data?.error || 'No se pudo guardar');
    } finally {
      setGuardando(false);
    }
  };

  // Sin DELETE de usuarios (RNF-06, mismo criterio que camaras) — activar/
  // desactivar es la unica forma de dar de baja.
  const toggleActivo = async (u) => {
    try {
      await client.patch(`/usuarios/${u.id}`, { activo: !u.activo });
      await cargarUsuarios();
    } catch (err) {
      window.alert(err.response?.data?.error || 'No se pudo actualizar');
    }
  };

  const usuariosFiltrados = usuarios.filter((u) => coincideBusqueda(u, busqueda, ['username', 'nombre', 'rol']));

  return (
    <Layout>
      <h1 className="h4 fw-bold mb-1">Usuarios</h1>
      <p className="text-body-secondary mb-4">
        Altas y bajas de usuarios del panel, rol y login por contrasena (username + contrasena). No hay
        borrado de usuarios — dar de baja es desactivar, para no perder la autoria de solicitudes/accesos
        historicos.
      </p>

      <div className="card shadow-sm">
        <div className="card-header d-flex justify-content-between align-items-center">
          <span className="fw-semibold">Usuarios <span className="text-body-secondary fw-normal">({usuariosFiltrados.length} de {usuarios.length})</span></span>
          <button className="btn btn-primary btn-sm" onClick={() => abrirModal()}>+ Agregar</button>
        </div>
        <div className="card-body border-bottom">
          <label className="form-label fw-semibold">Buscar</label>
          <input className="form-control" placeholder="Nombre, usuario o rol..." value={busqueda} onChange={(e) => setBusqueda(e.target.value)} />
        </div>
        <div className="table-responsive">
          <table className="table table-hover align-middle mb-0">
            <thead className="table-light">
              <tr>
                {!colOculta('nombre') && <th>Nombre</th>}
                {!colOculta('username') && <th>Usuario</th>}
                {!colOculta('rol') && <th>Rol</th>}
                {!colOculta('password') && <th>Contrasena</th>}
                {!colOculta('estado') && <th>Estado</th>}
                <th></th>
              </tr>
            </thead>
            <tbody>
              {usuariosFiltrados.map((u) => (
                <tr key={u.id}>
                  {!colOculta('nombre') && <td>{u.nombre}</td>}
                  {!colOculta('username') && <td>{u.username}</td>}
                  {!colOculta('rol') && <td>{u.rol}</td>}
                  {!colOculta('password') && (
                    <td><span className={`badge ${u.tiene_password ? 'text-bg-success' : 'text-bg-secondary'}`}>{u.tiene_password ? 'Configurada' : 'Sin configurar'}</span></td>
                  )}
                  {!colOculta('estado') && (
                    <td><span className={`badge ${u.activo ? 'text-bg-success' : 'text-bg-secondary'}`}>{u.activo ? 'Activo' : 'Inactivo'}</span></td>
                  )}
                  <td className="text-end">
                    <button className="btn btn-sm btn-outline-secondary me-2" onClick={() => abrirModal(u)}>Editar</button>
                    <button className="btn btn-sm btn-outline-secondary" onClick={() => toggleActivo(u)}>{u.activo ? 'Desactivar' : 'Activar'}</button>
                  </td>
                </tr>
              ))}
              {usuariosFiltrados.length === 0 && (
                <tr><td colSpan={6} className="text-body-secondary">
                  {usuarios.length === 0 ? 'Todavia no hay usuarios cargados' : 'Ningun usuario coincide con la busqueda'}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {modal && (
        <>
          <div className="modal d-block" tabIndex="-1" role="dialog" onClick={(e) => { if (e.target === e.currentTarget) cerrarModal(); }}>
            <div className="modal-dialog modal-dialog-centered" role="document">
              <div className="modal-content">
                <form onSubmit={guardar}>
                  <div className="modal-header">
                    <h2 className="modal-title h5">{modal.id ? 'Editar' : 'Agregar'} usuario</h2>
                    <button type="button" className="btn-close" aria-label="Cerrar" onClick={cerrarModal} />
                  </div>
                  <div className="modal-body">
                    <div className="mb-2">
                      <label className="form-label">Nombre</label>
                      <input
                        className="form-control"
                        value={modal.nombre}
                        onChange={(e) => {
                          const nombre = e.target.value;
                          setModal((m) => ({ ...m, nombre, username: m.usernameAuto ? sugerirUsuario(nombre) : m.username }));
                        }}
                        required
                        autoFocus
                      />
                    </div>
                    <div className="mb-2">
                      <label className="form-label">Usuario (login)</label>
                      <input
                        className="form-control"
                        value={modal.username}
                        onChange={(e) => setModal((m) => ({ ...m, username: e.target.value, usernameAuto: false }))}
                        autoCapitalize="off"
                        autoCorrect="off"
                        required
                      />
                      <div className="form-text">Se sugiere a partir del nombre, editable. Puede ser un nombre corto (login por contrasena) o un email real (para codigo/Google, cuando esten habilitados).</div>
                    </div>
                    <div className="mb-2">
                      <label className="form-label">Rol</label>
                      <select className="form-select" value={modal.rol} onChange={(e) => setModal((m) => ({ ...m, rol: e.target.value }))}>
                        {ROLES_USUARIO.map((r) => <option key={r} value={r}>{r}</option>)}
                      </select>
                    </div>
                    {modal.id && (
                      <div className="form-check mb-2">
                        <input
                          type="checkbox"
                          className="form-check-input"
                          id="usuario-activo"
                          checked={modal.activo}
                          onChange={(e) => setModal((m) => ({ ...m, activo: e.target.checked }))}
                        />
                        <label className="form-check-label" htmlFor="usuario-activo">Activo</label>
                      </div>
                    )}
                    <div className="mb-1">
                      <label className="form-label">{modal.id ? 'Nueva contrasena' : 'Contrasena (opcional)'}</label>
                      <input
                        type="password"
                        className="form-control"
                        value={modal.password}
                        onChange={(e) => setModal((m) => ({ ...m, password: e.target.value }))}
                        autoComplete="new-password"
                        placeholder={modal.id ? 'Dejar vacio para no cambiarla' : 'Sin contrasena, entra por codigo o Google'}
                      />
                      <div className="form-text">Minimo {PASSWORD_MIN} caracteres si se carga.</div>
                    </div>

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
    </Layout>
  );
}
