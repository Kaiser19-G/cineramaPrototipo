import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { isStaffTier } from '../shared/permissions';

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
