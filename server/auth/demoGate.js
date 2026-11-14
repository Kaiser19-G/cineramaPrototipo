import { verifyPassword } from './crypto.js';
import { DEMO_PASSWORD } from './config.js';

// Mientras algun admin central ACTIVO conserve la contrasena de demostracion, las rutas sensibles (reclamos de DNI y
// usuarios) responden 403 demo_password. Compartido por server/claims y server/admin/users.
export function createDemoGate(db) {
  const adminHashes = db.prepare(`SELECT password_hash FROM users WHERE role='admin' AND status='active' AND password_hash IS NOT NULL`);
  const demoCache = new Map(); // password_hash -> bool
  const hasDemoPassword = async () => {
    for (const { password_hash: h } of adminHashes.all()) {
      if (!demoCache.has(h)) {
        if (demoCache.size > 50) demoCache.clear();
        demoCache.set(h, await verifyPassword(DEMO_PASSWORD, h));
      }
      if (demoCache.get(h)) return true;
    }
    return false;
  };
  const demoGate = async (_req, res, next) => {
    if (await hasDemoPassword()) return res.status(403).json({ error: 'demo_password' });
    return next();
  };
  return { demoGate, hasDemoPassword };
}
