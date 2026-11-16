import { useCallback, useEffect, useState } from 'react';

// Lectura del panel con estados claros: { status: 'loading' | 'ok' | 'error', data, error, retry }.
// `load` devuelve la respuesta de adminApi ({ ok, data, error }). Se vuelve a pedir cuando cambia `key`.
// Mientras llega la nueva respuesta se conservan los datos anteriores (status 'loading') para no vaciar la pantalla.
export function useAdminQuery(load, key) {
  const [attempt, setAttempt] = useState(0);
  const token = `${key}#${attempt}`;
  const [result, setResult] = useState({ token: null, r: null, last: null });
  useEffect(() => {
    let cancelled = false;
    load().then((r) => { if (!cancelled) setResult((prev) => ({ token, r, last: r.ok ? r.data : prev.last })); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);
  const retry = useCallback(() => setAttempt((n) => n + 1), []);
  const ready = result.token === token;
  if (ready && !result.r.ok) return { status: 'error', data: null, error: result.r.error ?? 'network', retry };
  return { status: ready ? 'ok' : 'loading', data: ready ? result.r.data : result.last, error: null, retry };
}
