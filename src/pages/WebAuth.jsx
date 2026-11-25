import { useState, useMemo } from 'react';
import './WebPages.css';
import { useNavigate } from 'react-router-dom';
import FieldError from '../components/FieldError';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function WebAuth() {
  const [isLogin, setIsLogin] = useState(true);
  const navigate = useNavigate();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [touched, setTouched] = useState({});

  const errors = useMemo(() => {
    const e = {};
    if (!isLogin) {
      if (!firstName.trim()) e.firstName = 'Ingresa tu nombre.';
      if (!lastName.trim()) e.lastName = 'Ingresa tu apellido.';
    }
    if (!email.trim()) {
      e.email = 'Ingresa tu correo.';
    } else if (!EMAIL_RE.test(email.trim())) {
      e.email = 'Ese correo no tiene un formato válido (ej: nombre@dominio.com).';
    }
    if (!password) {
      e.password = 'Ingresa tu contraseña.';
    } else if (!isLogin && password.length < 6) {
      e.password = 'Usa al menos 6 caracteres.';
    }
    if (!isLogin) {
      if (!confirmPassword) {
        e.confirmPassword = 'Confirma tu contraseña.';
      } else if (confirmPassword !== password) {
        e.confirmPassword = 'Las contraseñas no coinciden.';
      }
    }
    return e;
  }, [isLogin, firstName, lastName, email, password, confirmPassword]);

  const isValid = Object.keys(errors).length === 0;
  const markTouched = (field) => setTouched((t) => ({ ...t, [field]: true }));

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!isValid) return; // el botón ya está deshabilitado en este caso
    if (isLogin) {
      // Si el usuario es administrador, podemos redirigirlo al dashboard
      // Si es un cliente normal, al home web
      navigate('/dashboard');
    } else {
      navigate('/web');
    }
  };

  return (
    <div className="web-page-center">
      <div className="auth-card">
        <div className="auth-tabs" role="tablist" aria-label="Acceso a tu cuenta">
          <button
            type="button"
            role="tab"
            aria-selected={isLogin}
            className={`auth-tab ${isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(true)}
          >
            Iniciar Sesión
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={!isLogin}
            className={`auth-tab ${!isLogin ? 'active' : ''}`}
            onClick={() => setIsLogin(false)}
          >
            Registrarse
          </button>
        </div>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          {!isLogin && (
            <div className="form-row">
              <div className="form-group">
                <label htmlFor="auth-firstname">Nombre</label>
                <input
                  id="auth-firstname"
                  type="text"
                  placeholder="Tu nombre"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  onBlur={() => markTouched('firstName')}
                  aria-invalid={Boolean(touched.firstName && errors.firstName)}
                  aria-describedby={errors.firstName ? 'err-firstname' : undefined}
                />
                {touched.firstName && errors.firstName && <FieldError id="err-firstname" message={errors.firstName} />}
              </div>
              <div className="form-group">
                <label htmlFor="auth-lastname">Apellido</label>
                <input
                  id="auth-lastname"
                  type="text"
                  placeholder="Tu apellido"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  onBlur={() => markTouched('lastName')}
                  aria-invalid={Boolean(touched.lastName && errors.lastName)}
                  aria-describedby={errors.lastName ? 'err-lastname' : undefined}
                />
                {touched.lastName && errors.lastName && <FieldError id="err-lastname" message={errors.lastName} />}
              </div>
            </div>
          )}

          <div className="form-group">
            <label htmlFor="auth-email">Correo</label>
            <input
              id="auth-email"
              type="email"
              placeholder="correo@ejemplo.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onBlur={() => markTouched('email')}
              aria-invalid={Boolean(touched.email && errors.email)}
              aria-describedby={errors.email ? 'err-email' : undefined}
            />
            {touched.email && errors.email && <FieldError id="err-email" message={errors.email} />}
          </div>

          <div className="form-group">
            <label htmlFor="auth-password">Contraseña</label>
            <input
              id="auth-password"
              type="password"
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onBlur={() => markTouched('password')}
              aria-invalid={Boolean(touched.password && errors.password)}
              aria-describedby={errors.password ? 'err-password' : undefined}
            />
            {touched.password && errors.password && <FieldError id="err-password" message={errors.password} />}
          </div>

          {!isLogin && (
            <div className="form-group">
              <label htmlFor="auth-password-confirm">Confirmar contraseña</label>
              <input
                id="auth-password-confirm"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onBlur={() => markTouched('confirmPassword')}
                aria-invalid={Boolean(touched.confirmPassword && errors.confirmPassword)}
                aria-describedby={errors.confirmPassword ? 'err-password-confirm' : undefined}
              />
              {touched.confirmPassword && errors.confirmPassword && (
                <FieldError id="err-password-confirm" message={errors.confirmPassword} />
              )}
            </div>
          )}

          <button type="submit" className="btn-auth" disabled={!isValid}>
            {isLogin ? 'Iniciar Sesión' : 'Registrarse'}
          </button>
        </form>
      </div>
    </div>
  );
}
