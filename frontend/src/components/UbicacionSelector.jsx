import { useEffect, useState } from 'react';
import client from '../api/client';

// Edificio, piso y area son tres catalogos globales independientes (un piso
// como "3er Piso" no pertenece a un edificio puntual — ver Gestion en el
// panel CRUD), asi que los tres selects se cargan una sola vez y quedan
// siempre habilitados, sin cascada entre ellos.
export default function UbicacionSelector({ edificioId, pisoId, areaId, onChange, placeholderTodos = true, campos = ['edificio', 'piso', 'area'] }) {
  const [edificios, setEdificios] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [areas, setAreas] = useState([]);

  useEffect(() => {
    client.get('/ubicaciones/edificios').then((res) => setEdificios(res.data));
    client.get('/ubicaciones/pisos').then((res) => setPisos(res.data));
    client.get('/ubicaciones/areas').then((res) => setAreas(res.data));
  }, []);

  const placeholders = placeholderTodos
    ? { edificio: 'Todos los edificios', piso: 'Todos los pisos', area: 'Todas las areas' }
    : { edificio: 'Elegi un edificio...', piso: 'Elegi un piso...', area: 'Elegi un area...' };

  return (
    <div className="row g-3">
      {campos.includes('edificio') && (
        <div className="col-12 col-md-4">
          <label className="form-label fw-semibold">Edificio</label>
          <select
            className="form-select"
            value={edificioId || ''}
            onChange={(e) => onChange({ edificioId: e.target.value ? Number(e.target.value) : null, pisoId, areaId })}
          >
            <option value="">{placeholders.edificio}</option>
            {edificios.map((e) => <option key={e.id} value={e.id}>{e.nombre}</option>)}
          </select>
        </div>
      )}

      {campos.includes('piso') && (
        <div className="col-12 col-md-4">
          <label className="form-label fw-semibold">Piso</label>
          <select
            className="form-select"
            value={pisoId || ''}
            onChange={(e) => onChange({ edificioId, pisoId: e.target.value ? Number(e.target.value) : null, areaId })}
          >
            <option value="">{placeholders.piso}</option>
            {pisos.map((p) => <option key={p.id} value={p.id}>{p.nombre}</option>)}
          </select>
        </div>
      )}

      {campos.includes('area') && (
        <div className="col-12 col-md-4">
          <label className="form-label fw-semibold">Area</label>
          <select
            className="form-select"
            value={areaId || ''}
            onChange={(e) => onChange({ edificioId, pisoId, areaId: e.target.value ? Number(e.target.value) : null })}
          >
            <option value="">{placeholders.area}</option>
            {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
