import { useState } from 'react';
import { Plus, Edit2, Trash2, MapPin, Wrench, X, CheckCircle, Film } from 'lucide-react';
import { branches as initialBranches, halls as initialHalls, screenings, movies } from '../data/store';
import { useNavigate } from 'react-router-dom';

const tiposSala = ['2D', '3D'];
const estadoColor = { active: 'badge-green', maintenance: 'badge-orange', inactive: 'badge-muted' };
const estadoLabel = { active: 'Activo', maintenance: 'Mantenimiento', inactive: 'Inactivo' };

const tabs = ['Sedes', 'Salas', 'Mapa de Asientos', 'Mantenimiento'];

// Lógica Cine → Películas: qué películas se muestran en una sala
const getPeliculasEnSala = (hallId) => {
  const funciones = screenings.filter(s => s.hallId === hallId && (s.status === 'active' || s.status === 'scheduled'));
  return funciones.map(f => {
    const pelicula = movies.find(m => m.id === f.movieId);
    return { pelicula, funcion: f };
  }).filter(x => x.pelicula);
};

// Películas en una sede (todas sus salas)
const getPeliculasEnSede = (branchId, halls) => {
  const salasDeEstaSede = halls.filter(h => h.branchId === branchId);
  const peliIds = new Set();
  salasDeEstaSede.forEach(h => {
    getPeliculasEnSala(h.id).forEach(({ pelicula }) => peliIds.add(pelicula.id));
  });
  return [...peliIds].map(id => movies.find(m => m.id === id)).filter(Boolean);
};

export default function CinemaManagement() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('Sedes');
  const [branches, setBranches] = useState(initialBranches);
  const [halls, setHalls] = useState(initialHalls);
  const [showBranchModal, setShowBranchModal] = useState(false);
  const [showHallModal, setShowHallModal] = useState(false);
  const [branchForm, setBranchForm] = useState({ name: '', city: '', address: '', status: 'active' });
  const [hallForm, setHallForm] = useState({ branchId: 1, name: '', type: '2D', capacity: '', status: 'active', priceBase: '' });
  
  const [selectedMapBranch, setSelectedMapBranch] = useState('');
  const [selectedMapHall, setSelectedMapHall] = useState('');
  const [selectedMapScreening, setSelectedMapScreening] = useState('');

  const guardarSede = () => {
    setBranches(p => [...p, { ...branchForm, id: Date.now(), halls: 0 }]);
    setShowBranchModal(false);
    setBranchForm({ name: '', city: '', address: '', status: 'active' });
  };
  const guardarSala = () => {
    setHalls(p => [...p, { ...hallForm, id: Date.now(), capacity: Number(hallForm.capacity), priceBase: Number(hallForm.priceBase) }]);
    setShowHallModal(false);
  };

  // Mapa de asientos
  const COLS = 10; const ROWS = 8;
  const [seatStates, setSeatStates] = useState(() => {
    const map = {};
    for (let r = 0; r < ROWS; r++)
      for (let c = 0; c < COLS; c++) {
        const key = `${r}-${c}`;
        map[key] = r === ROWS - 1 && (c === 0 || c === COLS - 1) ? 'disabled'
          : 'available';
      }
    return map;
  });
  const cycleSeat = (key) => {
    const order = ['available', 'blocked', 'disabled'];
    setSeatStates(p => ({ ...p, [key]: order[(order.indexOf(p[key]) + 1) % order.length] }));
  };
  const seatColor  = { available: 'var(--surface-2)', blocked: 'var(--action-red-dim)', disabled: 'var(--border)' };
  const seatBorder = { available: 'var(--border)', blocked: 'var(--action-red)', disabled: 'var(--surface-3)' };
  const leyendaAsientos = [
    ['available','var(--border)','Disponible'],
    ['blocked','var(--action-red)','Bloqueado'],
    ['disabled','var(--surface-3)','Discapacidad'],
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Gestión de Cines</h1>
          <p className="page-subtitle">Administra sedes, salas y configuración de asientos</p>
        </div>
        <div className="flex gap-8">
          {activeTab === 'Sedes' && <button className="btn btn-primary" onClick={() => setShowBranchModal(true)}><Plus size={16} /> Nueva Sede</button>}
          {activeTab === 'Salas' && <button className="btn btn-primary" onClick={() => setShowHallModal(true)}><Plus size={16} /> Nueva Sala</button>}
        </div>
      </div>

      <div className="tabs mb-6">
        {tabs.map(t => <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>{t}</button>)}
      </div>

      {/* ── SEDES ── */}
      {activeTab === 'Sedes' && (
        <div className="grid-2">
          {branches.map(b => {
            const peliculas = getPeliculasEnSede(b.id, halls);
            return (
              <div key={b.id} className="card" style={{ display: 'flex', flexDirection: 'column', gap: 0, padding: 0, overflow: 'hidden', borderRadius: 16 }}>
                {b.img && (
                  <div style={{ width: '100%', height: 160, overflow: 'hidden', position: 'relative' }}>
                    <img 
                      src={b.img} 
                      alt={b.name} 
                      style={{ width: '100%', height: '100%', objectFit: 'cover' }} 
                    />
                    <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: '40%', background: 'linear-gradient(to top, rgba(0,0,0,0.8), transparent)' }} />
                  </div>
                )}
                <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
                        <span style={{ fontWeight: 700, fontSize: 16, fontFamily: 'Poppins, sans-serif' }}>{b.name}</span>
                        <span className={`badge ${estadoColor[b.status]}`}>{estadoLabel[b.status]}</span>
                      </div>
                      <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>{b.address}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-secondary)', marginTop: 2 }}>{b.city} · {b.halls} salas</p>
                    </div>
                    <div className="flex gap-8">
                      <button className="icon-btn"><Edit2 size={14} /></button>
                      <button className="icon-btn danger" onClick={() => setBranches(p => p.filter(x => x.id !== b.id))}><Trash2 size={14} /></button>
                    </div>
                  </div>

                  {/* ── Lógica Cine → Películas ── */}
                  {peliculas.length > 0 && (
                    <div style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 8, fontWeight: 700 }}>
                        Películas en cartelera
                      </div>
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        {peliculas.map(p => (
                          <div
                            key={p.id}
                            onClick={() => navigate('/movies')}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 6,
                              padding: '4px 10px', borderRadius: 99,
                              background: 'var(--action-red-dim)', border: '1px solid rgba(229,9,20,0.2)',
                              cursor: 'pointer', fontSize: 11, color: 'var(--action-red)', fontWeight: 600,
                              transition: 'all var(--transition)',
                            }}
                          >
                            <Film size={10} /> {p.title.split(':')[0]}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── SALAS ── */}
      {activeTab === 'Salas' && (
        <div className="table-wrapper card" style={{ padding: 0 }}>
          <table className="table">
            <thead>
              <tr><th>Sala</th><th>Sede</th><th>Tipo</th><th>Capacidad</th><th>Precio Base</th><th>Películas activas</th><th>Estado</th><th>Acciones</th></tr>
            </thead>
            <tbody>
              {halls.map(h => {
                const branch = initialBranches.find(b => b.id === h.branchId);
                const peliculas = getPeliculasEnSala(h.id);
                return (
                  <tr key={h.id}>
                    <td style={{ fontWeight: 700 }}>{h.name}</td>
                    <td>{branch?.name || '—'}</td>
                    <td><span className="badge badge-blue">{h.type}</span></td>
                    <td>{h.capacity} asientos</td>
                    <td style={{ color: 'var(--cinema-gold)', fontWeight: 700 }}>${h.priceBase}</td>
                    <td>
                      {/* ── Cine → Películas en tabla ── */}
                      {peliculas.length > 0 ? (
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {peliculas.slice(0, 2).map(({ pelicula, funcion }) => (
                            <span
                              key={pelicula.id}
                              onClick={() => navigate('/movies')}
                              style={{ cursor: 'pointer', padding: '2px 8px', background: 'var(--action-red-dim)', color: 'var(--action-red)', borderRadius: 99, fontSize: 11, fontWeight: 600 }}
                            >
                              {pelicula.title.split(':')[0]} · {funcion.startTime}
                            </span>
                          ))}
                          {peliculas.length > 2 && <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{peliculas.length - 2}</span>}
                        </div>
                      ) : <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Sin programar</span>}
                    </td>
                    <td><span className={`badge ${estadoColor[h.status]}`}>{estadoLabel[h.status]}</span></td>
                    <td>
                      <div className="flex gap-8">
                        <button className="icon-btn" title="Mapa de asientos" onClick={() => { setSelectedMapBranch(h.branchId); setSelectedMapHall(h.id); setSelectedMapScreening(''); setActiveTab('Mapa de Asientos'); }}><MapPin size={14} /></button>
                        <button className="icon-btn"><Edit2 size={14} /></button>
                        <button className="icon-btn danger" onClick={() => setHalls(p => p.filter(x => x.id !== h.id))}><Trash2 size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── MAPA DE ASIENTOS ── */}
      {activeTab === 'Mapa de Asientos' && (
        <div>
          <div className="card mb-6" style={{ display: 'flex', gap: 16, alignItems: 'center', marginBottom: 24 }}>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" style={{ fontSize: 12 }}>1. Cine / Sede</label>
              <select className="select" style={{ width: '100%' }} value={selectedMapBranch} onChange={e => { setSelectedMapBranch(e.target.value); setSelectedMapHall(''); setSelectedMapScreening(''); }}>
                <option value="">Seleccionar Sede...</option>
                {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1 }}>
              <label className="form-label" style={{ fontSize: 12 }}>2. Sala Físcia</label>
              <select className="select" style={{ width: '100%' }} value={selectedMapHall} onChange={e => { setSelectedMapHall(e.target.value); setSelectedMapScreening(''); }} disabled={!selectedMapBranch}>
                <option value="">Seleccionar Sala...</option>
                {halls.filter(h => h.branchId === Number(selectedMapBranch)).map(h => <option key={h.id} value={h.id}>{h.name} — {h.type}</option>)}
              </select>
            </div>
            <div className="form-group" style={{ flex: 1.5 }}>
              <label className="form-label" style={{ fontSize: 12 }}>3. Película y Función</label>
              <select className="select" style={{ width: '100%' }} value={selectedMapScreening} onChange={e => setSelectedMapScreening(e.target.value)} disabled={!selectedMapHall}>
                <option value="">Seleccionar Función Específica...</option>
                {selectedMapHall && getPeliculasEnSala(Number(selectedMapHall)).map(({ pelicula, funcion }) => (
                  <option key={funcion.id} value={funcion.id}>{pelicula.title} — {funcion.date} a las {funcion.startTime}</option>
                ))}
              </select>
            </div>
          </div>

          {!selectedMapScreening ? (
            <div className="card empty-state" style={{ padding: '60px 20px' }}>
              <MapPin size={32} color="var(--text-muted)" style={{ marginBottom: 12 }} />
              <p style={{ fontSize: 14, color: 'var(--text-muted)' }}>Selecciona un cine, una sala y una función específica para ver o gestionar sus asientos.</p>
            </div>
          ) : (
            <div className="card" style={{ display: 'inline-block' }}>
              <div style={{ marginBottom: 20, textAlign: 'center' }}>
                <div style={{ height: 6, background: 'var(--action-red-dim)', border: '1px solid var(--action-red)', borderRadius: 4, margin: '0 auto 8px', width: '55%' }} />
                <p style={{ fontSize: 11, color: 'var(--action-red)', textTransform: 'uppercase', letterSpacing: 1.5, fontWeight: 700 }}>Pantalla</p>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 32px)`, gap: 6 }}>
                {Array.from({ length: ROWS }).map((_, r) =>
                  Array.from({ length: COLS }).map((_, c) => {
                    const k = `${r}-${c}`;
                    const state = seatStates[k];
                    return (
                      <button
                        key={k}
                        onClick={() => cycleSeat(k)}
                        title={`${String.fromCharCode(65 + r)}${c + 1} — ${state}`}
                        style={{
                          width: 32, height: 32, borderRadius: 6,
                          border: `2px solid ${seatBorder[state]}`,
                          background: seatColor[state], cursor: 'pointer',
                          transition: 'all 0.15s', fontSize: 9,
                          color: 'var(--text-muted)', fontFamily: 'Inter, sans-serif',
                        }}
                      >
                        {String.fromCharCode(65 + r)}{c + 1}
                      </button>
                    );
                  })
                )}
              </div>
              <div style={{ display: 'flex', gap: 16, marginTop: 16, flexWrap: 'wrap' }}>
                {leyendaAsientos.map(([s, c, l]) => (
                  <div key={s} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-muted)' }}>
                    <div style={{ width: 14, height: 14, borderRadius: 3, border: `2px solid ${c}`, background: seatColor[s] }} />
                    {l}
                  </div>
                ))}
              </div>
              <p style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 8 }}>Haz click en un asiento para cambiar su estado (Disponible, Bloqueado, Discapacidad)</p>
            </div>
          )}
        </div>
      )}

      {/* ── MANTENIMIENTO ── */}
      {activeTab === 'Mantenimiento' && (
        <div className="grid-2">
          {halls.map(h => (
            <div key={h.id} className="card flex-between">
              <div className="flex gap-12">
                <div style={{ width: 40, height: 40, background: h.status === 'maintenance' ? 'var(--intense-orange-dim)' : 'var(--emerald-dim)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {h.status === 'maintenance' ? <Wrench size={18} color="var(--intense-orange)" /> : <CheckCircle size={18} color="var(--emerald)" />}
                </div>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{h.name}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{h.type} · {h.capacity} asientos</div>
                  {h.status === 'maintenance' && (
                    <div style={{ fontSize: 11, color: 'var(--intense-orange)', marginTop: 2 }}>
                      {getPeliculasEnSala(h.id).length} función(es) afectada(s)
                    </div>
                  )}
                </div>
              </div>
              <div className="flex gap-8">
                <span className={`badge ${h.status === 'maintenance' ? 'badge-orange' : 'badge-green'}`}>{estadoLabel[h.status]}</span>
                <button
                  className="btn btn-secondary btn-sm"
                  onClick={() => setHalls(p => p.map(x => x.id === h.id ? { ...x, status: x.status === 'maintenance' ? 'active' : 'maintenance' } : x))}
                >
                  {h.status === 'maintenance' ? 'Restaurar' : 'Poner en Mantenimiento'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Sede */}
      {showBranchModal && (
        <div className="modal-overlay" onClick={() => setShowBranchModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Nueva Sede</div>
              <button className="icon-btn" onClick={() => setShowBranchModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-group"><label className="form-label">Nombre de la Sede</label><input className="input" value={branchForm.name} onChange={e => setBranchForm(p => ({ ...p, name: e.target.value }))} placeholder="Cinerama Centro" /></div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Ciudad</label><input className="input" value={branchForm.city} onChange={e => setBranchForm(p => ({ ...p, city: e.target.value }))} placeholder="Lima" /></div>
                <div className="form-group"><label className="form-label">Estado</label>
                  <select className="select" style={{ width: '100%' }} value={branchForm.status} onChange={e => setBranchForm(p => ({ ...p, status: e.target.value }))}>
                    <option value="active">Activo</option><option value="maintenance">Mantenimiento</option><option value="inactive">Inactivo</option>
                  </select>
                </div>
              </div>
              <div className="form-group"><label className="form-label">Dirección</label><input className="input" value={branchForm.address} onChange={e => setBranchForm(p => ({ ...p, address: e.target.value }))} placeholder="Dirección completa" /></div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowBranchModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarSede}>Guardar Sede</button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sala */}
      {showHallModal && (
        <div className="modal-overlay" onClick={() => setShowHallModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div className="modal-title">Nueva Sala</div>
              <button className="icon-btn" onClick={() => setShowHallModal(false)}><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="form-row">
                <div className="form-group"><label className="form-label">Nombre de Sala</label><input className="input" value={hallForm.name} onChange={e => setHallForm(p => ({ ...p, name: e.target.value }))} placeholder="Sala 1" /></div>
                <div className="form-group"><label className="form-label">Tipo</label>
                  <select className="select" style={{ width: '100%' }} value={hallForm.type} onChange={e => setHallForm(p => ({ ...p, type: e.target.value }))}>
                    {tiposSala.map(t => <option key={t}>{t}</option>)}
                  </select>
                </div>
              </div>
              <div className="form-row">
                <div className="form-group"><label className="form-label">Capacidad</label><input className="input" type="number" value={hallForm.capacity} onChange={e => setHallForm(p => ({ ...p, capacity: e.target.value }))} placeholder="150" /></div>
                <div className="form-group"><label className="form-label">Precio Base ($)</label><input className="input" type="number" value={hallForm.priceBase} onChange={e => setHallForm(p => ({ ...p, priceBase: e.target.value }))} placeholder="18" /></div>
              </div>
              <div className="form-group"><label className="form-label">Sede</label>
                <select className="select" style={{ width: '100%' }} value={hallForm.branchId} onChange={e => setHallForm(p => ({ ...p, branchId: Number(e.target.value) }))}>
                  {branches.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn btn-ghost" onClick={() => setShowHallModal(false)}>Cancelar</button>
              <button className="btn btn-primary" onClick={guardarSala}>Guardar Sala</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
