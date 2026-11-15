import express from 'express';
import { createOrderService } from './service.js';

// Compras del sitio publico. El mapa de butacas es publico (solo ids de butacas, sin identidad); comprar exige una
// cuenta de cliente. Nunca se registra en consola ni en audit_log el codigo de orden ni datos personales.
const BUY_THROTTLE = { max: 15, windowMs: 15 * 60 * 1000, lockMs: 10 * 60 * 1000 };

export function createOrders(db, auth, opts = {}) {
  const { clock = Date.now } = opts;
  const service = createOrderService(db, clock);
  const router = express.Router();

  // GET /api/screenings/:id/seats
  router.get('/screenings/:id/seats', auth.loadSession, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = Number(req.params.id);
    const map = Number.isInteger(id) && id > 0 ? service.seatMap(id, req.user?.tier === 'customer' ? req.user.id : null) : null;
    if (!map) return res.status(404).json({ error: 'not_found' });
    res.json({ ...map, viewer: req.user ? { tier: req.user.tier, canBuy: req.user.tier === 'customer' } : null });
  });

  // POST /api/orders  { screeningId, seats, idempotencyKey, payment: { method: 'card', simulatedOutcome } }
  router.post('/orders', auth.loadSession, auth.requireAuth, (req, res) => {
    if (req.user.tier !== 'customer') return res.status(403).json({ error: 'customer_only' });
    res.set('Cache-Control', 'no-store');
    const key = `buy:user:${req.user.id}`;
    const lock = auth.throttle.check(key);
    if (lock.locked) return res.status(429).json({ error: 'too_many_attempts', retryAfter: lock.retryAfter });
    auth.throttle.hit(key, BUY_THROTTLE);
    const out = service.purchase({ id: req.user.id, name: req.user.name, email: req.user.email }, req.body);
    res.status(out.status).json(out.body);
  });

  return { router, service };
}
