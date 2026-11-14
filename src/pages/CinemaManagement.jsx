import { useEffect, useMemo, useRef, useState } from 'react';
import { Info } from 'lucide-react';
import { useCinema } from '../context/CinemaContext';
import { money } from '../utils/money';
import HallStatusControl from '../components/HallStatusControl';

const estadoColor = { active: 'badge-green', maintenance: 'badge-orange', inactive: 'badge-muted' };
const estadoLabel = { active: 'Activa', maintenance: 'En mantenimiento', inactive: 'Inactiva' };
const sedeLabel = { active: 'Activa', maintenance: 'En mantenimiento', inactive: 'Inactiva' };
const TABS = [['sedes', 'Sedes'], ['salas', 'Salas']];

// Solo lectura: sedes y salas reales de la API. Crear, editar, mapa de asientos y mantenimiento llegarán más adelante.
export default function CinemaManagement() {
  const { branches, halls, adminMovies, catalogLoading } = useCinema();
  const [tab, setTab] = useState('sedes');
  const [flash, setFlash] = useState('');
  const headingRef = useRef(null);
  useEffect(() => { document.title = 'Gestión de cines · Cinerama'; headingRef.current?.focus(); }, []);

  const hallsByBranch = useMemo(() => {
    const m = new Map();
    for (const h of halls) m.set(h.branchId, [...(m.get(h.branchId) ?? []), h]);
    return m;
  }, [halls]);
  const moviesByBranch = useMemo(() => {
    const m = new Map();
    for (const mv of adminMovies ?? []) {
      if (mv.status !== 'active') continue;
      for (const b of mv.branches) if (b.active) m.set(b.branchId, [...(m.get(b.branchId) ?? []), mv]);
    }
    return m;
  }, [adminMovies]);
  const branchName = (id) => branches.find((b) => b.id === id)?.name ?? `Sede ${id}`;

  return (
    <div className="cm-page">
      <div className="page-header">
        <div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>Gestión de cines</h1>
          <p className="page-subtitle">Sedes y salas de la red</p>
        </div>
      </div>

      <div className="demo-notice" role="note">
        <Info size={16} aria-hidden="true" />
        <p>
          <strong>Sedes y salas reales.</strong> Aquí todavía no se pueden crear ni editar; sí se puede poner una sala en mantenimiento
          (o quitarlo). El mapa de asientos llegará más adelante.
        </p>
      </div>

      <div className="tabs mb-6" role="group" aria-label="Ver">
        {TABS.map(([k, label]) => (
          <button key={k} type="button" className={`tab ${tab === k ? 'active' : ''}`} aria-pressed={tab === k} onClick={() => setTab(k)}>{label}</button>
        ))}
      </div>

      {catalogLoading && <p role="status">Cargando…</p>}
      <p className="mv-flash" role="status" hidden={!flash}>{flash}</p>

      {tab === 'sedes' && (
        <div className="table-wrapper card" style={{ padding: 0 }}>
          <table className="table">
            <caption className="sr-only">Sedes</caption>
            <thead>
              <tr><th scope="col">Sede</th><th scope="col">Ciudad y dirección</th><th scope="col">Estado</th><th scope="col">Salas</th><th scope="col">Películas en cartelera</th></tr>
            </thead>
            <tbody>
              {branches.map((b) => {
                const hs = hallsByBranch.get(b.id) ?? [];
                const ms = moviesByBranch.get(b.id) ?? [];
                return (
                  <tr key={b.id}>
                    <th scope="row" style={{ fontWeight: 700, textAlign: 'left' }}>{b.name}</th>
                    <td>{b.city}<div style={{ fontSize: 12 }}>{b.address}</div></td>
                    <td><span className={`badge ${estadoColor[b.status] ?? 'badge-muted'}`}>{sedeLabel[b.status] ?? b.status}</span></td>
                    <td>{hs.length}</td>
                    <td>{ms.length === 0 ? 'Ninguna' : ms.slice(0, 3).map((m) => m.title).join(', ') + (ms.length > 3 ? ` y ${ms.length - 3} más` : '')}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'salas' && (
        <div className="table-wrapper card" style={{ padding: 0 }}>
          <table className="table">
            <caption className="sr-only">Salas</caption>
            <thead>
              <tr><th scope="col">Sala</th><th scope="col">Sede</th><th scope="col">Tipo</th><th scope="col">Capacidad</th><th scope="col">Precio base</th><th scope="col">Estado</th><th scope="col">Mantenimiento</th></tr>
            </thead>
            <tbody>
              {halls.map((h) => (
                <tr key={h.id}>
                  <th scope="row" style={{ fontWeight: 700, textAlign: 'left' }}>{h.name}</th>
                  <td>{branchName(h.branchId)}</td>
                  <td><span className="badge badge-blue">{h.type}</span></td>
                  <td>{h.capacity} asientos</td>
                  <td>{money(h.priceBase)}</td>
                  <td><span className={`badge ${estadoColor[h.status] ?? 'badge-muted'}`}>{estadoLabel[h.status] ?? h.status}</span></td>
                  <td><HallStatusControl hall={h} onDone={setFlash} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
