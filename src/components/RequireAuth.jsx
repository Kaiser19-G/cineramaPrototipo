import { Navigate, useLocation, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isStaffTier, hasAnyPerm } from '../shared/permissions';

function SessionGate() {
  return <div className="session-gate" role="status">Verificando sesión…</div>;
}

// Panel de administracion: solo personal (central o sede).
export function RequireStaff({ children }) {
  const { user, loading, loggedOut } = useAuth();
  const location = useLocation();
  if (loading) return <SessionGate />;
  if (!user) {
    if (loggedOut) return <Navigate to="/web/login" replace state={{ loggedOut: true }} />;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/web/login?next=${next}`} replace state={{ reason: 'login_required' }} />;
  }
  if (!isStaffTier(user.tier)) return <Navigate to="/WebHome" replace />;
  return children;
}

// Gestion de cines, usuarios y configuracion: solo admin central.
export function RequireCentral({ children }) {
  const { user } = useAuth();
  if (user?.tier !== 'central') return <Navigate to="/dashboard" replace />;
  return children;
}

// Pantalla del panel con permiso propio (el servidor responde 403 igual): sin permiso, vuelve al resumen.
export function RequirePerm({ any, children }) {
  const { user } = useAuth();
  if (!hasAnyPerm(user, any)) return <Navigate to="/dashboard" replace />;
  return children;
}

// Mis entradas: solo clientes. Sin sesion se lleva al login y se vuelve (?next=); el personal no tiene entradas.
export function RequireCustomer({ children }) {
  const { user, loading, loggedOut } = useAuth();
  const location = useLocation();
  if (loading) return <SessionGate />;
  if (!user) {
    if (loggedOut) return <Navigate to="/web/login" replace state={{ loggedOut: true }} />;
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/web/login?next=${next}`} replace state={{ reason: 'login_required' }} />;
  }
  if (user.tier !== 'customer') {
    return (
      <main className="orders-page">
        <h2 className="orders-title">Las cuentas del personal no tienen entradas</h2>
        <p className="orders-lead">Entraste con una cuenta del personal. Para ver entradas usa una cuenta de cliente.</p>
        <Link className="btn-outline orders-link-btn" to="/web/peliculas">Ir a la cartelera</Link>
      </main>
    );
  }
  return children;
}
