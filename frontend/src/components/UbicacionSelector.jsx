import { useEffect, useState } from 'react';
import client from '../api/client';

// Edificio, piso y área son tres catálogos globales independientes (un piso
// como "3er Piso" no pertenece a un edificio puntual — ver Gestión en el
// panel CRUD), así que los tres selects se cargan una sola vez y quedan
// siempre habilitados, sin cascada entre ellos.
export default function UbicacionSelector({ edificioId, pisoId, areaId, onChange, placeholderTodos = true }) {
  const [edificios, setEdificios] = useState([]);
  const [pisos, setPisos] = useState([]);
  const [areas, setAreas] = useState([]);

  useEffect(() => {
    client.get('/ubicaciones/edificios').then((res) => setEdificios(res.data));
    client.get('/ubicaciones/pisos').then((res) => setPisos(res.data));
    client.get('/ubicaciones/areas').then((res) => setAreas(res.data));
  }, []);

  const placeholders = placeholderTodos
    ? { edificio: 'Todos los edificios', piso: 'Todos los pisos', area: 'Todas las áreas' }
    : { edificio: 'Elegí un edificio...', piso: 'Elegí un piso...', area: 'Elegí un área...' };

  return (
    <div className="row g-3">
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

      <div className="col-12 col-md-4">
        <label className="form-label fw-semibold">Área</label>
        <select
          className="form-select"
          value={areaId || ''}
          onChange={(e) => onChange({ edificioId, pisoId, areaId: e.target.value ? Number(e.target.value) : null })}
        >
          <option value="">{placeholders.area}</option>
          {areas.map((a) => <option key={a.id} value={a.id}>{a.nombre}</option>)}
        </select>
      </div>
    </div>
  );
}
