import { useState, useMemo, useRef, useEffect } from 'react';
import './WebPages.css';
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import AuthField from '../components/AuthField';
import FieldError from '../components/FieldError';
import { useAuth } from '../context/AuthContext';
import {
  EMAIL_RE, PASSWORD_MIN, PASSWORD_MAX, normalizeDni, normalizePhone, isDni, isPhone, normalizeName,
} from '../shared/validators';
import { safeNext } from '../shared/safeNext';

// Formulario de reclamo (fase 2b) para quien descubre que su DNI ya fue usado por otra persona.
const DNI_CLAIM_URL = '/web/reclamo-dni';

const FIELD_ORDER = ['firstName', 'lastName', 'dni', 'email', 'phone', 'password', 'confirmPassword', 'consent'];
const FIELD_ID = {
  firstName: 'reg-firstname', lastName: 'reg-lastname', dni: 'reg-dni', email: 'reg-email', phone: 'reg-phone',
  password: 'reg-password', confirmPassword: 'reg-password-confirm', consent: 'reg-consent',
};

const formatTime = (ms) => new Date(ms).toLocaleTimeString('es-PE', { hour: '2-digit', minute: '2-digit' });
const spaced = (code) => code.split('').join(' ');

// ───────────────────────── Paso 2: verificar celular ─────────────────────────
function VerifyStep({ initial, onBack, onVerified }) {
  const { verifyPhone, resendCode } = useAuth();
  const [info, setInfo] = useState(initial);
  const [code, setCode] = useState('');
  const [message, setMessage] = useState('');
  const [regExpired, setRegExpired] = useState(false);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [announce, setAnnounce] = useState('');
  const headingRef = useRef(null);
  const codeRef = useRef(null);

  // Al entrar al paso, el foco va al titulo (el usuario sabe donde esta).
  useEffect(() => { headingRef.current?.focus(); }, []);

  // El codigo simulado se anuncia en una region viva (se escribe despues de montar para que se lea).
  const simCode = info.simulated && info.simulation?.code ? info.simulation.code : null;
  useEffect(() => {
    if (!simCode) return undefined;
    const t = setTimeout(() => setAnnounce(
      `Simulación: no se envió ningún SMS. Tu código de verificación es ${spaced(simCode)}.`), 150);
    return () => { clearTimeout(t); setAnnounce(''); };
  }, [simCode]);

  // Reloj de 1 s solo para el contador visual de espera (no es una region viva).
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const waitSec = Math.max(0, Math.ceil(((info.resendAvailableAt ?? 0) - now) / 1000));
  const codeExpired = info.codeExpiresAt != null && now >= info.codeExpiresAt;

  const messageFor = (res) => {
    switch (res.error) {
      case 'code_invalid': {
        const n = res.data.attemptsLeft;
        return `Código incorrecto. Te ${n === 1 ? 'queda 1 intento' : `quedan ${n} intentos`}.`;
      }
      case 'code_format': return 'Ingresa los 6 dígitos del código.';
      case 'code_expired': return 'El código venció. Pide uno nuevo con "Reenviar código".';
      case 'too_many_attempts': return 'Agotaste los intentos de este código. Pide uno nuevo con "Reenviar código".';
      case 'registration_expired': return 'Tu registro caducó (se conserva 30 minutos). Vuelve a completar el formulario.';
      case 'resend_too_soon': return `Espera ${res.data.retryAfter ?? 60} segundos antes de pedir otro código.`;
      case 'resend_limit': return 'Alcanzaste el máximo de códigos por hora. Inténtalo más tarde.';
      case 'network': return 'No pudimos conectar con el servidor. Inténtalo de nuevo.';
      default: return 'No pudimos verificar el código. Inténtalo de nuevo.';
    }
  };

  const fail = (res) => {
    setMessage(messageFor(res));
    if (res.error === 'registration_expired') setRegExpired(true);
    codeRef.current?.focus();
  };

  const submit = async (ev) => {
    ev.preventDefault();
    setMessage('');
    const clean = code.replace(/\s/g, '');
    if (!/^\d{6}$/.test(clean)) {
      setMessage('Ingresa los 6 dígitos del código.');
      codeRef.current?.focus();
      return;
    }
    setBusy(true);
    const res = await verifyPhone(clean);
    setBusy(false);
    if (res.ok) { onVerified(res.data.user); return; }
    if (res.error === 'code_invalid') setCode('');
    fail(res);
  };

  const resend = async () => {
    if (waitSec > 0 || busy) return;
    setMessage('');
    setBusy(true);
    const res = await resendCode();
    setBusy(false);
    if (res.ok) {
      setInfo(res.data);
      setCode('');
      setAnnounce('');
      codeRef.current?.focus();
    } else {
      if (res.error === 'resend_too_soon' && res.data.retryAfter) {
        setInfo((i) => ({ ...i, resendAvailableAt: Date.now() + res.data.retryAfter * 1000 }));
      }
      fail(res);
    }
  };

  return (
    <div className="web-page-center">
      <div className="auth-card">
        <h2 className="auth-title" tabIndex={-1} ref={headingRef}>Verifica tu celular</h2>
        <p className="auth-lead">
          Te enviaríamos un código de 6 dígitos al celular {info.phoneMasked ?? ''} para confirmar que es tuyo.
        </p>

        {simCode && (
          <div className="sim-box">
            <p className="sim-box-tag">Simulación · No se envió ningún SMS</p>
            <p>Este sitio es un prototipo: en lugar de llegar a tu celular, el código aparece aquí.</p>
            <p className="sim-box-code">Tu código es <strong>{simCode}</strong></p>
          </div>
        )}
        {/* Anuncio para lectores de pantalla (el cuadro de arriba es estatico). */}
        <p className="sr-only" role="status">{announce}</p>

        <form className="auth-form" onSubmit={submit} noValidate>
          <AuthField
            id="verify-code" label="Código de 6 dígitos" type="text" inputMode="numeric" pattern="[0-9]*"
            autoComplete="one-time-code" maxLength={6} value={code} inputRef={codeRef}
            hint={codeExpired
              ? 'El código venció. Pide uno nuevo con "Reenviar código".'
              : info.codeExpiresAt ? `El código vence a las ${formatTime(info.codeExpiresAt)} (10 minutos desde que se generó).` : undefined}
            onChange={(e) => { setCode(e.target.value.replace(/\D/g, '')); setMessage(''); }}
            error={message || undefined}
          />

          {regExpired
            ? <button type="button" className="btn-auth" onClick={onBack}>Volver al formulario</button>
            : <button type="submit" className="btn-auth" disabled={busy}>{busy ? 'Verificando…' : 'Verificar y crear cuenta'}</button>}
        </form>

        <div className="auth-secondary">
          <button type="button" className="link-btn" onClick={resend} aria-disabled={waitSec > 0 || busy} aria-describedby="resend-hint">
            Reenviar código
          </button>
          <span id="resend-hint" className="field-hint">
            {waitSec > 0 ? `Podrás pedir otro código en ${waitSec} s.` : 'Ya puedes pedir un código nuevo.'}
          </span>
          <button type="button" className="link-btn" onClick={onBack}>Corregir mis datos</button>
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Paso 1: formulario ─────────────────────────
export default function WebRegister() {
  const { user, register } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [params] = useSearchParams();
  const next = safeNext(params.get('next')) ?? safeNext(location.state?.next);

  const [step, setStep] = useState(location.state?.verification ? 'verify' : 'form');
  const [verification, setVerification] = useState(location.state?.verification ?? null);

  const [f, setF] = useState({
    firstName: '', lastName: '', dni: '', email: '', phone: '', password: '', confirmPassword: '', consent: false,
  });
  const [showPassword, setShowPassword] = useState(false);
  const [touched, setTouched] = useState({});
  const [submitted, setSubmitted] = useState(false);
  const [serverErrors, setServerErrors] = useState({});
  const [formError, setFormError] = useState('');
  const [busy, setBusy] = useState(false);
  const formErrorRef = useRef(null);

  useEffect(() => { if (formError) formErrorRef.current?.focus(); }, [formError]);

  const errors = useMemo(() => {
    const e = {};
    if (!f.firstName.trim()) e.firstName = 'Ingresa tu nombre.';
    if (!f.lastName.trim()) e.lastName = 'Ingresa tu apellido.';
    if (normalizeName(`${f.firstName} ${f.lastName}`).length > 100) e.lastName = 'El nombre completo es demasiado largo (máximo 100 caracteres).';

    const dni = normalizeDni(f.dni);
    if (!dni) e.dni = 'Ingresa tu DNI.';
    else if (!isDni(dni)) e.dni = 'El DNI debe tener exactamente 8 dígitos numéricos.';

    const email = f.email.trim();
    if (!email) e.email = 'Ingresa tu correo.';
    else if (!EMAIL_RE.test(email)) e.email = 'Ese correo no tiene un formato válido (ej: nombre@dominio.com).';

    const phone = normalizePhone(f.phone);
    if (!f.phone.trim()) e.phone = 'Ingresa tu celular.';
    else if (!isPhone(phone)) e.phone = 'El celular debe tener 9 dígitos y empezar en 9 (ej: 987654321).';

    if (!f.password) e.password = 'Ingresa tu contraseña.';
    else if (f.password.length < PASSWORD_MIN) e.password = `Usa al menos ${PASSWORD_MIN} caracteres.`;
    else if (f.password.length > PASSWORD_MAX) e.password = `Usa como máximo ${PASSWORD_MAX} caracteres.`;

    if (!f.confirmPassword) e.confirmPassword = 'Confirma tu contraseña.';
    else if (f.confirmPassword !== f.password) e.confirmPassword = 'Las contraseñas no coinciden.';

    if (!f.consent) e.consent = 'Debes aceptar el tratamiento de tus datos personales para crear la cuenta.';
    return e;
  }, [f]);

  if (user) {
    const staff = user.tier !== 'customer';
    return <Navigate to={next ?? (staff ? '/dashboard' : '/WebHome')} replace />;
  }

  if (step === 'verify' && verification) {
    return (
      <VerifyStep
        initial={verification}
        onBack={() => setStep('form')}
        onVerified={(u) => navigate(next ?? (u.tier === 'customer' ? '/WebHome' : '/dashboard'), { replace: true })}
      />
    );
  }

  const claimLink = DNI_CLAIM_URL
    ? <> <Link to={DNI_CLAIM_URL}>¿Este DNI es tuyo? Presenta un reclamo</Link></>
    : null;
  const serverMsg = {
    dni: serverErrors.dni === 'dni_reserved'
      ? <>Este DNI está reservado por unos días para quien presentó un reclamo aprobado: solo puede registrarlo con el correo de ese reclamo. <Link to="/web/reclamo-dni/estado">Consulta tu reclamo</Link>.</>
      : <>Ya existe una cuenta con este documento.{claimLink}</>,
    email: <>Ya existe una cuenta con este correo. Si es tuya, <Link to="/web/login">inicia sesión</Link>.</>,
    phone: 'Ya existe una cuenta con este celular.',
  };

  const shown = (field) => {
    if (serverErrors[field]) return serverMsg[field];
    return (touched[field] || submitted) ? errors[field] : undefined;
  };
  const markTouched = (field) => setTouched((t) => ({ ...t, [field]: true }));
  const set = (field) => (e) => {
    const value = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
    setF((p) => ({ ...p, [field]: value }));
    setServerErrors((s) => (s[field] ? { ...s, [field]: undefined } : s));
    setFormError('');
  };
  const focusField = (name) => document.getElementById(FIELD_ID[name])?.focus();

  const handleSubmit = async (ev) => {
    ev.preventDefault();
    setSubmitted(true);
    setFormError('');
    const firstBad = FIELD_ORDER.find((k) => errors[k]);
    if (firstBad) { focusField(firstBad); return; }

    setBusy(true);
    const res = await register({
      name: normalizeName(`${f.firstName} ${f.lastName}`),
      dni: normalizeDni(f.dni),
      email: f.email.trim(),
      phone: normalizePhone(f.phone),
      password: f.password,
      consent: true,
    });
    setBusy(false);

    if (res.ok) {
      setVerification(res.data);
      setStep('verify');
      return;
    }
    if (res.error === 'conflict') {
      const errs = res.data.errors || {};
      setServerErrors(errs);
      const first = ['dni', 'email', 'phone'].find((k) => errs[k]);
      if (first) setTimeout(() => focusField(first), 0);
      return;
    }
    if (res.error === 'too_many_attempts') {
      const min = Math.max(1, Math.ceil((res.data.retryAfter ?? 900) / 60));
      setFormError(`Hiciste demasiados intentos de registro. Espera ${min} ${min === 1 ? 'minuto' : 'minutos'} e inténtalo de nuevo.`);
    } else if (res.error === 'validation') {
      setFormError('Algunos datos no son válidos. Revisa el formulario e inténtalo de nuevo.');
    } else if (res.error === 'network') {
      setFormError('No pudimos conectar con el servidor. Revisa tu conexión e inténtalo de nuevo.');
    } else {
      setFormError('No pudimos crear la cuenta. Inténtalo de nuevo en unos segundos.');
    }
  };

  const pwType = showPassword ? 'text' : 'password';

  return (
    <div className="web-page-center">
      <div className="auth-card">
        <h2 className="auth-title">Crear cuenta</h2>
        <p className="auth-lead">Todos los campos son obligatorios.</p>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="form-row">
            <AuthField
              id={FIELD_ID.firstName} label="Nombre" autoComplete="given-name" placeholder="Tu nombre"
              value={f.firstName} onChange={set('firstName')}
              onBlur={() => markTouched('firstName')} error={shown('firstName')}
            />
            <AuthField
              id={FIELD_ID.lastName} label="Apellido" autoComplete="family-name" placeholder="Tu apellido"
              value={f.lastName} onChange={set('lastName')}
              onBlur={() => markTouched('lastName')} error={shown('lastName')}
            />
          </div>

          <AuthField
            id={FIELD_ID.dni} label="DNI" inputMode="numeric" pattern="[0-9]*" maxLength={8} autoComplete="off"
            placeholder="8 dígitos" value={f.dni}
            hint="Pedimos tu DNI para que cada persona tenga una sola cuenta y así evitar que se acaparen entradas en las preventas. Lo guardamos solo como una huella irreversible (y los últimos 3 dígitos): no podemos ver ni mostrar tu número completo. La única excepción es si presentas un reclamo por tu DNI: ahí lo guardamos en claro, solo hasta resolverlo."
            onChange={set('dni')} onBlur={() => markTouched('dni')} error={shown('dni')}
          />

          <AuthField
            id={FIELD_ID.email} label="Correo" type="email" inputMode="email" autoComplete="email"
            placeholder="correo@ejemplo.com" value={f.email}
            onChange={set('email')} onBlur={() => markTouched('email')} error={shown('email')}
          />

          <AuthField
            id={FIELD_ID.phone} label="Celular" type="tel" inputMode="numeric" autoComplete="tel-national"
            maxLength={16} placeholder="987654321" value={f.phone}
            hint="9 dígitos, empieza en 9. En el siguiente paso verificarás este número con un código (en este prototipo el código es simulado)."
            onChange={set('phone')} onBlur={() => markTouched('phone')} error={shown('phone')}
          />

          <AuthField
            id={FIELD_ID.password} label="Contraseña" type={pwType} autoComplete="new-password"
            placeholder="••••••••" value={f.password}
            hint={`Mínimo ${PASSWORD_MIN} caracteres. Puedes usar espacios y pegar desde tu gestor de contraseñas.`}
            onChange={set('password')} onBlur={() => markTouched('password')} error={shown('password')}
          />
          <AuthField
            id={FIELD_ID.confirmPassword} label="Confirmar contraseña" type={pwType} autoComplete="new-password"
            placeholder="••••••••" value={f.confirmPassword}
            onChange={set('confirmPassword')} onBlur={() => markTouched('confirmPassword')} error={shown('confirmPassword')}
          />
          <label className="check-row">
            <input type="checkbox" checked={showPassword} onChange={(e) => setShowPassword(e.target.checked)} />
            <span>Mostrar contraseñas</span>
          </label>

          <div className="form-group">
            <label className="check-row" htmlFor={FIELD_ID.consent}>
              <input
                id={FIELD_ID.consent} name={FIELD_ID.consent} type="checkbox"
                checked={f.consent} onChange={set('consent')} onBlur={() => markTouched('consent')}
                aria-required="true" aria-invalid={Boolean(shown('consent'))}
                aria-describedby={shown('consent') ? `${FIELD_ID.consent}-err` : undefined}
              />
              <span>
                Acepto el tratamiento de mis datos personales según la{' '}
                <Link to="/web/privacidad" target="_blank" rel="noopener noreferrer">
                  Política de datos personales<span className="sr-only"> (se abre en una pestaña nueva)</span>
                </Link>
                {' '}(Ley N.º 29733).
              </span>
            </label>
            {shown('consent') && <FieldError id={`${FIELD_ID.consent}-err`} message={shown('consent')} />}
          </div>

          {formError && <div className="form-error" tabIndex={-1} ref={formErrorRef}>{formError}</div>}

          <button type="submit" className="btn-auth" disabled={busy}>
            {busy ? 'Creando cuenta…' : 'Crear cuenta'}
          </button>
        </form>

        <p className="auth-switch">
          ¿Ya tienes cuenta? <Link to={next ? `/web/login?next=${encodeURIComponent(next)}` : '/web/login'}>Inicia sesión</Link>
        </p>
      </div>
    </div>
  );
}
