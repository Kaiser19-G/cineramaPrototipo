import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Plus, Star, ShieldAlert } from 'lucide-react';
import { useCinema } from '../context/CinemaContext';
import { adminApi } from '../api/admin';
import DialogHead from '../components/DialogHead';
import {
  GENRES, RATINGS, FORMATS, LANGUAGES, LANGUAGE_LABELS, MOVIE_STATUSES, MOVIE_STATUS_LABELS, isValidPosterUrl,
} from '../shared/catalogOptions';
import { PRESALE_MAX_TICKETS } from '../shared/presale';
import './MovieManagement.css';

const STATUS_BADGE = { active: 'badge-green', upcoming: 'badge-blue', draft: 'badge-muted', archived: 'badge-muted' };

const FIELD_LABEL = {
  title: 'Título', genre: 'Género', duration: 'Duración', rating: 'Clasificación', language: 'Idioma', status: 'Estado',
  format: 'Formatos', director: 'Director', poster: 'Póster', backdrop: 'Imagen de fondo', synopsis: 'Sinopsis',
  featured: 'Destacada', presale: 'Preventa', releaseDate: 'Fecha de estreno', endDate: 'Fecha de cierre',
};
const ERROR_TEXT = {
  required: 'Este campo es obligatorio.',
  too_long: 'Es demasiado largo.',
  invalid: 'El valor no es válido.',
  invalid_option: 'Elige una opción de la lista.',
  out_of_range: 'Está fuera del rango permitido.',
  invalid_url: 'Usa una dirección que empiece con https:// , sin espacios, comillas ni paréntesis (máximo 2048 caracteres).',
  invalid_date: 'La fecha no es válida.',
  date_order: 'La fecha de cierre no puede ser anterior a la de estreno.',
  required_for_presale: 'La preventa necesita una fecha de estreno.',
};
const FOCUS_ORDER = ['title', 'director', 'synopsis', 'duration', 'language', 'poster', 'backdrop', 'genre', 'rating', 'format',
  'releaseDate', 'endDate', 'presale', 'status', 'featured'];

const EMPTY_FORM = {
  title: '', director: '', synopsis: '', duration: '', language: 'ES', poster: '', backdrop: '', genre: '', rating: '',
  format: ['2D'], releaseDate: '', endDate: '', presale: false, status: 'draft', featured: false,
};

const fromMovie = (m) => ({
  title: m.title ?? '', director: m.director ?? '', synopsis: m.synopsis ?? '', duration: String(m.duration ?? ''),
  language: m.language ?? 'ES', poster: m.poster ?? '', backdrop: m.backdrop ?? '', genre: m.genre ?? '', rating: m.rating ?? '',
  format: [...(m.format ?? [])], releaseDate: m.releaseDate ?? '', endDate: m.endDate ?? '', presale: !!m.presale,
  status: m.status ?? 'draft', featured: !!m.featured,
});

const toPayload = (f) => ({
  title: f.title.trim(), director: f.director, synopsis: f.synopsis, duration: /^\d+$/.test(f.duration.trim()) ? Number(f.duration) : f.duration,
  language: f.language, poster: f.poster.trim(), backdrop: f.backdrop.trim(), genre: f.genre, rating: f.rating, format: f.format,
  releaseDate: f.releaseDate, endDate: f.endDate, presale: f.presale, status: f.status, featured: f.featured,
});

const isRealDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

// Mismas reglas que el servidor (el servidor es quien decide; esto solo evita viajes inútiles).
function validate(f) {
  const e = {};
  if (!f.title.trim()) e.title = 'required'; else if (f.title.trim().length > 120) e.title = 'too_long';
  if (!GENRES.includes(f.genre)) e.genre = f.genre ? 'invalid_option' : 'required';
  if (!RATINGS.includes(f.rating)) e.rating = f.rating ? 'invalid_option' : 'required';
  if (!LANGUAGES.includes(f.language)) e.language = 'required';
  if (!f.duration.trim()) e.duration = 'required';
  else if (!/^\d+$/.test(f.duration.trim()) || Number(f.duration) < 1 || Number(f.duration) > 400) e.duration = 'out_of_range';
  if (f.format.length === 0) e.format = 'required';
  if (f.director.length > 120) e.director = 'too_long';
  if (f.synopsis.length > 2000) e.synopsis = 'too_long';
  for (const k of ['poster', 'backdrop']) if (f[k].trim() && !isValidPosterUrl(f[k].trim())) e[k] = 'invalid_url';
  for (const k of ['releaseDate', 'endDate']) if (f[k] && !isRealDate(f[k])) e[k] = 'invalid_date';
  if (!e.releaseDate && !e.endDate && f.releaseDate && f.endDate && f.endDate < f.releaseDate) e.endDate = 'date_order';
  if (f.presale && !f.releaseDate && !e.releaseDate) e.releaseDate = 'required_for_presale';
  return e;
}

function FieldErr({ id, code }) {
  return code ? <p id={id} className="mv-field-error">{ERROR_TEXT[code] ?? 'El valor no es válido.'}</p> : null;
}

const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));

// ───────────────────────── Diálogo de confirmación ─────────────────────────
function ConfirmDialog({ title, children, confirmLabel, busy, error, onConfirm, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return (
    <dialog ref={ref} className="mv-dialog" style={{ width: 'min(520px, calc(100vw - 32px))' }} aria-labelledby="mv-confirm-title" onClose={onClose}>
      <h2 id="mv-confirm-title">{title}</h2>
      {children}
      {error && <p className="mv-error-text" role="alert">{error}</p>}
      <div className="mv-dialog-actions">
        <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={busy}>Cancelar</button>
        <button type="button" className="btn btn-primary" onClick={onConfirm} disabled={busy}>{busy ? 'Guardando…' : confirmLabel}</button>
      </div>
    </dialog>
  );
}

// ───────────────────────── Formulario de película ─────────────────────────
function MovieDialog({ movie, branches, onClose, onSaved }) {
  const ref = useRef(null);
  const summaryRef = useRef(null);
  const editing = !!movie;
  const initialBranches = useMemo(() => (movie ? movie.branches.filter((b) => b.active).map((b) => b.branchId) : []), [movie]);
  const [form, setForm] = useState(() => (movie ? fromMovie(movie) : EMPTY_FORM));
  const [selected, setSelected] = useState(initialBranches);
  // Periodo de habilitación por sede (desde / hasta); vacío = sin límite. Es el que limita la programación de funciones.
  const initialDates = useMemo(() => Object.fromEntries((movie?.branches ?? []).map((b) => [b.branchId, { startDate: b.startDate ?? '', endDate: b.endDate ?? '' }])), [movie]);
  const [bDates, setBDates] = useState(initialDates);
  const setBDate = (id, k, v) => setBDates((p) => ({ ...p, [id]: { startDate: '', endDate: '', ...p[id], [k]: v } }));
  const branchItems = () => selected.map((branchId) => ({ branchId, ...(bDates[branchId] ? { startDate: bDates[branchId].startDate || null, endDate: bDates[branchId].endDate || null } : {}) }));
  const datesChanged = selected.some((id) => (bDates[id]?.startDate ?? '') !== (initialDates[id]?.startDate ?? '') || (bDates[id]?.endDate ?? '') !== (initialDates[id]?.endDate ?? ''));
  const [version, setVersion] = useState(movie?.version ?? null);
  const [base, setBase] = useState(movie ?? null);              // lo que se cargó al abrir (o tras guardar a medias)
  const [errors, setErrors] = useState({});
  const [branchErrors, setBranchErrors] = useState('');
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(null);                // { current }
  const [busy, setBusy] = useState(false);

  useEffect(() => { ref.current?.showModal(); }, []);

  const set = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => { if (!p[k]) return p; const n = { ...p }; delete n[k]; return n; }); };
  const toggle = (list, v) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);

  const focusField = (k) => { const el = document.getElementById(`mv-${k}`) ?? document.querySelector(`[data-field="${k}"] input`); el?.focus(); };
  const showErrors = (errs, msg = '') => {
    setErrors(errs); setMessage(msg);
    // El resumen recibe el foco: lector de pantalla anuncia cuántos errores hay y desde ahí se llega a cada campo.
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const fieldProps = (k) => ({
    id: `mv-${k}`,
    'aria-invalid': errors[k] ? 'true' : undefined,
    'aria-describedby': [errors[k] ? `mv-${k}-err` : null, `mv-${k}-hint`].filter(Boolean).join(' ') || undefined,
  });

  const submit = async (e, overrideVersion) => {
    e?.preventDefault();
    setConflict(null); setMessage(''); setBranchErrors('');
    const local = validate(form);
    if (Object.keys(local).length) { showErrors(local); return; }
    setBusy(true);
    const payload = toPayload(form);
    let res;
    if (!editing) {
      res = await adminApi.movies.create({ ...payload, branches: branchItems() });
    } else {
      res = await adminApi.movies.update(movie.id, { ...payload, version: overrideVersion ?? version });
    }
    if (!res.ok) {
      setBusy(false);
      if (res.status === 409 && res.error === 'stale') { setConflict({ current: res.data.current }); requestAnimationFrame(() => summaryRef.current?.focus()); return; }
      if (res.status === 400 && res.data.errors) {
        const { branches: br, ...fields } = res.data.errors;
        if (br) setBranchErrors('Revisa las sedes seleccionadas.');
        showErrors(fields);
        return;
      }
      if (res.status === 409 && res.error === 'has_future_screenings') {
        showErrors({}, `No se puede guardar este cambio: la película tiene ${res.data.count} función(es) futura(s) que dependen de su estado o de sus formatos. Cancélalas primero.`);
        return;
      }
      showErrors({}, res.error === 'forbidden' ? 'No tienes permiso para hacer este cambio.'
        : res.status === 401 ? 'Tu sesión terminó. Inicia sesión de nuevo.'
          : res.error === 'network' ? 'No hay conexión con el servidor. Inténtalo de nuevo.' : 'No se pudo guardar. Inténtalo de nuevo.');
      return;
    }
    let saved = res.data.movie;
    if (editing && (!sameSet(selected, initialBranches) || datesChanged)) {
      const br = await adminApi.movies.setBranches(movie.id, branchItems());
      if (!br.ok) {
        setBusy(false);
        // La película sí se guardó: se conserva la versión nueva para que reintentar solo cambie las sedes.
        setVersion(saved.version); setBase(saved);
        const why = br.error === 'has_future_screenings'
          ? `No se pudo quitar una sede: tiene ${br.data.count} función(es) futura(s) de esta película. Cancélalas antes.`
          : 'No se pudieron guardar las sedes.';
        showErrors({}, `Los datos de la película se guardaron, pero ${why[0].toLowerCase()}${why.slice(1)}`);
        onSaved(saved, { partial: true });
        return;
      }
      saved = br.data.movie;
    }
    setBusy(false);
    onSaved(saved);
    ref.current?.close();
  };

  let changedByOther = [];
  if (conflict && base) {
    const x = fromMovie(base); const y = fromMovie(conflict.current);
    changedByOther = Object.keys(FIELD_LABEL).filter((k) => JSON.stringify(x[k]) !== JSON.stringify(y[k])).map((k) => FIELD_LABEL[k]);
  }

  const errorEntries = FOCUS_ORDER.filter((k) => errors[k]);
  const todayCaption = editing ? `Editar película: ${movie.title}` : 'Nueva película';

  return (
    <dialog ref={ref} className="mv-dialog" aria-labelledby="mv-form-title" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <DialogHead id="mv-form-title" title={todayCaption} onClose={() => ref.current?.close()} />
        <p className="mv-hint" style={{ marginBottom: 12 }}>Los campos marcados con (obligatorio) hay que llenarlos para guardar.</p>

        <div ref={summaryRef} tabIndex={-1}>
          {errorEntries.length > 0 && (
            <div className="mv-summary" role="alert">
              <h3>{errorEntries.length === 1 ? 'Hay 1 campo por corregir' : `Hay ${errorEntries.length} campos por corregir`}</h3>
              <ul>
                {errorEntries.map((k) => (
                  <li key={k}><a href={`#mv-${k}`} onClick={(ev) => { ev.preventDefault(); focusField(k); }}>{FIELD_LABEL[k]}</a>: {ERROR_TEXT[errors[k]] ?? 'El valor no es válido.'}</li>
                ))}
              </ul>
            </div>
          )}
          {message && <p className="mv-summary mv-error-text" role="alert">{message}</p>}
          {conflict && (
            <div className="mv-conflict" role="alert">
              <h3>Otra persona cambió esta película mientras la editabas</h3>
              <p>
                {changedByOther.length
                  ? <>Cambió: {changedByOther.join(', ')}.</>
                  : <>Cambió algún dato que no aparece en este formulario (por ejemplo, las sedes).</>}
                {' '}Lo que escribiste sigue aquí; no se perdió nada.
              </p>
              <div className="mv-dialog-actions" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy}
                  onClick={() => { const v = conflict.current.version; setVersion(v); setBase(conflict.current); setConflict(null); submit(null, v); }}>
                  Guardar mis cambios encima
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
                  onClick={() => { setForm(fromMovie(conflict.current)); setSelected(conflict.current.branches.filter((b) => b.active).map((b) => b.branchId)); setVersion(conflict.current.version); setBase(conflict.current); setConflict(null); setErrors({}); }}>
                  Descartar los míos y cargar lo actual
                </button>
              </div>
            </div>
          )}
        </div>

        <fieldset className="mv-fieldset">
          <legend>Información</legend>
          <div className="mv-field">
            <label htmlFor="mv-title">Título (obligatorio)</label>
            <input className="input" {...fieldProps('title')} value={form.title} onChange={(e) => set('title', e.target.value)} maxLength={140} autoComplete="off" />
            <FieldErr id="mv-title-err" code={errors.title} />
          </div>
          <div className="mv-field">
            <label htmlFor="mv-director">Director</label>
            <input className="input" {...fieldProps('director')} value={form.director} onChange={(e) => set('director', e.target.value)} autoComplete="off" />
            <FieldErr id="mv-director-err" code={errors.director} />
          </div>
          <div className="mv-field">
            <label htmlFor="mv-synopsis">Sinopsis</label>
            <textarea {...fieldProps('synopsis')} rows={4} value={form.synopsis} onChange={(e) => set('synopsis', e.target.value)} />
            <p id="mv-synopsis-hint" className="mv-hint">Máximo 2000 caracteres. Texto simple.</p>
            <FieldErr id="mv-synopsis-err" code={errors.synopsis} />
          </div>
          <div className="mv-row">
            <div className="mv-field">
              <label htmlFor="mv-duration">Duración en minutos (obligatorio)</label>
              <input className="input" {...fieldProps('duration')} inputMode="numeric" value={form.duration} onChange={(e) => set('duration', e.target.value)} />
              <p id="mv-duration-hint" className="mv-hint">Un número entre 1 y 400.</p>
              <FieldErr id="mv-duration-err" code={errors.duration} />
            </div>
            <div className="mv-field">
              <label htmlFor="mv-language">Idioma original (obligatorio)</label>
              <select className="select" {...fieldProps('language')} value={form.language} onChange={(e) => set('language', e.target.value)}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{LANGUAGE_LABELS[l]}</option>)}
              </select>
              <FieldErr id="mv-language-err" code={errors.language} />
            </div>
          </div>
          <div className="mv-field">
            <label htmlFor="mv-poster">Dirección del póster</label>
            <input className="input" {...fieldProps('poster')} type="url" value={form.poster} onChange={(e) => set('poster', e.target.value)} placeholder="https://…" autoComplete="off" />
            <p id="mv-poster-hint" className="mv-hint">Solo https://. Se carga desde ese sitio: usa imágenes que tengas derecho a mostrar.</p>
            <FieldErr id="mv-poster-err" code={errors.poster} />
          </div>
          <div className="mv-field">
            <label htmlFor="mv-backdrop">Dirección de la imagen de fondo</label>
            <input className="input" {...fieldProps('backdrop')} type="url" value={form.backdrop} onChange={(e) => set('backdrop', e.target.value)} placeholder="https://…" autoComplete="off" />
            <p id="mv-backdrop-hint" className="mv-hint">Opcional. Si falta, se usa el póster.</p>
            <FieldErr id="mv-backdrop-err" code={errors.backdrop} />
          </div>
        </fieldset>

        <fieldset className="mv-fieldset">
          <legend>Clasificación y formatos</legend>
          <div className="mv-row">
            <div className="mv-field">
              <label htmlFor="mv-genre">Género (obligatorio)</label>
              <select className="select" {...fieldProps('genre')} value={form.genre} onChange={(e) => set('genre', e.target.value)}>
                <option value="">Elige un género</option>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
              <FieldErr id="mv-genre-err" code={errors.genre} />
            </div>
            <div className="mv-field">
              <label htmlFor="mv-rating">Clasificación (obligatorio)</label>
              <select className="select" {...fieldProps('rating')} value={form.rating} onChange={(e) => set('rating', e.target.value)}>
                <option value="">Elige una clasificación</option>
                {RATINGS.map((r) => <option key={r} value={r}>{r === 'APT' ? 'APT (apta para todo público)' : r === '+14' ? '+14 (mayores de 14)' : '+18 (mayores de 18)'}</option>)}
              </select>
              <FieldErr id="mv-rating-err" code={errors.rating} />
            </div>
          </div>
          <fieldset className="mv-fieldset" data-field="format" aria-describedby={errors.format ? 'mv-format-err' : undefined}>
            <legend style={{ fontWeight: 600, fontSize: 14 }}>Formatos disponibles (obligatorio)</legend>
            <div className="mv-checks">
              {FORMATS.map((f) => (
                <label key={f} className="mv-check">
                  <input type="checkbox" checked={form.format.includes(f)} onChange={() => set('format', toggle(form.format, f))} aria-invalid={errors.format ? 'true' : undefined} />
                  <span>{f}</span>
                </label>
              ))}
            </div>
            <FieldErr id="mv-format-err" code={errors.format} />
          </fieldset>
        </fieldset>

        <fieldset className="mv-fieldset">
          <legend>Fechas y preventa</legend>
          <div className="mv-row">
            <div className="mv-field">
              <label htmlFor="mv-releaseDate">Fecha de estreno</label>
              <input className="input" {...fieldProps('releaseDate')} type="date" value={form.releaseDate} onChange={(e) => set('releaseDate', e.target.value)} />
              <FieldErr id="mv-releaseDate-err" code={errors.releaseDate} />
            </div>
            <div className="mv-field">
              <label htmlFor="mv-endDate">Fecha de cierre</label>
              <input className="input" {...fieldProps('endDate')} type="date" value={form.endDate} onChange={(e) => set('endDate', e.target.value)} />
              <FieldErr id="mv-endDate-err" code={errors.endDate} />
            </div>
          </div>
          <label className="mv-check" htmlFor="mv-presale">
            <input type="checkbox" id="mv-presale" aria-describedby="mv-presale-hint" checked={form.presale} onChange={(e) => set('presale', e.target.checked)} />
            <span>En preventa</span>
          </label>
          <p id="mv-presale-hint" className="mv-hint">
            Se muestra como «Preventa» en el sitio hasta la fecha de estreno y termina sola ese día. Requiere fecha de estreno.
            Cada cuenta podrá comprar como máximo {PRESALE_MAX_TICKETS} entradas por película (lo aplica el módulo de compras).
          </p>
          <FieldErr id="mv-presale-err" code={errors.presale} />
        </fieldset>

        <fieldset className="mv-fieldset">
          <legend>Publicación</legend>
          <div className="mv-field">
            <label htmlFor="mv-status">Estado</label>
            <select className="select" {...fieldProps('status')} value={form.status} onChange={(e) => set('status', e.target.value)}>
              {MOVIE_STATUSES.map((s) => <option key={s} value={s}>{MOVIE_STATUS_LABELS[s]}</option>)}
            </select>
            <p id="mv-status-hint" className="mv-hint">Solo «En cartelera» (con al menos una sede habilitada) y «Próximamente» se ven en el sitio.</p>
            <FieldErr id="mv-status-err" code={errors.status} />
          </div>
          <label className="mv-check" htmlFor="mv-featured">
            <input type="checkbox" id="mv-featured" aria-describedby="mv-featured-hint" checked={form.featured} onChange={(e) => set('featured', e.target.checked)} />
            <span>Destacada</span>
          </label>
          <p id="mv-featured-hint" className="mv-hint">Las destacadas aparecen primero en el inicio. No lleva etiqueta pública.</p>
        </fieldset>

        <fieldset className="mv-fieldset">
          <legend>Sedes donde está habilitada</legend>
          {branchErrors && <p className="mv-field-error" role="alert">{branchErrors}</p>}
          <div className="mv-branch-list">
            {branches.map((b) => (
              <div key={b.id} className="mv-branch-item">
                <label className="mv-check">
                  <input type="checkbox" checked={selected.includes(b.id)} onChange={() => setSelected((s) => toggle(s, b.id))} />
                  <span>{b.name} <span className="mv-sub">({b.city})</span></span>
                </label>
                {selected.includes(b.id) && (
                  <div className="mv-row mv-branch-dates">
                    <div className="mv-field">
                      <label htmlFor={`mv-bs-${b.id}`}>Habilitada desde ({b.name})</label>
                      <input id={`mv-bs-${b.id}`} className="input" type="date" value={bDates[b.id]?.startDate ?? ''} onChange={(e) => setBDate(b.id, 'startDate', e.target.value)} />
                    </div>
                    <div className="mv-field">
                      <label htmlFor={`mv-be-${b.id}`}>Habilitada hasta ({b.name})</label>
                      <input id={`mv-be-${b.id}`} className="input" type="date" value={bDates[b.id]?.endDate ?? ''} onChange={(e) => setBDate(b.id, 'endDate', e.target.value)} />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <p className="mv-hint" style={{ marginTop: 6 }}>Las fechas de cada sede limitan cuándo se pueden programar funciones allí (junto con las de la película); vacías = sin límite. Quitar una sede no es posible si tiene funciones futuras de esta película.</p>
        </fieldset>

        <div className="mv-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={busy}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear película'}</button>
        </div>
      </form>
    </dialog>
  );
}

// ───────────────────────── Página ─────────────────────────
export default function MovieManagement() {
  const { isAdminCentral, can, adminMovies, adminError, branches, refreshAll, activeBranch } = useCinema();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [genre, setGenre] = useState('');
  const [dialog, setDialog] = useState(null);            // { movie } | { movie: null }
  const [confirm, setConfirm] = useState(null);          // { kind: 'archive'|'restore', movie }
  const [confirmState, setConfirmState] = useState({ busy: false, error: '' });
  const [flash, setFlash] = useState({ text: '', error: false });
  const headingRef = useRef(null);

  useEffect(() => { document.title = 'Películas · Cinerama'; headingRef.current?.focus(); }, []);
  // Viene de Programación ("Editar las fechas de la película"): abre directamente la edición de esa película.
  const location = useLocation();
  const wantedId = location.state?.editMovieId ?? null;
  const [dismissedFor, setDismissedFor] = useState(null);
  const autoMovie = wantedId && dismissedFor !== wantedId && can('edit_movie') ? (adminMovies ?? []).find((x) => x.id === wantedId) : null;
  const shownDialog = dialog ?? (autoMovie ? { movie: autoMovie } : null);

  const movies = adminMovies;
  const canWrite = can('edit_movie');
  const rows = useMemo(() => (movies ?? []).filter((m) => {
    if (search && !m.title.toLowerCase().includes(search.toLowerCase())) return false;
    if (status && m.status !== status) return false;
    if (genre && m.genre !== genre) return false;
    return true;
  }), [movies, search, status, genre]);

  const branchName = (id) => branches.find((b) => b.id === id)?.name ?? `Sede ${id}`;
  const say = (text, error = false) => setFlash({ text, error });

  const onSaved = (m, opts) => {
    refreshAll();
    say(opts?.partial ? `«${m.title}»: datos guardados; revisa las sedes.` : `Película «${m.title}» guardada.`);
  };

  const patchQuick = async (m, body, okText) => {
    const res = await adminApi.movies.update(m.id, { version: m.version, ...body });
    refreshAll();
    if (res.ok) { say(okText); return { ok: true }; }
    if (res.error === 'stale') say(`Otra persona cambió «${m.title}» antes que tú. La lista se actualizó; vuelve a intentarlo.`, true);
    else if (res.error === 'has_future_screenings') return { ok: false, res };
    else say('No se pudo guardar el cambio.', true);
    return { ok: false, res };
  };

  const toggleFeatured = async (m) => {
    await patchQuick(m, { featured: !m.featured }, m.featured ? `«${m.title}» ya no es destacada.` : `«${m.title}» ahora es destacada.`);
  };

  const runConfirm = async () => {
    const { kind, movie } = confirm;
    setConfirmState({ busy: true, error: '' });
    const out = await patchQuick(movie, { status: kind === 'archive' ? 'archived' : 'draft' },
      kind === 'archive' ? `«${movie.title}» archivada: ya no se ve en el sitio.` : `«${movie.title}» restaurada como borrador.`);
    if (out.ok) { setConfirm(null); return; }
    setConfirmState({
      busy: false,
      error: out.res?.error === 'has_future_screenings'
        ? `No se puede archivar: tiene ${out.res.data.count} función(es) futura(s). Cancélalas primero.` : 'No se pudo completar. La lista se actualizó; inténtalo de nuevo.',
    });
  };

  const readOnly = !isAdminCentral || !canWrite;

  return (
    <div className="mv-page">
      <div className="page-header">
        <div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>
            {isAdminCentral ? 'Catálogo global de películas' : `Películas — ${activeBranch?.name ?? 'mi sede'}`}
          </h1>
          <p className="page-subtitle">
            {isAdminCentral ? 'Crea, edita, archiva y habilita películas en las sedes' : 'Películas habilitadas para esta sede'}
          </p>
        </div>
        {can('create_movie') && (
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ movie: null })} disabled={!movies}>
            <Plus size={16} aria-hidden="true" /> Nueva película
          </button>
        )}
      </div>

      {readOnly && (
        <div className="perm-notice" role="note">
          <ShieldAlert size={14} aria-hidden="true" />
          <span>Vista de solo lectura. Para crear o editar películas, o habilitarlas en tu sede, contacta al <strong>administrador central</strong>.</span>
        </div>
      )}

      <p className={`mv-flash${flash.error ? ' mv-error-text' : ''}`} role="status" hidden={!flash.text}>{flash.text}</p>

      {adminError && !movies && (
        <div role="alert" className="mv-flash mv-error-text">
          No se pudieron cargar las películas. <button type="button" className="btn btn-secondary btn-sm" onClick={refreshAll}>Reintentar</button>
        </div>
      )}
      {!movies && !adminError && <p role="status">Cargando películas…</p>}

      {movies && (
        <>
          <div className="mv-toolbar" role="search" aria-label="Filtrar películas">
            <div className="mv-filter mv-filter-grow">
              <label htmlFor="mv-search">Buscar por título</label>
              <input id="mv-search" className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
            </div>
            <div className="mv-filter">
              <label htmlFor="mv-f-status">Estado</label>
              <select id="mv-f-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todos los estados</option>
                {MOVIE_STATUSES.map((s) => <option key={s} value={s}>{MOVIE_STATUS_LABELS[s]}</option>)}
              </select>
            </div>
            <div className="mv-filter">
              <label htmlFor="mv-f-genre">Género</label>
              <select id="mv-f-genre" className="select" value={genre} onChange={(e) => setGenre(e.target.value)}>
                <option value="">Todos los géneros</option>
                {GENRES.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
          </div>

          <p className="sr-only" role="status">{rows.length === 1 ? '1 película' : `${rows.length} películas`}</p>

          {rows.length === 0 ? (
            <div className="empty-state"><p>No hay películas con esos filtros.</p></div>
          ) : (
            <div className="table-wrapper card" style={{ padding: 0 }}>
              <table className="table mv-table">
                <caption className="sr-only">Películas del catálogo</caption>
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">Póster</span></th>
                    <th scope="col">Película</th>
                    <th scope="col">Estado</th>
                    <th scope="col">Sedes habilitadas</th>
                    <th scope="col">{readOnly ? 'Detalle' : 'Acciones'}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((m) => {
                    const on = m.branches.filter((b) => b.active);
                    return (
                      <tr key={m.id}>
                        <td>{m.poster ? <img className="mv-thumb" src={m.poster} alt="" loading="lazy" /> : <span className="mv-thumb-empty" aria-hidden="true" />}</td>
                        <td>
                          <div className="mv-title">{m.title}</div>
                          <div className="mv-sub">{m.genre} · {m.rating} · {m.duration} min · {m.format.join(', ')}</div>
                          {m.featured && <div className="mv-sub">Destacada</div>}
                        </td>
                        <td>
                          <span className={`badge ${STATUS_BADGE[m.status] ?? 'badge-muted'}`}>{MOVIE_STATUS_LABELS[m.status] ?? m.status}</span>
                          {m.presaleEffective && <div style={{ marginTop: 4 }}><span className="mv-pill mv-pill-presale">Preventa hasta el estreno ({m.releaseDate})</span></div>}
                          {m.presale && !m.presaleEffective && <div className="mv-sub" style={{ marginTop: 4 }}>Preventa terminada</div>}
                        </td>
                        <td>
                          {on.length === 0 ? <span className="mv-sub">Ninguna</span> : (
                            <span>{on.length} {on.length === 1 ? 'sede' : 'sedes'}<span className="mv-sub"> — {on.slice(0, 2).map((b) => branchName(b.branchId)).join(', ')}{on.length > 2 ? ` y ${on.length - 2} más` : ''}</span></span>
                          )}
                        </td>
                        <td>
                          {readOnly ? <span className="mv-sub">{m.releaseDate ? `Estreno ${m.releaseDate}` : '—'}</span> : (
                            <div className="mv-actions">
                              <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ movie: m })}>
                                Editar<span className="sr-only"> {m.title}</span>
                              </button>
                              <button type="button" className="btn btn-secondary btn-sm mv-star" aria-pressed={m.featured} onClick={() => toggleFeatured(m)}>
                                <Star size={14} aria-hidden="true" fill={m.featured ? 'currentColor' : 'none'} /> Destacada<span className="sr-only">: {m.title}</span>
                              </button>
                              {m.status === 'archived'
                                ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setConfirmState({ busy: false, error: '' }); setConfirm({ kind: 'restore', movie: m }); }}>Restaurar<span className="sr-only"> {m.title}</span></button>
                                : <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setConfirmState({ busy: false, error: '' }); setConfirm({ kind: 'archive', movie: m }); }}>Archivar<span className="sr-only"> {m.title}</span></button>}
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {shownDialog && (
        <MovieDialog key={shownDialog.movie?.id ?? 'new'} movie={shownDialog.movie} branches={branches} onClose={() => { setDialog(null); setDismissedFor(wantedId); }} onSaved={onSaved} />
      )}
      {confirm && (
        <ConfirmDialog
          title={confirm.kind === 'archive' ? `Archivar «${confirm.movie.title}»` : `Restaurar «${confirm.movie.title}»`}
          confirmLabel={confirm.kind === 'archive' ? 'Archivar' : 'Restaurar como borrador'}
          busy={confirmState.busy} error={confirmState.error} onConfirm={runConfirm} onClose={() => setConfirm(null)}
        >
          <p>
            {confirm.kind === 'archive'
              ? 'La película deja de verse en el sitio público y su dirección mostrará «página no encontrada». No se borra: puedes restaurarla después.'
              : 'La película vuelve como borrador. Para publicarla, cambia su estado y habilítala en las sedes.'}
          </p>
        </ConfirmDialog>
      )}
    </div>
  );
}
