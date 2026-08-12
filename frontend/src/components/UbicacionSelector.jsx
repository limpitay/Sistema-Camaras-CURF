import { useEffect, useState } from 'react';
import client from '../api/client';
import { AREAS_SUGERIDAS } from '../constants/areasSugeridas';

const ordenarPorNombre = (lista) => [...lista].sort((a, b) => a.nombre.localeCompare(b.nombre));
const ordenarPorOrden = (lista) => [...lista].sort((a, b) => a.orden - b.orden);

// Selects en cascada edificio -> piso -> área, con alta inline opcional
// (permitirCrear). La jerarquía normalizada reemplaza los campos de texto
// libre que tenía el borrador original de la spec — ver ESPECIFICACION.md.
export default function UbicacionSelector({ edificioId, pisoId, areaId, onChange, permitirCrear = false }) {
  const [edificios, setEdificios] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [areas, setAreas] = useState([]);
  const [nuevoEdificio, setNuevoEdificio] = useState('');
  const [nuevoPiso, setNuevoPiso] = useState('');
  const [nuevaArea, setNuevaArea] = useState('');

  useEffect(() => {
    client.get('/ubicaciones/edificios').then((res) => setEdificios(res.data));
  }, []);

  useEffect(() => {
    if (!edificioId) { setPisos([]); return; }
    client.get('/ubicaciones/pisos', { params: { edificio_id: edificioId } }).then((res) => setPisos(res.data));
  }, [edificioId]);

  useEffect(() => {
    if (!pisoId) { setAreas([]); return; }
    client.get('/ubicaciones/areas', { params: { piso_id: pisoId } }).then((res) => setAreas(res.data));
  }, [pisoId]);

  const crearEdificio = async () => {
    if (!nuevoEdificio.trim()) return;
    const res = await client.post('/ubicaciones/edificios', { nombre: nuevoEdificio.trim() });
    setEdificios((prev) => ordenarPorNombre([...prev.filter((e) => e.id !== res.data.id), res.data]));
    setNuevoEdificio('');
    onChange({ edificioId: res.data.id, pisoId: null, areaId: null });
  };

  const crearPiso = async () => {
    if (!nuevoPiso.trim() || !edificioId) return;
    const res = await client.post('/ubicaciones/pisos', { edificio_id: edificioId, nombre: nuevoPiso.trim() });
    setPisos((prev) => ordenarPorOrden([...prev.filter((p) => p.id !== res.data.id), res.data]));
    setNuevoPiso('');
    onChange({ edificioId, pisoId: res.data.id, areaId: null });
  };

  const crearArea = async () => {
    if (!nuevaArea.trim() || !pisoId) return;
    const res = await client.post('/ubicaciones/areas', { piso_id: pisoId, nombre: nuevaArea.trim() });
    setAreas((prev) => ordenarPorNombre([...prev.filter((a) => a.id !== res.data.id), res.data]));
    setNuevaArea('');
    onChange({ edificioId, pisoId, areaId: res.data.id });
  };

  return (
    <div className="row g-3">
      <div className="col-12 col-md-4">
        <select
          className="form-select"
          value={edificioId || ''}
          onChange={(e) => onChange({ edificioId: e.target.value ? Number(e.target.value) : null, pisoId: null, areaId: null })}
        >
          <option value="">Edificio...</option>
          {edificios.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
        </select>
        {permitirCrear && (
          <div className="input-group input-group-sm mt-1">
            <input className="form-control" placeholder="nuevo edificio" value={nuevoEdificio} onChange={(e) => setNuevoEdificio(e.target.value)} />
            <button type="button" className="btn btn-outline-secondary" onClick={crearEdificio}>+</button>
          </div>
        )}
      </div>

      <div className="col-12 col-md-4">
        <select
          className="form-select"
          value={pisoId || ''}
          disabled={!edificioId}
          onChange={(e) => onChange({ edificioId, pisoId: e.target.value ? Number(e.target.value) : null, areaId: null })}
        >
          <option value="">Piso...</option>
          {pisos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
        </select>
        {permitirCrear && (
          <div className="input-group input-group-sm mt-1">
            <input className="form-control" placeholder="nuevo piso" value={nuevoPiso} onChange={(e) => setNuevoPiso(e.target.value)} disabled={!edificioId} />
            <button type="button" className="btn btn-outline-secondary" onClick={crearPiso} disabled={!edificioId}>+</button>
          </div>
        )}
      </div>

      <div className="col-12 col-md-4">
        <select
          className="form-select"
          value={areaId || ''}
          disabled={!pisoId}
          onChange={(e) => onChange({ edificioId, pisoId, areaId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">Área...</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
        {permitirCrear && (
          <div className="input-group input-group-sm mt-1">
            <input
              className="form-control"
              placeholder="nueva área"
              value={nuevaArea}
              onChange={(e) => setNuevaArea(e.target.value)}
              disabled={!pisoId}
              list="areas-sugeridas"
            />
            <button type="button" className="btn btn-outline-secondary" onClick={crearArea} disabled={!pisoId}>+</button>
          </div>
        )}
      </div>

      {permitirCrear && (
        <datalist id="areas-sugeridas">
          {AREAS_SUGERIDAS.map((nombre) => <option key={nombre} value={nombre} />)}
        </datalist>
      )}
    </div>
  );
}
