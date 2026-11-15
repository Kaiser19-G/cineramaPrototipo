import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useCinema } from '../context/CinemaContext';
import { PASSWORD_MIN, PASSWORD_MAX } from '../shared/validators';
import './MovieManagement.css';

const TEXT = {
  required: 'Escribe tu contraseña actual.', password_required: 'Escribe la contraseña nueva.',
  password_short: `La contraseña nueva necesita al menos ${PASSWORD_MIN} caracteres.`, password_long: `La contraseña nueva admite hasta ${PASSWORD_MAX} caracteres.`,
  password_same: 'La contraseña nueva debe ser distinta de la actual.', password_demo: 'Esa es la contraseña de demostración: elige otra.',
  invalid_current_password: 'La contraseña actual no es correcta.', mismatch: 'Las dos contraseñas nuevas no coinciden.',
};

// Cambio de contraseña. `forced`: la cuenta tiene una contraseña temporal y no puede usar el panel hasta cambiarla.
export default function ChangePassword({ forced = false }) {
  const { user, changePassword } = useAuth();
  const navigate = useNavigate();
  const { refreshAll } = useCinema();
  const headRef = useRef(null);
  const summaryRef = useRef(null);
  const [form, setForm] = useState({ current: '', next: '', again: '' });
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { document.title = 'Cambiar contraseña · Cinerama'; headRef.current?.focus(); }, []);

  const set = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => ({ ...p, [k]: undefined })); };
  const fail = (e, m = '') => { setErrors(e); setMessage(m); requestAnimationFrame(() => summaryRef.current?.focus()); };
  const submit = async (ev) => {
    ev.preventDefault();
    const le = {};
    if (!form.current) le.current = 'required';
    if (!form.next) le.next = 'password_required'; else if (form.next.length < PASSWORD_MIN) le.next = 'password_short'; else if (form.next.length > PASSWORD_MAX) le.next = 'password_long'; else if (form.next === form.current) le.next = 'password_same';
    if (!le.next && form.again !== form.next) le.again = 'mismatch';
    if (Object.keys(le).length) { fail(le); return; }
    setBusy(true); setMessage('');
    const res = await changePassword(form.current, form.next);
    setBusy(false);
    if (res.ok) { refreshAll(); setDone(true); setForm({ current: '', next: '', again: '' }); if (forced) navigate('/dashboard', { replace: true }); return; }
    const d = res.data ?? {};
    if (res.status === 400 && d.errors) fail({ current: d.errors.currentPassword, next: d.errors.newPassword });
    else if (res.error === 'invalid_current_password') fail({ current: 'invalid_current_password' });
    else if (res.error === 'too_many_attempts') fail({}, `Demasiados intentos. Espera ${Math.ceil((d.retryAfter ?? 60) / 60)} minuto(s) e inténtalo de nuevo.`);
    else fail({}, 'No se pudo cambiar la contraseña. Inténtalo de nuevo.');
  };
  const entries = ['current', 'next', 'again'].filter((k) => errors[k]);
  const LABEL = { current: 'Contraseña actual', next: 'Contraseña nueva', again: 'Repite la contraseña nueva' };
  const fp = (k, hint) => ({ id: `pw-${k}`, 'aria-invalid': errors[k] ? 'true' : undefined, 'aria-describedby': [errors[k] ? `pw-${k}-err` : null, hint ? `pw-${k}-hint` : null].filter(Boolean).join(' ') || undefined });

  return (
    <div className="mv-page pw-page">
      <div className="page-header"><div>
        <h1 className="page-title" tabIndex={-1} ref={headRef}>{forced ? 'Cambia tu contraseña para continuar' : 'Cambiar contraseña'}</h1>
        <p className="page-subtitle">{user?.name} · {user?.email}</p>
      </div></div>
      {forced && <div className="us-notice" role="note"><p>Tu cuenta tiene una <strong>contraseña temporal</strong>. Por seguridad, hasta que la cambies no puedes usar el panel. Escribe la temporal como contraseña actual y elige una nueva que solo tú conozcas.</p></div>}
      <p className="mv-flash" role="status" hidden={!done}>{done ? 'Contraseña cambiada. Las demás sesiones de tu cuenta se cerraron.' : ''}</p>
      <form onSubmit={submit} noValidate className="card pw-card">
        <div ref={summaryRef} tabIndex={-1}>
          {entries.length > 0 && (
            <div className="mv-summary" role="alert">
              <h3>{entries.length === 1 ? 'Hay 1 dato por corregir' : `Hay ${entries.length} datos por corregir`}</h3>
              <ul>{entries.map((k) => <li key={k}><a href={`#pw-${k}`} onClick={(e) => { e.preventDefault(); document.getElementById(`pw-${k}`)?.focus(); }}>{LABEL[k]}</a>: {TEXT[errors[k]] ?? 'El valor no es válido.'}</li>)}</ul>
            </div>
          )}
          {message && <p className="mv-summary mv-error-text" role="alert">{message}</p>}
        </div>
        <div className="mv-field">
          <label htmlFor="pw-current">{LABEL.current} (obligatorio)</label>
          <input className="input" type="password" autoComplete="current-password" {...fp('current')} value={form.current} onChange={(e) => set('current', e.target.value)} />
          {errors.current && <p id="pw-current-err" className="mv-field-error">{TEXT[errors.current]}</p>}
        </div>
        <div className="mv-field">
          <label htmlFor="pw-next">{LABEL.next} (obligatorio)</label>
          <input className="input" type="password" autoComplete="new-password" {...fp('next', true)} value={form.next} onChange={(e) => set('next', e.target.value)} />
          <p id="pw-next-hint" className="mv-hint">Entre {PASSWORD_MIN} y {PASSWORD_MAX} caracteres, distinta de la actual.</p>
          {errors.next && <p id="pw-next-err" className="mv-field-error">{TEXT[errors.next]}</p>}
        </div>
        <div className="mv-field">
          <label htmlFor="pw-again">{LABEL.again} (obligatorio)</label>
          <input className="input" type="password" autoComplete="new-password" {...fp('again')} value={form.again} onChange={(e) => set('again', e.target.value)} />
          {errors.again && <p id="pw-again-err" className="mv-field-error">{TEXT[errors.again]}</p>}
        </div>
        <div className="mv-dialog-actions" style={{ justifyContent: 'flex-start' }}>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : 'Cambiar contraseña'}</button>
        </div>
      </form>
    </div>
  );
}
