// Limite de intentos con estado en la BD (sobrevive a reinicios de node --watch).
// Las claves no llevan datos personales en claro (el correo va como hash).
export function createThrottle(db, clock) {
  const get = db.prepare('SELECT count, window_start, locked_until FROM auth_throttle WHERE key = ?');
  const put = db.prepare(`INSERT INTO auth_throttle (key, count, window_start, locked_until) VALUES (?,?,?,?)
    ON CONFLICT(key) DO UPDATE SET count=excluded.count, window_start=excluded.window_start, locked_until=excluded.locked_until`);
  const del = db.prepare('DELETE FROM auth_throttle WHERE key = ?');
  const purge = db.prepare('DELETE FROM auth_throttle WHERE locked_until < ? AND window_start < ?');

  return {
    // { locked:false } | { locked:true, retryAfter: segundos }
    check(key) {
      const r = get.get(key);
      const now = clock();
      if (r && r.locked_until > now) return { locked: true, retryAfter: Math.ceil((r.locked_until - now) / 1000) };
      return { locked: false };
    },
    // Cuenta un intento; al llegar a `max` dentro de la ventana, bloquea `lockMs`.
    hit(key, { max, windowMs, lockMs }) {
      const now = clock();
      const r = get.get(key);
      let count = 1, start = now;
      if (r && now - r.window_start < windowMs) { count = r.count + 1; start = r.window_start; }
      const lockedUntil = count >= max ? now + lockMs : 0;
      put.run(key, count, start, lockedUntil);
      if (Math.random() < 0.02) purge.run(now, now - 24 * 3600 * 1000);
      return lockedUntil > 0;
    },
    reset(key) { del.run(key); },
  };
}
