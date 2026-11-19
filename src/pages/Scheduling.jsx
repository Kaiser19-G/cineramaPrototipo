import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Plus, ShieldAlert } from 'lucide-react';
import { useCinema } from '../context/CinemaContext';
import { adminApi } from '../api/admin';
import HallStatusControl from '../components/HallStatusControl';
import DialogHead from '../components/DialogHead';
import { LANGUAGES } from '../shared/catalogOptions';
import {
  CLEANING_MINUTES, MIN_LEAD_MINUTES, START_STEP_MINUTES, MAX_TICKET_PRICE, SCREENING_STATUS_LABELS,
  hallSupportsFormat, endTimeOf, fromMinutes, toMinutes, screeningSpan, screeningWindow, TIME_RE,
} from '../shared/scheduling';
import { absMinutes, todayInLima } from '../data/limaDate';
import { money } from '../utils/money';
import './MovieManagement.css';

const STATUS_BADGE = { draft: 'badge-muted', scheduled: 'badge-blue', active: 'badge-green', sold_out: 'badge-red', finished: 'badge-muted', cancelled: 'badge-orange' };
const FIELD_LABEL = { branchId: 'Sede', movieId: 'Película', hallId: 'Sala', date: 'Fecha', startTime: 'Hora de inicio', format: 'Formato', language: 'Idioma', price: 'Precio', status: 'Estado' };
const FOCUS_ORDER = ['branchId', 'movieId', 'hallId', 'date', 'startTime', 'format', 'language', 'price'];

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 / START_STEP_MINUTES }, (_, i) => String(i * START_STEP_MINUTES).padStart(2, '0'));

// '2026-11-17' -> '17 de noviembre de 2026'
const longDate = (ymd) => new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));

// Rango en que se puede programar una película en una sede, con la misma regla del servidor (screeningWindow) y "hoy en Lima"
// como mínimo. Devuelve { from, to, empty, ended }: `ended` = el periodo ya terminó; `empty` = no queda ningún día.
function availableRange(movie, branchId, today) {
  if (!movie) return null;
  const mb = movie.branches.find((b) => b.branchId === branchId);
  const w = screeningWindow(movie, mb);
  const from = w.from && w.from > today ? w.from : today;
  const empty = !!w.to && from > w.to;
  return { from, to: w.to, empty, ended: !!w.to && w.to < today, periodEnd: w.to };
}

const dayLabel = (ymd) => {
  const t = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};

// Texto de cada error del servidor (el servidor es quien decide; aquí solo se muestra junto al campo).
function messageFor(code, data = {}) {
  switch (code) {
    case 'required': return 'Este campo es obligatorio.';
    case 'invalid': case 'invalid_option': return 'Elige una opción válida.';
    case 'invalid_date': return 'La fecha no es válida.';
    case 'invalid_time': return 'La hora no es válida (usa el formato 24 horas).';
    case 'time_incomplete': return 'Elige la hora y también los minutos.';
    case 'invalid_step': return `La hora de inicio va en pasos de ${START_STEP_MINUTES} minutos (00, 05, 10… 55). Elige otros minutos.`;
    case 'out_of_range': return `El precio debe ser mayor que 0 y hasta S/ ${MAX_TICKET_PRICE}.`;
    case 'invalid_decimals': return 'El precio admite como máximo 2 decimales.';
    case 'movie_inactive': return 'Esta película no se puede programar: solo las que están en cartelera, o próximas con preventa.';
    case 'movie_not_enabled': return 'La película no está habilitada en esta sede. El administrador central debe habilitarla.';
    case 'branch_inactive': return 'La sede no está activa.';
    case 'outside_window': return `Fuera de las fechas de la película${data.from || data.to ? ` (del ${data.from ? longDate(data.from) : 'inicio'} al ${data.to ? longDate(data.to) : 'sin cierre'})` : ''}.`;
    case 'in_the_past': return `La función debe empezar con al menos ${data.minLeadMinutes ?? MIN_LEAD_MINUTES} minutos de anticipación.`;
    case 'hall_in_maintenance': return 'La sala está en mantenimiento.';
    case 'format_not_supported_by_hall': return `Esta sala (${data.hallType ?? ''}) no puede proyectar ese formato.`;
    case 'format_not_in_movie': return 'La película no tiene ese formato.';
    case 'format_not_in_branch': return 'La película no tiene ese formato habilitado en esta sede.';
    case 'hall_overlap': {
      const c = data.conflict ?? {};
      return `Choca con ${c.movieTitle}, ${c.startTime} a ${c.endTime} en ${c.hallName}${c.date ? ` (${c.date})` : ''}. Cada función necesita ${CLEANING_MINUTES} minutos de limpieza antes de la siguiente.`;
    }
    case 'not_found': return 'No se encontró el elemento elegido en tu alcance.';
    default: return 'El valor no es válido.';
  }
}

function FieldErr({ id, text }) {
  return text ? <p id={id} className="mv-field-error">{text}</p> : null;
}

// ───────────────────────── Formulario de función ─────────────────────────
function ScreeningDialog({ screening, onClose, onSaved }) {
  const { branches, halls, adminMovies, adminScreenings, currentUser, isAdminCentral, can } = useCinema();
  const ref = useRef(null);
  const summaryRef = useRef(null);
  const editing = !!screening;
  const locked = !!screening?.hasSales;
  const myBranch = currentUser?.branchId ?? null;
  const initialBranch = screening?.branchId ?? (isAdminCentral ? (branches[0]?.id ?? '') : myBranch);
  const [form, setForm] = useState(() => ({
    branchId: initialBranch ?? '', movieId: screening ? String(screening.movieId) : '', hallId: screening ? String(screening.hallId) : '',
    date: screening?.date ?? '', hh: screening?.startTime?.slice(0, 2) ?? '', mm: screening?.startTime?.slice(3, 5) ?? '', format: screening?.format ?? '', language: screening?.language ?? 'ES',
    price: screening ? String(screening.price) : '', draft: screening?.storedStatus === 'draft',
  }));
  const [priceTouched, setPriceTouched] = useState(editing);
  const [version, setVersion] = useState(screening?.version ?? null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [stale, setStale] = useState(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { ref.current?.showModal(); }, []);

  const branchId = Number(form.branchId) || null;
  const hallsHere = halls.filter((h) => h.branchId === branchId);
  const hall = hallsHere.find((h) => h.id === Number(form.hallId));
  const programmable = useMemo(() => (adminMovies ?? []).filter((m) => (m.status === 'active' || (m.status === 'upcoming' && m.presale))
    && m.branches.some((b) => b.branchId === branchId && b.active)), [adminMovies, branchId]);
  const movie = (adminMovies ?? []).find((m) => m.id === Number(form.movieId));
  const startTime = form.hh && form.mm ? `${form.hh}:${form.mm}` : '';
  const today = todayInLima();
  const range = availableRange(movie, branchId, today);
  const noDates = (m) => availableRange(m, branchId, today)?.empty;
  const offStep = !!form.mm && !MINUTES.includes(form.mm);
  const mbFormats = movie?.branches.find((b) => b.branchId === branchId)?.formats ?? movie?.format ?? [];
  const formatOptions = movie && hall ? movie.format.filter((f) => mbFormats.includes(f) && hallSupportsFormat(hall.type, f)) : (movie?.format ?? []);

  const set = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => { if (!p[k]) return p; const n = { ...p }; delete n[k]; return n; }); };
  const setTime = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => { if (!p.startTime) return p; const n = { ...p }; delete n.startTime; return n; }); };
  const changeBranch = (v) => { setForm((p) => ({ ...p, branchId: v, movieId: '', hallId: '', format: '' })); setErrors({}); };
  const changeHall = (v) => {
    const h = halls.find((x) => x.id === Number(v));
    setForm((p) => ({ ...p, hallId: v, format: '', price: priceTouched || !h ? p.price : String(h.priceBase) }));
    setErrors((p) => { const n = { ...p }; delete n.hallId; delete n.startTime; delete n.format; return n; });
  };

  // Vista previa: hora de fin y aviso de choque (orientativo; manda el servidor).
  const validStart = TIME_RE.test(startTime) && form.date;
  const endTime = movie && TIME_RE.test(startTime) ? endTimeOf(startTime, movie.duration) : null;
  const busyUntil = movie && TIME_RE.test(startTime) ? fromMinutes(toMinutes(startTime) + movie.duration + CLEANING_MINUTES) : null;
  let localClash = null;
  if (movie && hall && validStart && endTime) {
    const s0 = absMinutes(form.date, toMinutes(startTime)); const e0 = s0 + movie.duration;
    localClash = (adminScreenings ?? []).find((o) => {
      if (o.hallId !== hall.id || o.id === screening?.id || o.storedStatus === 'cancelled') return false;
      const span = screeningSpan(o.date, o.startTime, o.endTime);
      return s0 < span.end + CLEANING_MINUTES && span.start < e0 + CLEANING_MINUTES;
    }) ?? null;
  }
  const clashMovie = localClash ? (adminMovies ?? []).find((m) => m.id === localClash.movieId)?.title : '';

  const localErrors = () => {
    const e = {};
    if (isAdminCentral && !branchId) e.branchId = 'required';
    if (!form.movieId) e.movieId = 'required';
    if (!form.hallId) e.hallId = 'required';
    if (!form.date) e.date = 'required';
    if (!form.hh && !form.mm) e.startTime = 'required'; else if (!form.hh || !form.mm) e.startTime = 'time_incomplete'; else if (!TIME_RE.test(startTime)) e.startTime = 'invalid_time'; else if (toMinutes(startTime) % START_STEP_MINUTES) e.startTime = 'invalid_step';
    if (!form.format) e.format = 'required';
    const p = Number(String(form.price).replace(',', '.'));
    if (!String(form.price).trim()) e.price = 'required'; else if (!(p > 0 && p <= MAX_TICKET_PRICE)) e.price = 'out_of_range'; else if (Math.abs(p * 100 - Math.round(p * 100)) > 1e-6) e.price = 'invalid_decimals';
    return e;
  };
  const showErrors = (errs, data = {}, msg = '') => {
    setErrors(Object.fromEntries(Object.entries(errs).map(([k, v]) => [k, { code: v, data }])));
    setMessage(msg);
    requestAnimationFrame(() => summaryRef.current?.focus());
  };

  const submit = async (ev, overrideVersion) => {
    ev?.preventDefault();
    setMessage(''); setStale(null);
    const le = localErrors();
    if (Object.keys(le).length) { showErrors(le); return; }
    setBusy(true);
    const payload = {
      movieId: Number(form.movieId), hallId: Number(form.hallId), date: form.date, startTime, language: form.language,
      format: form.format, price: Number(String(form.price).replace(',', '.')), status: form.draft ? 'draft' : 'scheduled',
    };
    const res = editing ? await adminApi.screenings.update(screening.id, { ...payload, version: overrideVersion ?? version }) : await adminApi.screenings.create(payload);
    setBusy(false);
    if (res.ok) { onSaved(res.data.screening, editing); ref.current?.close(); return; }
    const d = res.data ?? {};
    if (res.status === 409 && res.error === 'stale') { setStale(d.current); requestAnimationFrame(() => summaryRef.current?.focus()); return; }
    if (res.status === 400 && d.errors) { showErrors(d.errors); return; }
    if (res.error === 'has_sales') { showErrors({}, {}, 'Esta función ya tiene entradas vendidas: solo se pueden cambiar el precio y el estado. Para cambiar otra cosa, cancélala y crea una nueva.'); return; }
    if (res.error === 'not_editable') { showErrors({}, {}, 'Esta función ya terminó o está cancelada y no se puede editar.'); return; }
    if (res.status === 404) { showErrors({ [d.field ?? 'hallId']: 'not_found' }, {}, ''); return; }
    if (res.status === 409 && d.field) { showErrors({ [d.field]: res.error }, d); return; }
    if (res.status === 403) { showErrors({}, {}, 'No tienes permiso para programar funciones.'); return; }
    showErrors({}, {}, res.error === 'network' ? 'No hay conexión con el servidor. Inténtalo de nuevo.' : 'No se pudo guardar. Inténtalo de nuevo.');
  };

  const errCode = (k) => errors[k]?.code ?? (typeof errors[k] === 'string' ? errors[k] : null);
  const errText = (k) => (errors[k] ? messageFor(errCode(k), errors[k].data) : null);
  const fp = (k, extra = {}) => ({
    id: `sc-${k}`, 'aria-invalid': errors[k] ? 'true' : undefined,
    'aria-describedby': [errors[k] ? `sc-${k}-err` : null, extra.hint ? `sc-${k}-hint` : null].filter(Boolean).join(' ') || undefined,
  });
  const entries = FOCUS_ORDER.filter((k) => errors[k]);
  const hintId = (k) => `sc-${k}-hint`;
  const lockNote = locked ? 'Tiene entradas vendidas: este dato no se puede cambiar.' : null;

  return (
    <dialog ref={ref} className="mv-dialog" aria-labelledby="sc-title" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <DialogHead id="sc-title" title={editing ? 'Editar función' : 'Programar función'} onClose={() => ref.current?.close()} />
        <p className="mv-hint" style={{ marginBottom: 12 }}>
          Los campos marcados con (obligatorio) hay que llenarlos. El servidor revisa cada regla al guardar.
        </p>
        <div ref={summaryRef} tabIndex={-1}>
          {entries.length > 0 && (
            <div className="mv-summary" role="alert">
              <h3>{entries.length === 1 ? 'Hay 1 dato por corregir' : `Hay ${entries.length} datos por corregir`}</h3>
              <ul>
                {entries.map((k) => (
                  <li key={k}><a href={`#sc-${k}`} onClick={(e) => { e.preventDefault(); document.getElementById(`sc-${k}`)?.focus(); }}>{FIELD_LABEL[k]}</a>: {errText(k)}</li>
                ))}
              </ul>
            </div>
          )}
          {message && <p className="mv-summary mv-error-text" role="alert">{message}</p>}
          {stale && (
            <div className="mv-conflict" role="alert">
              <h3>Otra persona cambió esta función mientras la editabas</h3>
              <p>Lo que escribiste sigue aquí. Ahora está: {stale.date} {stale.startTime}–{stale.endTime}, {money(stale.price)}, {SCREENING_STATUS_LABELS[stale.status]}.</p>
              <div className="mv-dialog-actions" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy} onClick={() => { setVersion(stale.version); const v = stale.version; setStale(null); submit(null, v); }}>Guardar mis cambios encima</button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy} onClick={() => {
                  setForm({ branchId: stale.branchId, movieId: String(stale.movieId), hallId: String(stale.hallId), date: stale.date, hh: stale.startTime.slice(0, 2), mm: stale.startTime.slice(3, 5), format: stale.format, language: stale.language, price: String(stale.price), draft: stale.storedStatus === 'draft' });
                  setVersion(stale.version); setStale(null); setErrors({});
                }}>Descartar los míos y cargar lo actual</button>
              </div>
            </div>
          )}
        </div>

        <fieldset className="mv-fieldset">
          <legend>Dónde y qué</legend>
          {isAdminCentral ? (
            <div className="mv-field">
              <label htmlFor="sc-branchId">Sede (obligatorio)</label>
              <select className="select" {...fp('branchId')} value={form.branchId} onChange={(e) => changeBranch(e.target.value)} disabled={editing}>
                {branches.filter((b) => b.status === 'active').map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
              </select>
              {editing && <p id={hintId('branchId')} className="mv-hint">La sede no se cambia al editar; para otra sede, crea una función nueva.</p>}
              <FieldErr id="sc-branchId-err" text={errText('branchId')} />
            </div>
          ) : (
            <p className="mv-hint"><strong>Sede:</strong> {branches.find((b) => b.id === myBranch)?.name}</p>
          )}
          <div className="mv-field">
            <label htmlFor="sc-movieId">Película (obligatorio)</label>
            <select className="select" {...fp('movieId', { hint: true })} value={form.movieId} disabled={locked}
              onChange={(e) => { set('movieId', e.target.value); setForm((p) => ({ ...p, movieId: e.target.value, format: '' })); }}>
              <option value="">Elige una película</option>
              {programmable.map((m) => <option key={m.id} value={m.id}>{m.title} ({m.duration} min){noDates(m) ? ' (sin fechas disponibles)' : ''}</option>)}
              {movie && !programmable.some((m) => m.id === movie.id) && <option value={movie.id}>{movie.title} (ya no programable)</option>}
            </select>
            <p id={hintId('movieId')} className="mv-hint">{lockNote ?? 'Solo películas en cartelera, o próximas con preventa, habilitadas en esta sede.'}</p>
            <FieldErr id="sc-movieId-err" text={errText('movieId')} />
          </div>
          <div className="mv-field">
            <label htmlFor="sc-hallId">Sala (obligatorio)</label>
            <select className="select" {...fp('hallId', { hint: !!lockNote })} value={form.hallId} disabled={locked} onChange={(e) => changeHall(e.target.value)}>
              <option value="">Elige una sala</option>
              {hallsHere.map((h) => (
                <option key={h.id} value={h.id} disabled={h.status !== 'active' && h.id !== Number(form.hallId)}>
                  {h.name} — {h.type}, {h.capacity} butacas{h.status !== 'active' ? ' (en mantenimiento)' : ''}
                </option>
              ))}
            </select>
            {lockNote && <p id={hintId('hallId')} className="mv-hint">{lockNote}</p>}
            <FieldErr id="sc-hallId-err" text={errText('hallId')} />
          </div>
        </fieldset>

        <fieldset className="mv-fieldset">
          <legend>Horario</legend>
          <div className="mv-row">
            <div className="mv-field">
              <label htmlFor="sc-date">Fecha (obligatorio)</label>
              <input className="input" type="date" {...fp('date', { hint: true })} value={form.date} disabled={locked} onChange={(e) => set('date', e.target.value)}
                min={range && !range.empty ? range.from : undefined} max={range && !range.empty && range.to ? range.to : undefined} />
              <p id={hintId('date')} className="mv-hint">
                {lockNote ?? (!range ? 'Elige una película para ver las fechas en que se puede programar.'
                  : range.empty ? `Esta película ya no tiene fechas disponibles en esta sede${range.periodEnd ? ` (su periodo ${range.ended ? 'terminó' : 'termina'} el ${longDate(range.periodEnd)})` : ''}.`
                    : `Puedes programar ${range.to ? `del ${longDate(range.from)} al ${longDate(range.to)}` : `desde el ${longDate(range.from)}, sin fecha de cierre`}.`)}
              </p>
              {!lockNote && range?.empty && (
                can('edit_movie')
                  ? <Link className="btn btn-secondary btn-sm mv-wrap" style={{ alignSelf: 'flex-start' }} to="/movies" state={{ editMovieId: movie.id }}>Editar las fechas de {movie.title}</Link>
                  : <p className="mv-hint">Pide al administrador central que actualice las fechas de esta película.</p>
              )}
              <FieldErr id="sc-date-err" text={errText('date')} />
            </div>
            <fieldset className="mv-time" disabled={locked}>
              <legend>Hora de inicio (obligatorio)</legend>
              <div className="mv-time-selects">
                <div className="mv-field">
                  <label htmlFor="sc-startTime">Hora</label>
                  <select className="select" {...fp('startTime', { hint: true })} value={form.hh} onChange={(e) => setTime('hh', e.target.value)}>
                    <option value="">--</option>
                    {HOURS.map((h) => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
                <div className="mv-field">
                  <label htmlFor="sc-startTime-mm">Minutos</label>
                  <select className="select" {...fp('startTime', { hint: true })} id="sc-startTime-mm" value={form.mm} onChange={(e) => setTime('mm', e.target.value)}>
                    <option value="">--</option>
                    {MINUTES.map((m) => <option key={m} value={m}>{m}</option>)}
                    {offStep && <option value={form.mm}>{form.mm} (fuera de paso)</option>}
                  </select>
                </div>
              </div>
              <p id={hintId('startTime')} className="mv-hint">{lockNote ?? `En pasos de ${START_STEP_MINUTES} minutos, con al menos ${MIN_LEAD_MINUTES} minutos de anticipación.${offStep ? ' Esta función tiene minutos fuera de paso: elige otros para guardar.' : ''}`}</p>
              <FieldErr id="sc-startTime-err" text={errText('startTime')} />
            </fieldset>
          </div>
          <p className="mv-hint" role="status" aria-live="polite" id="sc-preview">
            {endTime ? `Termina a las ${endTime}. La sala queda ocupada hasta las ${busyUntil} (incluye ${CLEANING_MINUTES} minutos de limpieza).` : 'Elige película y hora para ver a qué hora termina.'}
            {localClash && (<span className="mv-error-text"> Aviso: parece chocar con {clashMovie}, {localClash.startTime} a {localClash.endTime} en {hall.name}. El servidor lo confirmará al guardar.</span>)}
          </p>
        </fieldset>

        <fieldset className="mv-fieldset">
          <legend>Proyección y precio</legend>
          <div className="mv-row">
            <div className="mv-field">
              <label htmlFor="sc-format">Formato (obligatorio)</label>
              <select className="select" {...fp('format', { hint: true })} value={form.format} disabled={locked} onChange={(e) => set('format', e.target.value)}>
                <option value="">Elige un formato</option>
                {formatOptions.map((f) => <option key={f} value={f}>{f}</option>)}
              </select>
              <p id={hintId('format')} className="mv-hint">{lockNote ?? 'Según la película, la sede y la sala (una sala 3D también proyecta 2D).'}</p>
              <FieldErr id="sc-format-err" text={errText('format')} />
            </div>
            <div className="mv-field">
              <label htmlFor="sc-language">Idioma (obligatorio)</label>
              <select className="select" {...fp('language')} value={form.language} disabled={locked} onChange={(e) => set('language', e.target.value)}>
                {LANGUAGES.map((l) => <option key={l} value={l}>{l === 'ES' ? 'Doblada al español' : 'Subtitulada (inglés)'}</option>)}
              </select>
              <FieldErr id="sc-language-err" text={errText('language')} />
            </div>
          </div>
          <div className="mv-field">
            <label htmlFor="sc-price">Precio por entrada en soles (obligatorio)</label>
            <input className="input" inputMode="decimal" {...fp('price', { hint: true })} value={form.price} onChange={(e) => { setPriceTouched(true); set('price', e.target.value); }} />
            <p id={hintId('price')} className="mv-hint">Mayor que 0 y hasta S/ {MAX_TICKET_PRICE}, con 2 decimales como máximo.{hall && !editing ? ` Por defecto, el precio base de ${hall.name}: ${money(hall.priceBase)}.` : ''}</p>
            <FieldErr id="sc-price-err" text={errText('price')} />
          </div>
          <label className="mv-check" htmlFor="sc-draft">
            <input type="checkbox" id="sc-draft" checked={form.draft} disabled={locked && !form.draft} onChange={(e) => set('draft', e.target.checked)} />
            <span>Guardar como borrador (no se ve en el sitio hasta publicarla)</span>
          </label>
        </fieldset>

        <div className="mv-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={busy}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Programar función'}</button>
        </div>
      </form>
    </dialog>
  );
}

// ───────────────────────── Cancelar función ─────────────────────────
function CancelDialog({ screening, movieTitle, hallName, onClose, onDone }) {
  const ref = useRef(null);
  const [reason, setReason] = useState('');
  const [confirm, setConfirm] = useState(false);
  const [errs, setErrs] = useState({});
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  const submit = async (e) => {
    e.preventDefault();
    const le = {};
    if (!reason.trim()) le.reason = 'Escribe el motivo de la cancelación.';
    if (!confirm) le.confirm = 'Marca la casilla para confirmar.';
    setErrs(le); setMessage('');
    if (Object.keys(le).length) { document.getElementById(le.reason ? 'cn-reason' : 'cn-confirm')?.focus(); return; }
    setBusy(true);
    const res = await adminApi.screenings.cancel(screening.id, { version: screening.version, confirm: true, reason: reason.trim() });
    setBusy(false);
    if (res.ok) { onDone(res.data); ref.current?.close(); return; }
    setMessage(res.error === 'stale' ? 'Otra persona cambió esta función. Cierra este cuadro y revisa los datos actualizados.'
      : res.error === 'already_cancelled' ? 'Esta función ya estaba cancelada.'
        : res.error === 'not_cancellable' ? 'Esta función ya terminó y no se puede cancelar.' : 'No se pudo cancelar. Inténtalo de nuevo.');
  };
  return (
    <dialog ref={ref} className="mv-dialog" style={{ width: 'min(560px, calc(100vw - 32px))' }} aria-labelledby="cn-title" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <h2 id="cn-title">Cancelar función</h2>
        <p><strong>{movieTitle}</strong>, {screening.date} a las {screening.startTime}, {hallName}.</p>
        {screening.hasSales && (
          <p className="mv-summary" role="note">
            <strong>Tiene {screening.bookedSeats} entrada(s) vendida(s).</strong> Al cancelarla, sus órdenes quedarán <strong>reembolsadas
            (simulado)</strong> y las butacas, libres; el cliente lo verá en sus entradas. La función no se borra: queda como cancelada.
          </p>
        )}
        <p>La función dejará de verse en el sitio público. Esta acción no se puede deshacer desde esta pantalla.</p>
        <div className="mv-field">
          <label htmlFor="cn-reason">Motivo (obligatorio)</label>
          <textarea id="cn-reason" rows={3} maxLength={300} value={reason} onChange={(e) => { setReason(e.target.value); setErrs((p) => ({ ...p, reason: undefined })); }}
            aria-invalid={errs.reason ? 'true' : undefined} aria-describedby={`cn-reason-hint${errs.reason ? ' cn-reason-err' : ''}`} />
          <p id="cn-reason-hint" className="mv-hint">Máximo 300 caracteres. No incluyas datos personales de clientes.</p>
          {errs.reason && <p id="cn-reason-err" className="mv-field-error">{errs.reason}</p>}
        </div>
        <label className="mv-check" htmlFor="cn-confirm">
          <input type="checkbox" id="cn-confirm" checked={confirm} onChange={(e) => { setConfirm(e.target.checked); setErrs((p) => ({ ...p, confirm: undefined })); }}
            aria-invalid={errs.confirm ? 'true' : undefined} aria-describedby={errs.confirm ? 'cn-confirm-err' : undefined} />
          <span>Confirmo que quiero cancelar esta función{screening.hasSales ? ' y reembolsar (simulado) sus entradas' : ''}.</span>
        </label>
        {errs.confirm && <p id="cn-confirm-err" className="mv-field-error">{errs.confirm}</p>}
        {message && <p className="mv-error-text" role="alert">{message}</p>}
        <div className="mv-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={busy}>Volver</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Cancelando…' : 'Cancelar la función'}</button>
        </div>
      </form>
    </dialog>
  );
}

// ───────────────────────── Página ─────────────────────────
export default function Scheduling() {
  const { adminScreenings, adminMovies, adminError, branches, halls, can, isAdminCentral, currentUser, refreshAll } = useCinema();
  const [branch, setBranch] = useState('');
  const [hall, setHall] = useState('');
  const [date, setDate] = useState('');
  const [status, setStatus] = useState('');
  const [past, setPast] = useState(false);
  const [dialog, setDialog] = useState(null);       // { screening } | { screening: null }
  const [cancelling, setCancelling] = useState(null);
  const [flash, setFlash] = useState({ text: '', error: false });
  const headingRef = useRef(null);
  useEffect(() => { document.title = 'Programación · Cinerama'; headingRef.current?.focus(); }, []);

  const today = todayInLima();
  const canWrite = can('create_screening');
  const canCancel = can('cancel_screening');
  const myBranch = currentUser?.branchId ?? null;
  const movieTitle = (id) => adminMovies?.find((m) => m.id === id)?.title ?? `Película ${id}`;
  const hallOf = (id) => halls.find((h) => h.id === id);
  const branchName = (id) => branches.find((b) => b.id === id)?.name ?? `Sede ${id}`;
  const hallsForFilter = halls.filter((h) => (isAdminCentral ? (!branch || h.branchId === Number(branch)) : h.branchId === myBranch));

  const rows = useMemo(() => (adminScreenings ?? []).filter((s) => {
    if (isAdminCentral && branch && s.branchId !== Number(branch)) return false;
    if (hall && s.hallId !== Number(hall)) return false;
    if (status && s.status !== status) return false;
    if (date) return s.date === date;
    return past || s.date >= today;
  }), [adminScreenings, isAdminCentral, branch, hall, status, date, past, today]);

  const byDay = useMemo(() => {
    const m = new Map();
    for (const s of [...rows].sort((a, b) => a.date.localeCompare(b.date) || (hallOf(a.hallId)?.name ?? '').localeCompare(hallOf(b.hallId)?.name ?? '') || a.startTime.localeCompare(b.startTime))) {
      if (!m.has(s.date)) m.set(s.date, []);
      m.get(s.date).push(s);
    }
    return [...m.entries()];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, halls]);

  const say = (text, error = false) => setFlash({ text, error });
  const onSaved = (s, wasEdit) => { refreshAll(); say(wasEdit ? 'Función actualizada.' : `Función programada: ${movieTitle(s.movieId)}, ${s.date} a las ${s.startTime}.`); };
  const readOnly = !canWrite;

  return (
    <div className="mv-page">
      <div className="page-header">
        <div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>{isAdminCentral ? 'Programación de funciones' : 'Mis funciones'}</h1>
          <p className="page-subtitle">{isAdminCentral ? 'Todas las sedes, por día y sala' : `Funciones de ${branchName(myBranch)}, por día y sala`}</p>
        </div>
        {canWrite && (
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ screening: null })} disabled={!adminMovies || !adminScreenings}>
            <Plus size={16} aria-hidden="true" /> Programar función
          </button>
        )}
      </div>

      {readOnly && (
        <div className="perm-notice" role="note">
          <ShieldAlert size={14} aria-hidden="true" />
          <span>Vista de solo lectura. Solo el <strong>gerente de la sede</strong> o el <strong>administrador central</strong> programan funciones.</span>
        </div>
      )}

      <p className={`mv-flash${flash.error ? ' mv-error-text' : ''}`} role="status" hidden={!flash.text}>{flash.text}</p>
      {adminError && !adminScreenings && (
        <div role="alert" className="mv-flash mv-error-text">No se pudieron cargar las funciones. <button type="button" className="btn btn-secondary btn-sm" onClick={refreshAll}>Reintentar</button></div>
      )}
      {!adminScreenings && !adminError && <p role="status">Cargando funciones…</p>}

      {adminScreenings && (
        <>
          <div className="mv-toolbar" role="search" aria-label="Filtrar funciones">
            {isAdminCentral && (
              <div className="mv-filter">
                <label htmlFor="sc-f-branch">Sede</label>
                <select id="sc-f-branch" className="select" value={branch} onChange={(e) => { setBranch(e.target.value); setHall(''); }}>
                  <option value="">Todas las sedes</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div className="mv-filter">
              <label htmlFor="sc-f-hall">Sala</label>
              <select id="sc-f-hall" className="select" value={hall} onChange={(e) => setHall(e.target.value)}>
                <option value="">Todas las salas</option>
                {hallsForFilter.map((h) => <option key={h.id} value={h.id}>{isAdminCentral ? `${branchName(h.branchId)} — ${h.name}` : h.name}</option>)}
              </select>
            </div>
            <div className="mv-filter">
              <label htmlFor="sc-f-date">Día</label>
              <input id="sc-f-date" className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </div>
            <div className="mv-filter">
              <label htmlFor="sc-f-status">Estado</label>
              <select id="sc-f-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Todos los estados</option>
                {Object.entries(SCREENING_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <label className="mv-check" htmlFor="sc-f-past" style={{ marginBottom: 6 }}>
              <input type="checkbox" id="sc-f-past" checked={past} disabled={!!date} onChange={(e) => setPast(e.target.checked)} />
              <span>Incluir días pasados</span>
            </label>
          </div>

          <p className="sr-only" role="status">{rows.length === 1 ? '1 función' : `${rows.length} funciones`}</p>

          {byDay.length === 0 && <div className="empty-state"><p>No hay funciones con esos filtros.</p></div>}
          {byDay.map(([d, list]) => (
            <section key={d} aria-labelledby={`sc-day-${d}`} className="sc-day">
              <h2 id={`sc-day-${d}`} className="sc-day-title">{dayLabel(d)}{d === today ? ' (hoy)' : ''}</h2>
              <div className="table-wrapper card" style={{ padding: 0 }}>
                <table className="table mv-table">
                  <caption className="sr-only">Funciones del {dayLabel(d)}, ordenadas por sala y hora</caption>
                  <thead>
                    <tr>
                      <th scope="col">Hora</th><th scope="col">Sala</th><th scope="col">Película</th><th scope="col">Formato</th>
                      <th scope="col">Precio</th><th scope="col">Butacas vendidas</th><th scope="col">Estado</th>
                      {(canWrite || canCancel) && <th scope="col">Acciones</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {list.map((s) => {
                      const h = hallOf(s.hallId);
                      const open = s.status !== 'cancelled' && s.status !== 'finished';
                      return (
                        <tr key={s.id}>
                          <td>{s.startTime}–{s.endTime}</td>
                          <td>{isAdminCentral && <div className="mv-sub">{branchName(s.branchId)}</div>}{h?.name ?? `Sala ${s.hallId}`}</td>
                          <td><span className="mv-title">{movieTitle(s.movieId)}</span></td>
                          <td>{s.format} · {s.language === 'ES' ? 'Doblada' : 'Subtitulada'}</td>
                          <td>{money(s.price)}</td>
                          <td>{s.bookedSeats}/{s.totalSeats}{s.hasSales && <span className="mv-sub"> (con ventas)</span>}</td>
                          <td><span className={`badge ${STATUS_BADGE[s.status] ?? 'badge-muted'}`}>{SCREENING_STATUS_LABELS[s.status] ?? s.status}</span>
                            {s.cancelReason && <div className="mv-sub">Motivo: {s.cancelReason}</div>}</td>
                          {(canWrite || canCancel) && (
                            <td>
                              {open ? (
                                <div className="mv-actions">
                                  {canWrite && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ screening: s })}>Editar<span className="sr-only"> función de {movieTitle(s.movieId)} a las {s.startTime}, {h?.name}</span></button>}
                                  {canCancel && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setCancelling(s)}>Cancelar<span className="sr-only"> función de {movieTitle(s.movieId)} a las {s.startTime}, {h?.name}</span></button>}
                                </div>
                              ) : <span className="mv-sub">—</span>}
                            </td>
                          )}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </section>
          ))}

          <section aria-labelledby="sc-halls" className="sc-day">
            <h2 id="sc-halls" className="sc-day-title">Salas{isAdminCentral ? '' : ` de ${branchName(myBranch)}`}</h2>
            <div className="table-wrapper card" style={{ padding: 0 }}>
              <table className="table mv-table">
                <caption className="sr-only">Salas y su estado de mantenimiento</caption>
                <thead><tr><th scope="col">Sala</th><th scope="col">Tipo</th><th scope="col">Butacas</th><th scope="col">Precio base</th><th scope="col">Estado</th>{(can('block_hall') || can('edit_hall')) && <th scope="col">Mantenimiento</th>}</tr></thead>
                <tbody>
                  {hallsForFilter.map((h) => (
                    <tr key={h.id}>
                      <td>{isAdminCentral && <div className="mv-sub">{branchName(h.branchId)}</div>}{h.name}</td>
                      <td>{h.type}</td><td>{h.capacity}</td><td>{money(h.priceBase)}</td>
                      <td><span className={`badge ${h.status === 'active' ? 'badge-green' : 'badge-orange'}`}>{h.status === 'active' ? 'Activa' : 'En mantenimiento'}</span></td>
                      {(can('block_hall') || can('edit_hall')) && <td><HallStatusControl hall={h} onDone={(t) => say(t)} /></td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}

      {dialog && <ScreeningDialog key={dialog.screening?.id ?? 'new'} screening={dialog.screening} onClose={() => setDialog(null)} onSaved={onSaved} />}
      {cancelling && (
        <CancelDialog screening={cancelling} movieTitle={movieTitle(cancelling.movieId)} hallName={hallOf(cancelling.hallId)?.name}
          onClose={() => setCancelling(null)}
          onDone={(d) => { refreshAll(); say(d.refundedOrders > 0 ? `Función cancelada. ${d.refundedOrders} ${d.refundedOrders === 1 ? 'orden reembolsada' : 'órdenes reembolsadas'} (simulado) y butacas liberadas.` : 'Función cancelada.'); }} />
      )}
    </div>
  );
}
