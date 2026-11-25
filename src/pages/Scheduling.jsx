import { useState } from 'react';
import { Calendar, Plus, Search, MapPin, AlertTriangle, ShieldAlert, X, ChevronRight, Check } from 'lucide-react';
import { useCinema } from '../context/CinemaContext';
import { branches, halls } from '../data/store';

const statusConfig = {
  draft:     { label: 'Borrador',   cls: 'badge-muted' },
  scheduled: { label: 'Programada', cls: 'badge-blue' },
  active:    { label: 'Activa',     cls: 'badge-green' },
  sold_out:  { label: 'Agotada',    cls: 'badge-red' },
  finished:  { label: 'Finalizada', cls: 'badge-muted' },
  cancelled: { label: 'Cancelada',  cls: 'badge-orange' },
};

const tabs = ['Calendario', 'Lista de Funciones'];
const WEEK_DAYS = ['Lun 15', 'Mar 16', 'Mié 17', 'Jue 18', 'Vie 19', 'Sáb 20', 'Dom 21'];
const HOURS = Array.from({ length: 13 }, (_, i) => `${i + 10}:00`);

// Wizard steps para nueva función (cinema-first)
const PASOS_FUNC = ['Seleccionar Cine', 'Seleccionar Película', 'Seleccionar Sala', 'Horario', 'Confirmar'];

export default function Scheduling() {
  const {
    activeScreenings, enabledMovies, activeHalls, activeAlerts,
    can, isAdminCentral, activeBranch, isGlobal,
    currentCinemaId, setCinema, isMovieInCinema, branches: allBranches,
  } = useCinema();

  const [activeTab, setActiveTab] = useState('Calendario');
  const [search, setSearch] = useState('');
  const [hallFilter, setHallFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [wizStep, setWizStep] = useState(1);
  const [newFunc, setNewFunc] = useState({ branchId: null, movieId: null, hallId: null, date: '', startTime: '', format: '2D', language: 'ES' });
  const [validationError, setValidationError] = useState('');

  const conflicts = activeAlerts.filter(a => a.type === 'conflict' || a.level === 'error');

  const filtered = activeScreenings.filter(s => {
    const title = enabledMovies.find(m => m.id === s.movieId)?.title?.toLowerCase() || '';
    const matchSearch = title.includes(search.toLowerCase());
    
    if (!hallFilter) return matchSearch;
    
    if (isGlobal) {
      return matchSearch && s.branchId.toString() === hallFilter;
    } else {
      return matchSearch && s.hallId.toString() === hallFilter;
    }
  });

  const openModal = () => {
    if (!can('create_screening')) return;
    const preselected = isGlobal ? null : currentCinemaId;
    setNewFunc({ branchId: preselected, movieId: null, hallId: null, date: '', startTime: '', format: '2D', language: 'ES' });
    setWizStep(isGlobal ? 1 : 2); // Si ya hay cine activo, saltar paso 1
    setValidationError('');
    setShowModal(true);
  };

  // Películas habilitadas en el cine seleccionado del wizard
  const moviesForSelectedBranch = newFunc.branchId
    ? enabledMovies.filter(m => isMovieInCinema(m.id, newFunc.branchId))
    : [];

  // Salas del cine seleccionado del wizard
  const hallsForSelectedBranch = newFunc.branchId
    ? halls.filter(h => h.branchId === newFunc.branchId && h.status === 'active')
    : [];

  const nextStep = () => {
    setValidationError('');
    // Validación crítica: la película debe estar habilitada en el cine
    if (wizStep === 2 && newFunc.movieId && newFunc.branchId) {
      if (!isMovieInCinema(newFunc.movieId, newFunc.branchId)) {
        setValidationError('Esta película no está habilitada en el cine seleccionado. El Admin Central debe asignarla primero.');
        return;
      }
    }
    setWizStep(s => s + 1);
  };

  const saveFunc = () => {
    // En producción se llamaría a la API. Aquí solo cerramos.
    setShowModal(false);
    alert('Función programada correctamente.');
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Programación de Funciones</h1>
          <p className="page-subtitle">
            {isGlobal ? 'Vista global — todos los cines' : `Funciones de ${activeBranch?.name}`}
          </p>
        </div>
        {can('create_screening') && (
          <button className="btn btn-primary" onClick={openModal}><Plus size={16} /> Programar Función</button>
        )}
      </div>

      <div className="tabs mb-6">
        {tabs.map(t => (
          <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t}
            {t === 'Conflictos' && conflicts.length > 0 && <span className="badge badge-red" style={{ marginLeft: 6 }}>{conflicts.length}</span>}
          </button>
        ))}
      </div>

      {/* ── CALENDARIO ── */}
      {activeTab === 'Calendario' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', padding: '14px 20px', borderBottom: '1px solid var(--border)', gap: 14, flexWrap: 'wrap' }}>
            <div className="search-bar" style={{ width: 200 }}>
              <Search size={15} color="var(--text-muted)" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar película..." />
            </div>
            
            {isGlobal && (
              <select className="select" value={hallFilter} onChange={e => setHallFilter(e.target.value)} style={{ width: 200 }}>
                <option value="">Todos los Cines</option>
                {allBranches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            )}

            {!isGlobal && (
              <select className="select" value={hallFilter} onChange={e => setHallFilter(e.target.value)} style={{ width: 200 }}>
                <option value="">Todas las Salas</option>
                {halls.filter(h => h.branchId === activeBranch?.id).map(h => <option key={h.id} value={h.id}>{h.name}</option>)}
              </select>
            )}
          </div>
          
          <div style={{ display: 'flex', overflowX: 'auto' }}>
            <div style={{ width: 60, borderRight: '1px solid var(--border)', flexShrink: 0 }}>
              <div style={{ height: 45, borderBottom: '1px solid var(--border)' }} />
              {HOURS.map(h => (
                <div key={h} style={{ height: 60, borderBottom: '1px solid var(--border-subtle)', fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', padding: '8px 8px 0 0' }}>{h}</div>
              ))}
            </div>
            {WEEK_DAYS.map((day, dIdx) => (
              <div key={day} style={{ flex: 1, minWidth: 140, borderRight: '1px solid var(--border-subtle)' }}>
                <div style={{ height: 45, display: 'flex', alignItems: 'center', justifyContent: 'center', borderBottom: '1px solid var(--border)', fontWeight: 700, fontSize: 13, background: 'var(--surface-2)' }}>{day}</div>
                <div style={{ position: 'relative', height: HOURS.length * 60 }}>
                  {HOURS.map((_, i) => <div key={i} style={{ position: 'absolute', top: i*60, left: 0, right: 0, height: 1, background: 'var(--border-subtle)' }} />)}
                  
                  {filtered.filter(s => s.id % 7 === dIdx).map((s, i) => {
                    const m = enabledMovies.find(x => x.id === s.movieId);
                    const b = allBranches.find(x => x.id === s.branchId);
                    const top = (parseInt(s.startTime.split(':')[0]) - 10) * 60;
                    return (
                      <div key={i} style={{ position: 'absolute', top, left: 4, right: 4, height: 110, background: 'var(--action-red-dim)', border: '1px solid var(--action-red)', borderRadius: 6, padding: 6, overflow: 'hidden', cursor: 'pointer' }}>
                        <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{m?.title.split(':')[0]}</div>
                        <div style={{ fontSize: 10, color: 'var(--action-red)', marginTop: 2 }}>{s.startTime}</div>
                        <div style={{ fontSize: 10, color: 'var(--text-secondary)' }}>
                          {isGlobal ? b?.name : halls.find(h=>h.id===s.hallId)?.name} · {s.format}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── LISTA ── */}
      {activeTab === 'Lista de Funciones' && (
        <>
          <div className="flex-between mb-4">
            <div className="search-bar" style={{ maxWidth: 360, flex: 1 }}>
              <Search size={15} color="var(--text-muted)" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar función..." />
            </div>
          </div>
          <div className="table-wrapper card" style={{ padding: 0 }}>
            <table className="table">
              <thead><tr><th>Película</th><th>Cine & Sala</th><th>Fecha y Hora</th><th>Formato</th><th>Asientos</th><th>Estado</th></tr></thead>
              <tbody>
                {filtered.map(s => {
                  const m = enabledMovies.find(x => x.id === s.movieId);
                  const h = halls.find(x => x.id === s.hallId);
                  const b = allBranches.find(x => x.id === s.branchId);
                  const cfg = statusConfig[s.status] || statusConfig.draft;
                  return (
                    <tr key={s.id}>
                      <td style={{ fontWeight: 600 }}>{m?.title}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <MapPin size={13} color="var(--text-muted)" />
                          <span style={{ cursor: 'pointer', color: 'var(--action-red)', fontWeight: 600 }} onClick={() => setCinema(b?.id)}>{b?.name}</span>
                          <span style={{ color: 'var(--text-muted)' }}>— {h?.name}</span>
                        </div>
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <Calendar size={13} color="var(--text-muted)" />
                          {s.date} <span style={{ fontWeight: 700, color: 'var(--text-primary)' }}>{s.startTime}</span>
                        </div>
                      </td>
                      <td><span className="badge badge-purple">{s.format}</span></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="progress" style={{ width: 60 }}>
                            <div className="progress-fill" style={{ width: `${(s.bookedSeats/s.totalSeats)*100}%`, background: 'var(--action-red)' }} />
                          </div>
                          <span style={{ fontSize: 11 }}>{s.bookedSeats}/{s.totalSeats}</span>
                        </div>
                      </td>
                      <td><span className={`badge ${cfg.cls}`}>{cfg.label}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}



      {/* ── Modal: Wizard Cinema-First ── */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">Programar Nueva Función</div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Paso {wizStep}/{PASOS_FUNC.length}: {PASOS_FUNC[wizStep - 1]}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            {/* Steps indicator */}
            <div style={{ display: 'flex', padding: '10px 20px', gap: 6, borderBottom: '1px solid var(--border)', background: 'var(--surface-2)', overflowX: 'auto' }}>
              {PASOS_FUNC.map((p, i) => (
                <div key={p} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, fontWeight: 600, color: wizStep === i+1 ? 'var(--action-red)' : wizStep > i+1 ? 'var(--emerald)' : 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${wizStep===i+1 ? 'var(--action-red)' : wizStep>i+1 ? 'var(--emerald)' : 'var(--border)'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 800, background: wizStep===i+1 ? 'var(--action-red-dim)' : '' }}>
                    {wizStep > i+1 ? <Check size={10} strokeWidth={4} /> : i+1}
                  </div>
                  {p}
                  {i < PASOS_FUNC.length - 1 && <span style={{ marginLeft: 4, color: 'var(--border)' }}>›</span>}
                </div>
              ))}
            </div>

            <div className="modal-body">
              {validationError && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--action-red-dim)', border: '1px solid var(--action-red)', borderRadius: 8, padding: '10px 14px', marginBottom: 14, fontSize: 13, color: 'var(--action-red)' }}>
                  <ShieldAlert size={16} /> {validationError}
                </div>
              )}

              {/* Paso 1: Seleccionar Cine */}
              {wizStep === 1 && (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>¿En qué cine se programará esta función?</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {allBranches.filter(b => b.status === 'active').map(b => (
                      <div key={b.id} onClick={() => setNewFunc(p => ({ ...p, branchId: b.id, movieId: null, hallId: null }))}
                        style={{ padding: '12px 16px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${newFunc.branchId===b.id ? 'var(--action-red)' : 'var(--border)'}`, background: newFunc.branchId===b.id ? 'var(--action-red-dim)' : 'var(--surface-2)', transition: 'all var(--transition)' }}>
                        <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{b.city} · {b.halls} salas</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Paso 2: Seleccionar Película (solo las habilitadas en ese cine) */}
              {wizStep === 2 && (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                    Películas habilitadas en <strong>{allBranches.find(b => b.id === newFunc.branchId)?.name}</strong>:
                  </p>
                  {moviesForSelectedBranch.length === 0 ? (
                    <div style={{ textAlign: 'center', padding: 24, color: 'var(--text-muted)', fontSize: 13 }}>
                      <p>No hay películas habilitadas en este cine.</p>
                      <p style={{ marginTop: 8, color: 'var(--intense-orange)' }}>El Admin Central debe asignar películas desde el Catálogo Global.</p>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                      {moviesForSelectedBranch.map(m => (
                        <div key={m.id} onClick={() => setNewFunc(p => ({ ...p, movieId: m.id }))}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${newFunc.movieId===m.id ? 'var(--action-red)' : 'var(--border)'}`, background: newFunc.movieId===m.id ? 'var(--action-red-dim)' : 'var(--surface-2)', transition: 'all var(--transition)' }}>
                          {m.poster && <img src={m.poster} alt={m.title} style={{ width: 36, height: 54, objectFit: 'cover', borderRadius: 6 }} />}
                          <div>
                            <div style={{ fontWeight: 700, fontSize: 14 }}>{m.title}</div>
                            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{m.genre} · {m.duration}min · {m.rating}</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Paso 3: Sala */}
              {wizStep === 3 && (
                <div>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>Selecciona la sala:</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {hallsForSelectedBranch.map(h => (
                      <div key={h.id} onClick={() => setNewFunc(p => ({ ...p, hallId: h.id }))}
                        style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderRadius: 10, cursor: 'pointer', border: `1px solid ${newFunc.hallId===h.id ? 'var(--action-red)' : 'var(--border)'}`, background: newFunc.hallId===h.id ? 'var(--action-red-dim)' : 'var(--surface-2)', transition: 'all var(--transition)' }}>
                        <div>
                          <div style={{ fontWeight: 700, fontSize: 14 }}>{h.name}</div>
                          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.type} · {h.capacity} asientos · ${h.priceBase}</div>
                        </div>
                        <span className="badge badge-blue">{h.type}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Paso 4: Horario */}
              {wizStep === 4 && (
                <div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">Fecha</label><input className="input" type="date" value={newFunc.date} onChange={e => setNewFunc(p => ({ ...p, date: e.target.value }))} /></div>
                    <div className="form-group"><label className="form-label">Hora de Inicio</label><input className="input" type="time" value={newFunc.startTime} onChange={e => setNewFunc(p => ({ ...p, startTime: e.target.value }))} /></div>
                  </div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">Formato</label>
                      <select className="select" style={{ width: '100%' }} value={newFunc.format} onChange={e => setNewFunc(p => ({ ...p, format: e.target.value }))}>
                        {['2D','3D'].map(f => <option key={f}>{f}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label className="form-label">Idioma</label>
                      <select className="select" style={{ width: '100%' }} value={newFunc.language} onChange={e => setNewFunc(p => ({ ...p, language: e.target.value }))}>
                        <option value="ES">Español</option><option value="EN">Inglés (Subtitulado)</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Paso 5: Confirmar */}
              {wizStep === 5 && (() => {
                const selBranch = allBranches.find(b => b.id === newFunc.branchId);
                const selMovie = moviesForSelectedBranch.find(m => m.id === newFunc.movieId);
                const selHall = hallsForSelectedBranch.find(h => h.id === newFunc.hallId);
                return (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 6 }}>Resumen de la función a programar:</p>
                    {[
                      ['Cine', selBranch?.name],
                      ['Película', selMovie?.title],
                      ['Sala', `${selHall?.name} (${selHall?.type})`],
                      ['Fecha', newFunc.date],
                      ['Hora', newFunc.startTime],
                      ['Formato', newFunc.format],
                      ['Idioma', newFunc.language],
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 13 }}>
                        <span style={{ color: 'var(--text-muted)' }}>{k}</span>
                        <span style={{ fontWeight: 700 }}>{v || '—'}</span>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>

            <div className="modal-footer">
              {wizStep > 1 && <button className="btn btn-secondary" onClick={() => setWizStep(s => s-1)}>Atrás</button>}
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              {wizStep < PASOS_FUNC.length
                ? <button className="btn btn-primary" onClick={nextStep} disabled={
                    (wizStep===1 && !newFunc.branchId) ||
                    (wizStep===2 && !newFunc.movieId) ||
                    (wizStep===3 && !newFunc.hallId) ||
                    (wizStep===4 && (!newFunc.date || !newFunc.startTime))
                  }>
                    Siguiente <ChevronRight size={14} />
                  </button>
                : <button className="btn btn-primary" onClick={saveFunc}>Confirmar y Programar</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
