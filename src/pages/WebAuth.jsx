import { useState, useMemo, useRef, useEffect } from 'react';
import './WebPages.css';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AuthField from '../components/AuthField';
import { useAuth } from '../context/AuthContext';
import { EMAIL_RE } from '../shared/validators';
import { safeNext } from '../shared/safeNext';

// Inicio de sesion. (El registro vive en /web/registro: dos paginas simples en
// lugar de pestanas, para no depender del patron ARIA de tabs.)
export default function WebAuth() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next'));

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [touched, setTouched] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);

  const emailRef = useRef(null);
  const passwordRef = useRef(null);
  const noticeRef = useRef(null);
  const formErrorRef = useRef(null);

  const loggedOutNotice = location.state?.loggedOut === true;
  const loginRequired = location.state?.reason === 'login_required';
  const notice = loggedOutNotice ? 'Cerraste sesión correctamente.'
    : loginRequired ? 'Inicia sesión con una cuenta del personal para entrar al panel de administración.' : '';

  // Al llegar con un aviso (sesion cerrada / se requiere iniciar sesion) el foco va al aviso para que se lea.
  useEffect(() => { if (notice) noticeRef.current?.focus(); }, [notice]);
  useEffect(() => { if (formError) formErrorRef.current?.focus(); }, [formError]);

  const errors = useMemo(() => {
    const e = {};
    if (!email.trim()) e.email = 'Ingresa tu correo.';
    else if (!EMAIL_RE.test(email.trim())) e.email = 'Ese correo no tiene un formato válido (ej: nombre@dominio.com).';
    if (!password) e.password = 'Ingresa tu contraseña.';
    return e;
  }, [email, password]);

  const shown = (f) => ((touched[f] || submitted) ? errors[f] : undefined);
  const markTouched = (f) => setTouched((t) => ({ ...t, [f]: true }));

  if (user && !loggedOutNotice) {
    const staff = user.tier === 'central' || user.tier === 'branch';
    return <Navigate to={next ?? (staff ? '/dashboard' : '/WebHome')} replace />;
  }

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setSubmitted(true);
    setFormError('');
    if (errors.email) { emailRef.current?.focus(); return; }
    if (errors.password) { passwordRef.current?.focus(); return; }
    setBusy(true);
    const res = await login(email.trim(), password);
    setBusy(false);
    if (res.ok) {
      const staff = res.data.user.tier !== 'customer';
      navigate(next ?? (staff ? '/dashboard' : '/WebHome'), { replace: true });
      return;
    }
    if (res.error === 'phone_not_verified') {
      navigate('/web/registro', { state: { verification: res.data, fromLogin: true, next } });
      return;
    }
    if (res.error === 'invalid_credentials') setFormError('Correo o contraseña incorrectos. Revisa los datos e inténtalo de nuevo.');
    else if (res.error === 'locked') {
      const min = Math.max(1, Math.ceil((res.data.retryAfter ?? 900) / 60));
      setFormError(`Demasiados intentos fallidos. Por seguridad, espera ${min} ${min === 1 ? 'minuto' : 'minutos'} antes de volver a intentarlo.`);
    } else if (res.error === 'account_suspended') setFormError('Tu cuenta fue suspendida porque se aprobó un reclamo de DNI sobre el documento con el que se creó. Si crees que es un error, contacta a un administrador.');
    else if (res.error === 'account_disabled') setFormError('Tu cuenta está desactivada. Contacta a un administrador.');
    else if (res.error === 'network') setFormError('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
    else setFormError('No pudimos iniciar sesión. Inténtalo de nuevo en unos segundos.');
  };

  return (
    <div className="web-page-center">
      <div className="auth-card">
        <h2 className="auth-title">Iniciar sesión</h2>

        {notice && (
          <p className="auth-notice" role="status" tabIndex={-1} ref={noticeRef}>{notice}</p>
        )}

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <AuthField
            id="auth-email" label="Correo" type="email" inputMode="email" autoComplete="email"
            placeholder="correo@ejemplo.com" value={email} inputRef={emailRef}
            onChange={(e) => { setEmail(e.target.value); setFormError(''); }}
            onBlur={() => markTouched('email')} error={shown('email')}
          />
          <AuthField
            id="auth-password" label="Contraseña" type={showPassword ? 'text' : 'password'}
            autoComplete="current-password" placeholder="••••••••" value={password} inputRef={passwordRef}
            onChange={(e) => { setPassword(e.target.value); setFormError(''); }}
            onBlur={() => markTouched('password')} error={shown('password')}
          />
          <label className="check-row">
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            <span>Mostrar contraseña</span>
          </label>

          {formError && <div className="form-error" tabIndex={-1} ref={formErrorRef}>{formError}</div>}

          <button type="submit" className="btn-auth" disabled={busy}>
            {busy ? 'Iniciando sesión…' : 'Iniciar sesión'}
          </button>
        </form>

        <p className="auth-switch">
          ¿Aún no tienes cuenta? <Link to={next ? `/web/registro?next=${encodeURIComponent(next)}` : '/web/registro'}>Crea una cuenta</Link>
        </p>
      </div>
    </div>
  );
}
