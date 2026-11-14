import { useCallback, useEffect, useRef, useState } from 'react';
import { Plus, ShieldAlert, Copy } from 'lucide-react';
import { useCinema } from '../context/CinemaContext';
import { useAuth } from '../context/AuthContext';
import { adminApi } from '../api/admin';
import { PERMS, ROLE_LABELS, PERM_LABELS } from '../shared/permissions';
import './MovieManagement.css';

const STAFF_ROLES = ['admin', 'manager', 'cashier', 'support', 'operator'];
const STATUS_LABEL = { active: 'Activa', inactive: 'Desactivada', suspended: 'Suspendida por un reclamo', pending_verification: 'Sin verificar' };
const STATUS_BADGE = { active: 'badge-green', inactive: 'badge-muted', suspended: 'badge-orange', pending_verification: 'badge-muted' };
const TABS = [['staff', 'Personal'], ['customer', 'Clientes'], ['roles', 'Roles y permisos'], ['activity', 'Registros de actividad']];

const ERROR_TEXT = {
  name_required: 'Escribe el nombre (al menos 2 letras).', name_too_long: 'El nombre es demasiado largo.',
  email_required: 'Escribe el correo.', email_invalid: 'El correo no es válido.', email_too_long: 'El correo es demasiado largo.',
  email_taken: 'Ya existe una cuenta con ese correo.',
  required: 'Este campo es obligatorio.', invalid: 'El valor no es válido.', invalid_option: 'Elige una opción de la lista.',
};
const FIELD_LABEL = { name: 'Nombre', email: 'Correo', role: 'Rol', branchId: 'Sede' };

const fmtDate = (ms) => (ms ? new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms)) : '—');

const ACTION_LABEL = {
  'user.create': 'Creó una cuenta de personal', 'user.update': 'Actualizó una cuenta', 'user.reset_password': 'Restableció una contraseña',
  'user.change_password': 'Cambió su propia contraseña', 'movie.create': 'Creó una película', 'movie.update': 'Editó una película',
  'movie.enable': 'Habilitó una película en una sede', 'movie.disable': 'Quitó una película de una sede',
  'screening.create': 'Programó una función', 'screening.update': 'Editó una función', 'screening.cancel': 'Canceló una función',
  'hall.maintenance_on': 'Puso una sala en mantenimiento', 'hall.maintenance_off': 'Quitó el mantenimiento de una sala',
};
const ENTITY_LABEL = { user: 'cuenta', movie: 'película', screening: 'función', hall: 'sala' };
const FIELD_WORDS = { name: 'nombre', role: 'rol', branchId: 'sede', status: 'estado', title: 'título', price: 'precio', startTime: 'hora', date: 'fecha' };

// ───────────────────────── Piezas compartidas ─────────────────────────
function Pager({ page, pages, total, onPage, label }) {
  return (
    <nav className="us-pager" aria-label={`Paginación de ${label}`}>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPage(page - 1)} disabled={page <= 1}>Anterior</button>
      <span aria-live="polite">Página {page} de {pages} · {total} {total === 1 ? 'resultado' : 'resultados'}</span>
      <button type="button" className="btn btn-secondary btn-sm" onClick={() => onPage(page + 1)} disabled={page >= pages}>Siguiente</button>
    </nav>
  );
}

function Blocked({ error }) {
  if (error === 'demo_password') {
    return (
      <div className="us-notice" role="alert">
        <h2>Pantalla bloqueada por seguridad</h2>
        <p>
          Esta pantalla administra cuentas de personal y datos de clientes, así que no se abre mientras el administrador central
          conserve la contraseña de demostración (<code>Cinerama#2026</code>, publicada en el README).
        </p>
        <p>Cambia la contraseña desde una terminal, en la carpeta del proyecto:</p>
        <pre className="us-code" tabIndex={0}>npm run set-password -- admin@cinerama.com</pre>
        <p>El comando te pide la contraseña nueva sin mostrarla. Al terminar se cierran las sesiones abiertas de ese usuario: vuelve a iniciar sesión y recarga esta página.</p>
      </div>
    );
  }
  return <div className="us-notice" role="alert"><p>{error === 'forbidden' ? 'No tienes permiso para ver esta pantalla.' : error === 'unauthenticated' ? 'Tu sesión terminó. Inicia sesión de nuevo.' : 'No se pudo cargar. Inténtalo de nuevo.'}</p></div>;
}

// La contraseña temporal se muestra una sola vez, con botón de copiar y anuncio para lectores de pantalla.
function TempPassword({ password, email, onClose }) {
  const headRef = useRef(null);
  const [copied, setCopied] = useState('');
  useEffect(() => { headRef.current?.focus(); }, []);
  const copy = async () => {
    try { await navigator.clipboard.writeText(password); setCopied('Contraseña copiada al portapapeles.'); }
    catch { setCopied('No se pudo copiar automáticamente: selecciónala y cópiala con el teclado.'); document.getElementById('us-temp-pw')?.focus(); }
  };
  return (
    <div>
      <h2 tabIndex={-1} ref={headRef} id="us-temp-title">Contraseña temporal generada</h2>
      <p role="status">Se generó una contraseña temporal para <strong>{email}</strong>. <strong>Cópiala ahora: no se volverá a mostrar.</strong> Quien la reciba deberá cambiarla al iniciar sesión.</p>
      <p><code id="us-temp-pw" className="us-temp" tabIndex={0} aria-label={`Contraseña temporal: ${password.split('').join(' ')}`}>{password}</code></p>
      <div className="mv-dialog-actions" style={{ justifyContent: 'flex-start' }}>
        <button type="button" className="btn btn-primary" onClick={copy}><Copy size={14} aria-hidden="true" /> Copiar contraseña</button>
        <button type="button" className="btn btn-secondary" onClick={onClose}>Listo, ya la copié</button>
      </div>
      <p className="us-copied" role="status">{copied}</p>
    </div>
  );
}

function useDialog(onClose) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  return { ref, props: { ref, onClose } };
}

// ───────────────────────── Crear / editar personal ─────────────────────────
function UserDialog({ user, self, branches, onClose, onSaved }) {
  const { ref, props } = useDialog(onClose);
  const summaryRef = useRef(null);
  const editing = !!user;
  const [form, setForm] = useState({ name: user?.name ?? '', email: user?.email ?? '', role: user?.role ?? 'cashier', branchId: user?.branchId ? String(user.branchId) : '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [ackAdmin, setAckAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [issued, setIssued] = useState(null);
  const becomesAdmin = form.role === 'admin' && user?.role !== 'admin';
  const set = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => { if (!p[k]) return p; const n = { ...p }; delete n[k]; return n; }); };
  const fail = (errs, msg = '') => { setErrors(errs); setMessage(msg); requestAnimationFrame(() => summaryRef.current?.focus()); };

  const submit = async (e) => {
    e.preventDefault();
    const le = {};
    if (form.name.trim().length < 2) le.name = 'name_required';
    if (!editing) { if (!form.email.trim()) le.email = 'email_required'; else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) le.email = 'email_invalid'; }
    if (form.role !== 'admin' && !form.branchId) le.branchId = 'required';
    if (becomesAdmin && !ackAdmin) le.role = 'ack_admin';
    if (Object.keys(le).length) { fail(le); return; }
    setBusy(true); setMessage('');
    const body = { name: form.name.trim(), role: form.role, branchId: form.role === 'admin' ? null : Number(form.branchId) };
    const res = editing
      ? await adminApi.users.update(user.id, { name: body.name, ...(self ? {} : { role: body.role }), branchId: body.branchId })
      : await adminApi.users.create({ ...body, email: form.email.trim() });
    setBusy(false);
    if (res.ok) {
      onSaved(res.data.user, editing);
      if (res.data.temporaryPassword) setIssued({ password: res.data.temporaryPassword, email: res.data.user.email });
      else ref.current?.close();
      return;
    }
    const d = res.data ?? {};
    if (res.status === 400 && d.errors) fail(d.errors);
    else if (res.error === 'email_taken') fail({ email: 'email_taken' });
    else if (res.error === 'cannot_modify_self') fail({}, 'No puedes cambiar tu propio rol ni tu estado.');
    else if (res.error === 'last_admin') fail({}, 'No se puede: dejaría al sistema sin administrador central activo.');
    else if (res.error === 'not_staff') fail({}, 'Las cuentas de clientes no se editan aquí.');
    else if (res.error === 'too_many_attempts') fail({}, `Demasiadas contraseñas temporales emitidas. Espera ${Math.ceil((d.retryAfter ?? 60) / 60)} minuto(s).`);
    else if (res.error === 'demo_password') fail({}, 'La pantalla está bloqueada por la contraseña de demostración.');
    else fail({}, 'No se pudo guardar. Inténtalo de nuevo.');
  };
  const txt = (k) => (errors[k] === 'ack_admin' ? 'Marca la casilla para confirmar.' : ERROR_TEXT[errors[k]] ?? 'El valor no es válido.');
  const fp = (k, hint) => ({ id: `us-${k}`, 'aria-invalid': errors[k] ? 'true' : undefined, 'aria-describedby': [errors[k] ? `us-${k}-err` : null, hint ? `us-${k}-hint` : null].filter(Boolean).join(' ') || undefined });
  const entries = ['name', 'email', 'role', 'branchId'].filter((k) => errors[k]);

  return (
    <dialog {...props} className="mv-dialog" style={{ width: 'min(600px, calc(100vw - 32px))' }} aria-labelledby={issued ? 'us-temp-title' : 'us-title'}>
      {issued ? <TempPassword password={issued.password} email={issued.email} onClose={() => ref.current?.close()} /> : (
        <form onSubmit={submit} noValidate>
          <h2 id="us-title">{editing ? `Editar a ${user.name}` : 'Crear personal'}</h2>
          {!editing && <p className="mv-hint" style={{ marginBottom: 12 }}>Se genera una contraseña temporal que se muestra una sola vez. La persona deberá cambiarla en su primer ingreso.</p>}
          <div ref={summaryRef} tabIndex={-1}>
            {entries.length > 0 && (
              <div className="mv-summary" role="alert">
                <h3>{entries.length === 1 ? 'Hay 1 dato por corregir' : `Hay ${entries.length} datos por corregir`}</h3>
                <ul>{entries.map((k) => <li key={k}><a href={`#us-${k}`} onClick={(ev) => { ev.preventDefault(); document.getElementById(`us-${k}`)?.focus(); }}>{FIELD_LABEL[k]}</a>: {txt(k)}</li>)}</ul>
              </div>
            )}
            {message && <p className="mv-summary mv-error-text" role="alert">{message}</p>}
          </div>
          <div className="mv-field">
            <label htmlFor="us-name">Nombre completo (obligatorio)</label>
            <input className="input" {...fp('name')} value={form.name} onChange={(e) => set('name', e.target.value)} autoComplete="off" />
            {errors.name && <p id="us-name-err" className="mv-field-error">{txt('name')}</p>}
          </div>
          <div className="mv-field">
            <label htmlFor="us-email">Correo (obligatorio)</label>
            <input className="input" type="email" {...fp('email', editing)} value={form.email} onChange={(e) => set('email', e.target.value)} readOnly={editing} autoComplete="off" />
            {editing && <p id="us-email-hint" className="mv-hint">El correo no se cambia.</p>}
            {errors.email && <p id="us-email-err" className="mv-field-error">{txt('email')}</p>}
          </div>
          <div className="mv-row">
            <div className="mv-field">
              <label htmlFor="us-role">Rol (obligatorio)</label>
              <select className="select" {...fp('role', self)} value={form.role} onChange={(e) => set('role', e.target.value)} disabled={self}>
                {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
              </select>
              {self && <p id="us-role-hint" className="mv-hint">No puedes cambiar tu propio rol.</p>}
              {errors.role && <p id="us-role-err" className="mv-field-error">{txt('role')}</p>}
            </div>
            {form.role !== 'admin' && (
              <div className="mv-field">
                <label htmlFor="us-branchId">Sede (obligatorio)</label>
                <select className="select" {...fp('branchId')} value={form.branchId} onChange={(e) => set('branchId', e.target.value)}>
                  <option value="">Elige una sede</option>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
                {errors.branchId && <p id="us-branchId-err" className="mv-field-error">{txt('branchId')}</p>}
              </div>
            )}
          </div>
          {becomesAdmin && (
            <label className="mv-check" htmlFor="us-ack">
              <input type="checkbox" id="us-ack" checked={ackAdmin} onChange={(e) => { setAckAdmin(e.target.checked); setErrors((p) => ({ ...p, role: undefined })); }} />
              <span>Entiendo que el administrador central tiene acceso a toda la red, a los usuarios y a los reclamos de DNI.</span>
            </label>
          )}
          <div className="mv-dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={busy}>Cancelar</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear y generar contraseña'}</button>
          </div>
        </form>
      )}
    </dialog>
  );
}

// ───────────────────────── Activar/desactivar y restablecer ─────────────────────────
function ActionDialog({ kind, user, onClose, onDone }) {
  const { ref, props } = useDialog(onClose);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [issued, setIssued] = useState(null);
  const run = async () => {
    setBusy(true); setError('');
    const res = kind === 'reset' ? await adminApi.users.resetPassword(user.id) : await adminApi.users.update(user.id, { status: kind === 'deactivate' ? 'inactive' : 'active' });
    setBusy(false);
    if (res.ok) {
      onDone(res.data.user, kind);
      if (res.data.temporaryPassword) setIssued({ password: res.data.temporaryPassword, email: res.data.user.email }); else ref.current?.close();
      return;
    }
    setError(res.error === 'cannot_modify_self' ? 'No puedes hacerlo con tu propia cuenta.' : res.error === 'last_admin' ? 'No se puede: dejaría al sistema sin administrador central activo.'
      : res.error === 'status_locked' ? 'Esta cuenta está suspendida por un reclamo y no se cambia aquí.' : res.error === 'too_many_attempts' ? 'Demasiadas contraseñas temporales emitidas. Espera unos minutos.' : 'No se pudo completar. Inténtalo de nuevo.');
  };
  const title = kind === 'deactivate' ? `Desactivar a ${user.name}` : kind === 'activate' ? `Activar a ${user.name}` : `Restablecer la contraseña de ${user.name}`;
  return (
    <dialog {...props} className="mv-dialog" style={{ width: 'min(560px, calc(100vw - 32px))' }} aria-labelledby={issued ? 'us-temp-title' : 'us-act-title'}>
      {issued ? <TempPassword password={issued.password} email={issued.email} onClose={() => ref.current?.close()} /> : (
        <>
          <h2 id="us-act-title">{title}</h2>
          <p>
            {kind === 'deactivate' && 'Se cierran sus sesiones abiertas y no podrá iniciar sesión hasta que la actives de nuevo. No se borra nada.'}
            {kind === 'activate' && 'Podrá iniciar sesión de nuevo con su contraseña actual.'}
            {kind === 'reset' && 'Se genera una contraseña temporal (se muestra una sola vez), se cierran sus sesiones abiertas y tendrá que cambiarla al entrar.'}
          </p>
          {error && <p className="mv-error-text" role="alert">{error}</p>}
          <div className="mv-dialog-actions">
            <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={busy}>Cancelar</button>
            <button type="button" className="btn btn-primary" onClick={run} disabled={busy}>{busy ? 'Guardando…' : kind === 'deactivate' ? 'Desactivar cuenta' : kind === 'activate' ? 'Activar cuenta' : 'Restablecer contraseña'}</button>
          </div>
        </>
      )}
    </dialog>
  );
}

// ───────────────────────── Listas ─────────────────────────
function useList(kind, params) {
  const [state, setState] = useState({ loading: true });
  const [tick, setTick] = useState(0);
  const key = JSON.stringify(params);
  useEffect(() => {
    let cancelled = false;
    adminApi.users.list({ kind, ...params }).then((res) => { if (!cancelled) setState(res.ok ? { ...res.data } : { error: res.error }); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, key, tick]);
  const reload = useCallback(() => setTick((n) => n + 1), []);
  return [state, reload, () => setState({ loading: true })];
}

function StaffTab({ branches, me, flash }) {
  const [q, setQ] = useState(''); const [applied, setApplied] = useState({ q: '', role: '', status: '', branchId: '' });
  const [role, setRole] = useState(''); const [status, setStatus] = useState(''); const [branchId, setBranchId] = useState('');
  const [page, setPage] = useState(1);
  const [state, reload, markLoading] = useList('staff', { ...applied, page });
  const [dialog, setDialog] = useState(null);
  const branchName = (id) => branches.find((b) => b.id === id)?.name ?? '—';
  const apply = (e) => { e.preventDefault(); markLoading(); setPage(1); setApplied({ q: q.trim(), role, status, branchId }); };
  const saved = (u, edit) => { reload(); flash(edit ? `Cuenta de ${u.name} actualizada.` : `Cuenta de ${u.name} creada.`); };
  const done = (u, kind) => { reload(); flash(kind === 'reset' ? `Contraseña de ${u.name} restablecida.` : kind === 'deactivate' ? `${u.name} fue desactivada.` : `${u.name} fue activada.`); };

  if (state.error) return <Blocked error={state.error} />;
  return (
    <>
      <div className="us-bar">
        <form className="mv-toolbar" role="search" aria-label="Buscar y filtrar personal" onSubmit={apply} style={{ flex: 1, marginBottom: 0 }}>
          <div className="mv-filter mv-filter-grow"><label htmlFor="us-q">Buscar por nombre o correo</label><input id="us-q" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} autoComplete="off" /></div>
          <div className="mv-filter"><label htmlFor="us-f-role">Rol</label><select id="us-f-role" className="select" value={role} onChange={(e) => setRole(e.target.value)}><option value="">Todos los roles</option>{STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}</select></div>
          <div className="mv-filter"><label htmlFor="us-f-branch">Sede</label><select id="us-f-branch" className="select" value={branchId} onChange={(e) => setBranchId(e.target.value)}><option value="">Todas las sedes</option>{branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></div>
          <div className="mv-filter"><label htmlFor="us-f-status">Estado</label><select id="us-f-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option><option value="active">Activa</option><option value="inactive">Desactivada</option><option value="suspended">Suspendida</option></select></div>
          <button type="submit" className="btn btn-secondary">Aplicar</button>
        </form>
        <button type="button" className="btn btn-primary" onClick={() => setDialog({ kind: 'user', user: null })}><Plus size={16} aria-hidden="true" /> Crear personal</button>
      </div>
      {state.loading && <p role="status">Cargando personal…</p>}
      {state.users && (
        <>
          <p className="sr-only" role="status">{state.total === 1 ? '1 cuenta de personal' : `${state.total} cuentas de personal`}</p>
          {state.users.length === 0 ? <div className="empty-state"><p>No hay personal con esos filtros.</p></div> : (
            <div className="table-wrapper card" style={{ padding: 0 }}>
              <table className="table mv-table">
                <caption className="sr-only">Cuentas de personal</caption>
                <thead><tr><th scope="col">Persona</th><th scope="col">Correo</th><th scope="col">Rol</th><th scope="col">Sede</th><th scope="col">Estado</th><th scope="col">Último acceso</th><th scope="col">Acciones</th></tr></thead>
                <tbody>
                  {state.users.map((u) => {
                    const mine = u.id === me.id; const locked = u.status !== 'active' && u.status !== 'inactive';
                    return (
                      <tr key={u.id}>
                        <th scope="row" className="us-name">{u.name}{mine && <span className="mv-sub"> (tú)</span>}{u.mustChangePassword && <div className="mv-sub">Contraseña temporal pendiente</div>}</th>
                        <td>{u.email}</td>
                        <td>{ROLE_LABELS[u.role] ?? u.role}</td>
                        <td>{u.role === 'admin' ? 'Toda la red' : branchName(u.branchId)}</td>
                        <td><span className={`badge ${STATUS_BADGE[u.status] ?? 'badge-muted'}`}>{STATUS_LABEL[u.status] ?? u.status}</span></td>
                        <td>{u.lastLogin ?? '—'}</td>
                        <td>
                          <div className="mv-actions">
                            <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: 'user', user: u })}>Editar<span className="sr-only"> a {u.name}</span></button>
                            {!mine && !locked && (u.status === 'active'
                              ? <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: 'deactivate', user: u })}>Desactivar<span className="sr-only"> a {u.name}</span></button>
                              : <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: 'activate', user: u })}>Activar<span className="sr-only"> a {u.name}</span></button>)}
                            {!mine && !locked && <button type="button" className="btn btn-secondary btn-sm" onClick={() => setDialog({ kind: 'reset', user: u })}>Restablecer contraseña<span className="sr-only"> de {u.name}</span></button>}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={state.page} pages={state.pages} total={state.total} label="personal" onPage={(p) => { markLoading(); setPage(p); }} />
        </>
      )}
      {dialog?.kind === 'user' && <UserDialog key={dialog.user?.id ?? 'new'} user={dialog.user} self={dialog.user?.id === me.id} branches={branches} onClose={() => setDialog(null)} onSaved={saved} />}
      {['deactivate', 'activate', 'reset'].includes(dialog?.kind) && <ActionDialog key={`${dialog.kind}-${dialog.user.id}`} kind={dialog.kind} user={dialog.user} onClose={() => setDialog(null)} onDone={done} />}
    </>
  );
}

function CustomersTab() {
  const [q, setQ] = useState(''); const [applied, setApplied] = useState({ q: '', status: '' }); const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [state, , markLoading] = useList('customer', { ...applied, page });
  const apply = (e) => { e.preventDefault(); markLoading(); setPage(1); setApplied({ q: q.trim(), status }); };
  if (state.error) return <Blocked error={state.error} />;
  return (
    <>
      <p className="mv-hint" style={{ marginBottom: 12 }}>Por privacidad se muestran el DNI (solo los últimos 3 dígitos), el correo y el celular parcialmente. Las cuentas de clientes no se editan desde aquí.</p>
      <form className="mv-toolbar" role="search" aria-label="Buscar y filtrar clientes" onSubmit={apply}>
        <div className="mv-filter mv-filter-grow"><label htmlFor="us-cq">Buscar por nombre o correo</label><input id="us-cq" className="input" type="search" value={q} onChange={(e) => setQ(e.target.value)} maxLength={80} autoComplete="off" /></div>
        <div className="mv-filter"><label htmlFor="us-cstatus">Estado</label><select id="us-cstatus" className="select" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Todos</option><option value="active">Activa</option><option value="inactive">Desactivada</option><option value="suspended">Suspendida</option></select></div>
        <button type="submit" className="btn btn-secondary">Aplicar</button>
      </form>
      {state.loading && <p role="status">Cargando clientes…</p>}
      {state.users && (
        <>
          <p className="sr-only" role="status">{state.total === 1 ? '1 cliente' : `${state.total} clientes`}</p>
          {state.users.length === 0 ? <div className="empty-state"><p>No hay clientes con esos filtros.</p></div> : (
            <div className="table-wrapper card" style={{ padding: 0 }}>
              <table className="table mv-table">
                <caption className="sr-only">Cuentas de clientes (datos parcialmente ocultos)</caption>
                <thead><tr><th scope="col">Nombre</th><th scope="col">Correo</th><th scope="col">DNI</th><th scope="col">Celular</th><th scope="col">Estado</th><th scope="col">Registro</th><th scope="col">Último acceso</th></tr></thead>
                <tbody>
                  {state.users.map((u) => (
                    <tr key={u.id}>
                      <th scope="row" className="us-name">{u.name}</th>
                      <td>{u.emailMasked}</td>
                      <td>{u.dniHint ? <span aria-label={`DNI terminado en ${u.dniHint}`}>•••••{u.dniHint}</span> : '—'}</td>
                      <td>{u.phoneMasked ?? '—'}</td>
                      <td><span className={`badge ${STATUS_BADGE[u.status] ?? 'badge-muted'}`}>{STATUS_LABEL[u.status] ?? u.status}</span></td>
                      <td>{fmtDate(u.createdAt)}</td>
                      <td>{u.lastLogin ?? '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pager page={state.page} pages={state.pages} total={state.total} label="clientes" onPage={(p) => { markLoading(); setPage(p); }} />
        </>
      )}
    </>
  );
}

function RolesTab() {
  const [counts, setCounts] = useState(null);
  useEffect(() => { adminApi.users.list({ kind: 'staff' }).then((r) => { if (r.ok) setCounts(r.data.roleCounts); }); }, []);
  return (
    <>
      <p className="mv-hint" style={{ marginBottom: 12 }}>Lo que cada rol puede hacer. El servidor aplica estos mismos permisos: ocultar un botón no basta.</p>
      <div className="grid-2">
        {STAFF_ROLES.map((r) => (
          <section key={r} className="card us-role" aria-labelledby={`us-role-${r}`}>
            <h2 id={`us-role-${r}`}>{ROLE_LABELS[r]}</h2>
            <p className="mv-sub">{counts ? `${counts[r] ?? 0} ${(counts[r] ?? 0) === 1 ? 'cuenta' : 'cuentas'}` : 'Contando cuentas…'} · {r === 'admin' ? 'acceso a toda la red' : 'limitado a su sede'}</p>
            <ul>{PERMS[r].map((p) => <li key={p}>{PERM_LABELS[p] ?? p}</li>)}</ul>
          </section>
        ))}
      </div>
    </>
  );
}

function ActivityTab() {
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ loading: true });
  useEffect(() => { let c = false; adminApi.users.audit(page).then((r) => { if (!c) setState(r.ok ? r.data : { error: r.error }); }); return () => { c = true; }; }, [page]);
  if (state.error) return <Blocked error={state.error} />;
  if (state.loading) return <p role="status">Cargando registros…</p>;
  const detail = (e) => {
    const parts = [];
    if (e.detail?.fields) parts.push(`Cambió: ${e.detail.fields.map((f) => FIELD_WORDS[f] ?? f).join(', ')}`);
    if (e.detail?.role) parts.push(`Rol: ${ROLE_LABELS[e.detail.role] ?? e.detail.role}`);
    if (e.detail?.sold) parts.push('Tenía entradas vendidas');
    return parts.join(' · ') || '—';
  };
  return (
    <>
      <p className="mv-hint" style={{ marginBottom: 12 }}>Registro de los cambios hechos en el panel. Solo guarda códigos y números de identificación, nunca contraseñas ni datos de clientes.</p>
      {state.entries.length === 0 ? <div className="empty-state"><p>Todavía no hay actividad registrada.</p></div> : (
        <div className="table-wrapper card" style={{ padding: 0 }}>
          <table className="table mv-table">
            <caption className="sr-only">Registros de actividad, del más reciente al más antiguo</caption>
            <thead><tr><th scope="col">Fecha</th><th scope="col">Quién</th><th scope="col">Qué pasó</th><th scope="col">Sobre</th><th scope="col">Detalle</th></tr></thead>
            <tbody>
              {state.entries.map((e) => (
                <tr key={e.id}>
                  <td>{fmtDate(e.at)}</td><td>{e.actorName ?? '—'}</td><td>{ACTION_LABEL[e.action] ?? e.action}</td>
                  <td>{ENTITY_LABEL[e.entity] ?? e.entity} n.º {e.entityId ?? '—'}</td><td>{detail(e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pager page={state.page} pages={state.pages} total={state.total} label="registros" onPage={(p) => { setState({ loading: true }); setPage(p); }} />
    </>
  );
}

// ───────────────────────── Página ─────────────────────────
export default function UsersAccess() {
  const { branches } = useCinema();
  const { user: me } = useAuth();
  const [tab, setTab] = useState('staff');
  const [flash, setFlash] = useState('');
  const headingRef = useRef(null);
  useEffect(() => { document.title = 'Usuarios y accesos · Cinerama'; headingRef.current?.focus(); }, []);
  return (
    <div className="mv-page us-page">
      <div className="page-header">
        <div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>Usuarios y accesos</h1>
          <p className="page-subtitle">Cuentas del personal y de clientes, roles y registro de actividad</p>
        </div>
      </div>
      <div className="perm-notice" role="note">
        <ShieldAlert size={14} aria-hidden="true" />
        <span>Nunca se muestran contraseñas ni DNI completos. Las contraseñas temporales se ven una sola vez al crearlas o restablecerlas.</span>
      </div>
      <div className="tabs mb-4" role="group" aria-label="Secciones">
        {TABS.map(([k, label]) => <button key={k} type="button" className={`tab ${tab === k ? 'active' : ''}`} aria-pressed={tab === k} onClick={() => { setTab(k); setFlash(''); }}>{label}</button>)}
      </div>
      <p className="mv-flash" role="status" hidden={!flash}>{flash}</p>
      {tab === 'staff' && <StaffTab branches={branches} me={me} flash={setFlash} />}
      {tab === 'customer' && <CustomersTab />}
      {tab === 'roles' && <RolesTab />}
      {tab === 'activity' && <ActivityTab />}
    </div>
  );
}
