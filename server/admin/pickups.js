// Cola de preparacion y entrega de pedidos de confiteria (fase 5d). Toda escritura pasa por server/orders/service.js.
// Solo opera la cola el personal de la SEDE con el permiso fulfill_orders (gerente, cajero y operador): el admin central
// y soporte no (igual que el admin central no vende ni valida entradas). Nunca se escribe el codigo de orden ni datos
// personales en consola ni en audit_log; la cola no devuelve nombres, correos ni el codigo completo, solo su referencia
// (ultimos 5 caracteres). Sin demoGate: no hay datos personales que proteger.
import express from 'express';
import { branchScope, requirePerm, failValidation, createAudit } from './common.js';
import { createOrderService } from '../orders/service.js';

// Igual que la puerta, pero con clave PROPIA (un mostrador activo no bloquea la puerta ni al reves): solo cuentan los
// fallos (codigo inexistente, de otra sede o que no corresponde al pedido). El bloqueo se revisa ANTES de buscar.
const PICKUP_THROTTLE = { max: 10, windowMs: 10 * 60 * 1000, lockMs: 10 * 60 * 1000 };

export function createPickups(db, auth, opts = {}) {
  const { clock = Date.now } = opts;
  const service = createOrderService(db, clock);
  const audit = createAudit(db, clock);
  const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  const router = express.Router();
  router.use(auth.loadSession, auth.requireAuth, auth.requireTier('central', 'branch'), noStore);

  const guarded = (req, res) => {
    const key = `pickup-check:user:${req.user.id}`;
    const lock = auth.throttle.check(key);
    if (lock.locked) { res.status(429).json({ error: 'too_many_attempts', retryAfter: lock.retryAfter }); return null; }
    return key;
  };
  const codeOf = (req, res) => {
    const code = bodyOf(req).code;
    if (typeof code !== 'string' || !code.trim() || code.length > 40) { failValidation(res, { code: typeof code === 'string' && code ? 'invalid' : 'required' }); return null; }
    return code;
  };
  const perm = requirePerm('fulfill_orders');

  // GET /api/admin/pickups -> { now, date, sections: { waitingArrival, toPrepare, preparing, ready }, counts }
  router.get('/', perm, (req, res) => { res.json(service.pickupQueue(branchScope(req))); });

  // POST /api/admin/pickups/lookup { code } -> { result: 'found'|'no_food'|'not_found', pickup? } (no cambia nada)
  router.post('/lookup', perm, (req, res) => {
    const code = codeOf(req, res); if (code === null) return;
    const key = guarded(req, res); if (key === null) return;
    const out = service.pickupLookup(code, branchScope(req));
    if (out.result === 'not_found') auth.throttle.hit(key, PICKUP_THROTTLE);
    res.json(out);
  });

  const run = (action) => (req, res) => {
    const id = Number(req.params.id);
    let code = null; let key = null;
    if (action === 'deliver') {
      code = codeOf(req, res); if (code === null) return;
      key = guarded(req, res); if (key === null) return;
    }
    const out = service.pickupTransition(action, Number.isInteger(id) && id > 0 ? id : null, { code, scope: branchScope(req), by: req.user.id },
      (...args) => audit(req, ...args));
    if (key && out.status === 422) auth.throttle.hit(key, PICKUP_THROTTLE);
    res.status(out.status).json(out.body);
  };
  // El codigo completo viaja en el CUERPO (nunca en la URL ni en el log). :id es el id de la cola, no el codigo.
  router.post('/:id/start', perm, run('start'));
  router.post('/:id/ready', perm, run('ready'));
  router.post('/:id/revert', perm, run('revert'));
  router.post('/:id/deliver', perm, run('deliver'));

  return { router };
}
