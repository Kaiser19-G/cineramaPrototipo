import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react';
import { authApi } from '../api/auth';

const AuthContext = createContext(null);

// Sesion real (cookie httpOnly en el servidor). El cliente solo conserva el
// usuario publico que devuelve /api/auth/me.
export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);
  // true tras cerrar sesion a proposito: los guardias llevan al login sin ?next=.
  const [loggedOut, setLoggedOut] = useState(false);

  const refresh = useCallback(async () => {
    const res = await authApi.me();
    // Si la API no responde se conserva el estado actual (no se expulsa a nadie por un corte).
    if (res.ok) setUser(res.data.user ?? null);
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    authApi.me().then((res) => {
      if (cancelled) return;
      if (res.ok) setUser(res.data.user ?? null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, []);

  // Al volver a la pestana se revalida la sesion (por si caduco o se cerro en otra pestana).
  useEffect(() => {
    const onVisible = () => { if (document.visibilityState === 'visible') refresh(); };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [refresh]);

  const login = useCallback(async (email, password) => {
    const res = await authApi.login(email, password);
    if (res.ok) { setUser(res.data.user); setLoggedOut(false); }
    return res;
  }, []);

  const verifyPhone = useCallback(async (code) => {
    const res = await authApi.verifyPhone(code);
    if (res.ok) { setUser(res.data.user); setLoggedOut(false); }
    return res;
  }, []);

  const logout = useCallback(async () => {
    setLoggedOut(true);
    await authApi.logout();
    setUser(null);
  }, []);

  const value = useMemo(() => ({
    user, loading, loggedOut, login, logout, verifyPhone,
    register: authApi.register, resendCode: authApi.resendCode,
  }), [user, loading, loggedOut, login, logout, verifyPhone]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
  return useContext(AuthContext);
}
