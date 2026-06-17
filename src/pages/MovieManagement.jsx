import { useState } from 'react';
import {
  Plus, Search, Edit2, Trash2, Star, Eye, Archive, X,
  ChevronRight, CalendarDays, ShieldAlert, CheckSquare, Square, Check, AlertTriangle
} from 'lucide-react';
import { movies as storeMovies, movieCinema as storeMC, formats } from '../data/store';
import { useCinema } from '../context/CinemaContext';
import { useNavigate } from 'react-router-dom';
import './MovieManagement.css';

const statusConfig = {
  active:   { label: 'En Cartelera', cls: 'badge-green' },
  upcoming: { label: 'Próximamente', cls: 'badge-blue' },
  archived: { label: 'Archivada',    cls: 'badge-muted' },
  draft:    { label: 'Borrador',     cls: 'badge-muted' },
};
const tabsAdmin = ['Todas', 'En Cartelera', 'Próximamente', 'Destacadas', 'Archivadas'];
const tabsLocal = ['Habilitadas', 'En Cartelera', 'Próximamente'];
const MODULOS = ['Info y Multimedia', 'Clasificación y Formatos', 'Cines y Fechas', 'Publicación y Estado'];
const EMPTY = { title:'', genre:'Sci-Fi', duration:'', rating:'PG-13', status:'draft', format:[], director:'', language:'ES', poster:'', synopsis:'', featured:false, releaseDate:'', endDate:'', assignedBranches:[] };

export default function MovieManagement() {
  const navigate = useNavigate();
  const { isAdminCentral, can, enabledMovies, branches, currentCinemaId, isGlobal, isMovieInCinema, activeBranch } = useCinema();

  const [movies, setMovies]       = useState(storeMovies);
  const [movieCinema, setMovieCinema] = useState(storeMC);
  const [activeTab, setActiveTab] = useState(isAdminCentral ? 'Todas' : 'Habilitadas');
  const [search, setSearch]       = useState('');
  const [genreFilter, setGenreFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing]     = useState(null);
  const [form, setForm]           = useState(EMPTY);
  const [step, setStep]           = useState(1);

  const tabs = isAdminCentral ? tabsAdmin : tabsLocal;

  // Películas visibles según rol + tab
  const base = isAdminCentral ? movies : enabledMovies;
  const filtered = base.filter(m => {
    const s = m.title.toLowerCase().includes(search.toLowerCase());
    const g = !genreFilter || m.genre === genreFilter;
    const t = activeTab === 'Todas' || activeTab === 'Habilitadas' ? true
      : activeTab === 'En Cartelera' ? m.status === 'active'
      : activeTab === 'Próximamente' ? m.status === 'upcoming'
      : activeTab === 'Destacadas'   ? m.featured
      : m.status === 'archived';
    return s && g && t;
  });

  const openCreate = () => {
    if (!can('create_movie')) return;
    setEditing(null); setForm(EMPTY); setStep(1); setShowModal(true);
  };
  const openEdit = (m) => {
    if (!can('edit_movie')) return;
    const assigned = movieCinema.filter(mc => mc.movieId === m.id).map(mc => mc.branchId);
    setEditing(m.id); setForm({ ...m, assignedBranches: assigned }); setStep(1); setShowModal(true);
  };
  const save = () => {
    if (editing) {
      setMovies(p => p.map(m => m.id === editing ? { ...m, ...form } : m));
      // Sync movieCinema assignments
      setMovieCinema(p => {
        const filtered = p.filter(mc => mc.movieId !== editing);
        const news = form.assignedBranches.map((bid, i) => ({
          id: Date.now() + i, movieId: editing, branchId: bid,
          activa: true, fechaInicio: form.releaseDate, fechaFin: form.endDate, formatos: form.format, precioBase: 0,
        }));
        return [...filtered, ...news];
      });
    } else {
      const newId = Date.now();
      setMovies(p => [...p, { ...form, id: newId }]);
      setMovieCinema(p => [
        ...p,
        ...form.assignedBranches.map((bid, i) => ({
          id: Date.now() + i + 1, movieId: newId, branchId: bid,
          activa: true, fechaInicio: form.releaseDate, fechaFin: form.endDate, formatos: form.format, precioBase: 0,
        })),
      ]);
    }
    setShowModal(false);
  };
  const del    = (id) => can('delete_movie') && setMovies(p => p.filter(m => m.id !== id));
  const star   = (id) => can('edit_movie')   && setMovies(p => p.map(m => m.id === id ? { ...m, featured: !m.featured } : m));
  const archive = (id) => can('edit_movie')  && setMovies(p => p.map(m => m.id === id ? { ...m, status: 'archived' } : m));
  const toggleFmt = (f) => setForm(p => ({ ...p, format: p.format.includes(f) ? p.format.filter(x => x !== f) : [...p.format, f] }));
  const toggleBranch = (bid) => setForm(p => ({
    ...p,
    assignedBranches: p.assignedBranches.includes(bid)
      ? p.assignedBranches.filter(x => x !== bid)
      : [...p.assignedBranches, bid],
  }));

  // Cines donde está habilitada una película
  const getCinesDeMovie = (movieId) =>
    movieCinema.filter(mc => mc.movieId === movieId && mc.activa)
      .map(mc => branches.find(b => b.id === mc.branchId))
      .filter(Boolean);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {isAdminCentral ? 'Catálogo Global de Películas' : `Películas — ${activeBranch?.name}`}
          </h1>
          <p className="page-subtitle">
            {isAdminCentral
              ? 'Crea, gestiona y asigna películas a los cines de la red'
              : 'Películas habilitadas para este cine'}
          </p>
        </div>
        {can('create_movie') && (
          <button className="btn btn-primary" onClick={openCreate} id="add-movie-btn">
            <Plus size={16} /> Nueva Película
          </button>
        )}
      </div>

      {/* Permission guard para Admin Local */}
      {!isAdminCentral && (
        <div className="perm-notice">
          <ShieldAlert size={14} />
          <span>Vista de solo lectura. Para crear o editar películas del catálogo global, contacta al <strong>Admin Central</strong>.</span>
        </div>
      )}

      <div className="flex-between mb-6">
        <div className="search-bar" style={{ flex: 1, maxWidth: 380 }}>
          <Search size={15} color="var(--text-muted)" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar películas..." />
        </div>
        <div style={{ display: 'flex', gap: 12, marginLeft: 16 }}>
          <select
            className="select"
            value={activeTab}
            onChange={e => setActiveTab(e.target.value)}
            style={{ minWidth: 160 }}
          >
            {tabs.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>

          <select
            className="select"
            value={genreFilter}
            onChange={e => setGenreFilter(e.target.value)}
            style={{ minWidth: 160 }}
          >
            <option value="">Todos los géneros</option>
            {['Acción','Sci-Fi','Drama','Comedia','Terror'].map(g => (
              <option key={g} value={g}>{g}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Movie Grid */}
      <div className="movie-grid">
        {filtered.map(m => {
          const s = statusConfig[m.status] || statusConfig.draft;
          const cines = getCinesDeMovie(m.id);
          return (
            <div key={m.id} className="movie-card card">
              <div className="movie-poster">
                {m.poster
                  ? <img src={m.poster} alt={m.title} />
                  : <div className="movie-poster-placeholder"><Eye size={24} color="var(--text-muted)" /></div>}
                <span className={`badge ${s.cls} movie-status-badge`}>{s.label}</span>
                {m.featured && <span className="movie-featured-badge"><Star size={10} fill="currentColor" /> Destacada</span>}
              </div>
              <div className="movie-info">
                <div className="movie-title">{m.title}</div>
                <div className="movie-meta">
                  <span className="tag">{m.genre}</span>
                  <span className="tag">{m.rating}</span>
                  <span className="tag">{m.duration}min</span>
                </div>
                <div className="movie-formats">
                  {m.format.map(f => <span key={f} className="format-badge">{f}</span>)}
                </div>

                {/* ── Película → Cines (Admin Central) ── */}
                {isAdminCentral && cines.length > 0 && (
                  <div className="movie-cines">
                    <div style={{ fontSize: 10, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.6px', marginBottom: 5, fontWeight: 700 }}>
                      En {cines.length} cine{cines.length > 1 ? 's' : ''}
                    </div>
                    {cines.slice(0, 2).map((b, i) => (
                      <div key={i} className="movie-cine-chip" onClick={() => navigate('/cinema')}>
                        <span className="movie-cine-dot" />
                        <span>{b.name}</span>
                      </div>
                    ))}
                    {cines.length > 2 && <div style={{ fontSize: 10, color: 'var(--text-muted)', paddingLeft: 12 }}>+{cines.length - 2} más</div>}
                  </div>
                )}
                {isAdminCentral && cines.length === 0 && m.status !== 'archived' && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--intense-orange)', background: 'var(--intense-orange-dim)', borderRadius: 6, padding: '4px 8px', marginBottom: 8 }}>
                    <AlertTriangle size={12} /> Sin cine asignado
                  </div>
                )}

                <div className="movie-actions">
                  {can('edit_movie') && <button className="icon-btn" onClick={() => openEdit(m)} title="Editar"><Edit2 size={14} /></button>}
                  {can('edit_movie') && <button className="icon-btn" onClick={() => star(m.id)} title="Destacar">
                    <Star size={14} fill={m.featured ? 'var(--cinema-gold)' : 'none'} color={m.featured ? 'var(--cinema-gold)' : 'var(--text-muted)'} />
                  </button>}
                  <button className="icon-btn" title="Ver funciones" onClick={() => navigate('/scheduling')} style={{ color: 'var(--electric-blue)' }}>
                    <CalendarDays size={14} />
                  </button>
                  {can('edit_movie')   && <button className="icon-btn" onClick={() => archive(m.id)} title="Archivar"><Archive size={14} /></button>}
                  {can('delete_movie') && <button className="icon-btn danger" onClick={() => del(m.id)} title="Eliminar"><Trash2 size={14} /></button>}
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <div style={{ gridColumn: '1/-1' }} className="empty-state">
            <Eye size={32} />
            <p>No se encontraron películas</p>
          </div>
        )}
      </div>

      {/* Modal Wizard */}
      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal modal-lg" onClick={e => e.stopPropagation()}>
            <div className="modal-header">
              <div>
                <div className="modal-title">{editing ? 'Editar Película' : 'Nueva Película'}</div>
                <div className="text-muted" style={{ fontSize: 12, marginTop: 2 }}>
                  Módulo {step} de {MODULOS.length}: {MODULOS[step - 1]}
                </div>
              </div>
              <button className="icon-btn" onClick={() => setShowModal(false)}><X size={16} /></button>
            </div>

            <div style={{ display: 'flex', gap: 8, padding: '16px 24px', borderBottom: '1px solid var(--border)', overflowX: 'auto', background: 'var(--surface-1)' }}>
              {MODULOS.map((m, i) => (
                <button
                  key={m}
                  onClick={() => setStep(i + 1)}
                  style={{
                    padding: '8px 16px', borderRadius: 99, border: 'none', cursor: 'pointer',
                    background: step === i + 1 ? 'var(--action-red)' : 'var(--surface-2)',
                    color: step === i + 1 ? 'white' : 'var(--text-muted)',
                    fontWeight: 600, fontSize: 13, whiteSpace: 'nowrap', transition: 'all 0.2s'
                  }}
                >
                  {i + 1}. {m}
                </button>
              ))}
            </div>

            <div className="modal-body">
              {step === 1 && (
                <>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">Título</label><input className="input" value={form.title} onChange={e => setForm(p=>({...p,title:e.target.value}))} placeholder="Título de la película" /></div>
                    <div className="form-group"><label className="form-label">Director</label><input className="input" value={form.director} onChange={e => setForm(p=>({...p,director:e.target.value}))} placeholder="Nombre del director" /></div>
                  </div>
                  <div className="form-group"><label className="form-label">Sinopsis</label><textarea className="input" rows={3} value={form.synopsis} onChange={e => setForm(p=>({...p,synopsis:e.target.value}))} style={{ resize:'vertical' }} /></div>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">Duración (min)</label><input className="input" type="number" value={form.duration} onChange={e => setForm(p=>({...p,duration:e.target.value}))} /></div>
                    <div className="form-group"><label className="form-label">Idioma</label>
                      <select className="select" style={{width:'100%'}} value={form.language} onChange={e => setForm(p=>({...p,language:e.target.value}))}>
                        <option value="ES">Español</option><option value="EN">Inglés</option>
                      </select>
                    </div>
                  </div>
                  <div className="form-group"><label className="form-label">URL del Póster</label>
                    <input className="input" value={form.poster} onChange={e => setForm(p=>({...p,poster:e.target.value}))} placeholder="https://..." />
                    {form.poster && <img src={form.poster} alt="preview" style={{ width: 100, borderRadius: 8, marginTop: 10 }} />}
                  </div>
                </>
              )}
              {step === 2 && (
                <>
                  <div className="form-row">
                    <div className="form-group"><label className="form-label">Género</label>
                      <select className="select" style={{width:'100%'}} value={form.genre} onChange={e => setForm(p=>({...p,genre:e.target.value}))}>
                        {['Acción','Aventura','Comedia','Drama','Terror','Sci-Fi','Thriller','Animación','Documental'].map(g=><option key={g}>{g}</option>)}
                      </select>
                    </div>
                    <div className="form-group"><label className="form-label">Clasificación</label>
                      <select className="select" style={{width:'100%'}} value={form.rating} onChange={e => setForm(p=>({...p,rating:e.target.value}))}>
                        {['G','PG','PG-13','R','NC-17'].map(r=><option key={r}>{r}</option>)}
                      </select>
                    </div>
                  </div>
                  <div className="form-group" style={{ marginTop: 16 }}><label className="form-label">Formatos Disponibles</label>
                    <div className="format-picker">
                      {formats.map(f => (
                        <button key={f} className={`format-pick-btn ${form.format.includes(f)?'selected':''}`} onClick={() => toggleFmt(f)}>{f}</button>
                      ))}
                    </div>
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <div className="form-row" style={{ marginBottom: 16 }}>
                    <div className="form-group"><label className="form-label">Fecha de Estreno</label><input className="input" type="date" value={form.releaseDate} onChange={e => setForm(p=>({...p,releaseDate:e.target.value}))} /></div>
                    <div className="form-group"><label className="form-label">Fecha de Cierre</label><input className="input" type="date" value={form.endDate} onChange={e => setForm(p=>({...p,endDate:e.target.value}))} /></div>
                  </div>
                  <div>
                    <label className="form-label">Cines Asignados</label>
                    <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 14 }}>
                      Selecciona los cines donde esta película estará disponible.
                    </p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {branches.map(b => {
                        const sel = form.assignedBranches.includes(b.id);
                        return (
                          <div
                            key={b.id}
                            onClick={() => toggleBranch(b.id)}
                            style={{
                              display: 'flex', alignItems: 'center', gap: 12,
                              padding: '12px 16px', borderRadius: 10, cursor: 'pointer',
                              border: `1px solid ${sel ? 'var(--action-red)' : 'var(--border)'}`,
                              background: sel ? 'var(--action-red-dim)' : 'var(--surface-2)',
                              transition: 'all var(--transition)',
                            }}
                          >
                            {sel ? <CheckSquare size={16} color="var(--action-red)" /> : <Square size={16} color="var(--text-muted)" />}
                            <div style={{ flex: 1 }}>
                              <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</div>
                              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{b.city} · {b.halls} salas</div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}
              {step === 4 && (
                <>
                  <div className="form-group"><label className="form-label">Estado</label>
                    <select className="select" style={{width:'100%'}} value={form.status} onChange={e => setForm(p=>({...p,status:e.target.value}))}>
                      {Object.entries(statusConfig).map(([k,v]) => <option key={k} value={k}>{v.label}</option>)}
                    </select>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 8 }}>El estado puede cambiar automáticamente si la fecha actual no coincide con la fecha de estreno (p. ej. a Próximamente).</p>
                  </div>
                  <label style={{ display:'flex', alignItems:'center', gap: 10, cursor:'pointer', marginTop: 16 }}>
                    <input type="checkbox" checked={form.featured} onChange={e => setForm(p=>({...p,featured:e.target.checked}))} />
                    <span style={{ fontSize: 14 }}>Marcar como Destacada</span>
                  </label>
                  <div style={{ marginTop: 24, padding: 14, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                    <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>Resumen de publicación</p>
                    <p style={{ fontSize: 13 }}><strong>{form.assignedBranches.length}</strong> cine(s) seleccionado(s)</p>
                    {form.assignedBranches.map(bid => {
                      const b = branches.find(x => x.id === bid);
                      return <div key={bid} style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 12, color: 'var(--emerald)', marginTop: 4 }}><Check size={12} strokeWidth={3} /> {b?.name}</div>;
                    })}
                  </div>
                </>
              )}
            </div>

            <div className="modal-footer">
              {step > 1 && <button className="btn btn-secondary" onClick={() => setStep(s => s-1)}>Atrás</button>}
              <button className="btn btn-ghost" onClick={() => setShowModal(false)}>Cancelar</button>
              {step < MODULOS.length
                ? <button className="btn btn-secondary" onClick={() => setStep(s => s+1)}>Siguiente Módulo <ChevronRight size={14} /></button>
                : <button className="btn btn-primary" onClick={save}>Guardar y Publicar</button>}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
