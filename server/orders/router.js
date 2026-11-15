import express from 'express';
import { createOrderService } from './service.js';

// Compras del sitio publico. El mapa de butacas es publico (solo ids de butacas, sin identidad); comprar exige una
// cuenta de cliente. Nunca se registra en consola ni en audit_log el codigo de orden ni datos personales.
const BUY_THROTTLE = { max: 15, windowMs: 15 * 60 * 1000, lockMs: 10 * 60 * 1000 };

// Consulta por codigo: solo los fallos cuentan; 10 codigos inexistentes o ajenos en 10 min bloquean 10 min (429), para
// que no sirva de oraculo. El bloqueo se revisa ANTES de buscar, asi un bloqueado no distingue aciertos de fallos.
const LOOKUP_THROTTLE = { max: 10, windowMs: 10 * 60 * 1000, lockMs: 10 * 60 * 1000 };
const customerOnly = (req, res, next) => (req.user.tier === 'customer' ? next() : res.status(403).json({ error: 'customer_only' }));
const posInt = (v, def, max) => { const n = Number(v); return Number.isInteger(n) && n >= 1 ? Math.min(n, max) : def; };

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

  // GET /api/orders?scope=upcoming|past&page=1&pageSize=10
  router.get('/orders', auth.loadSession, auth.requireAuth, customerOnly, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const { scope } = req.query;
    if (scope !== undefined && scope !== 'upcoming' && scope !== 'past') return res.status(400).json({ error: 'validation', errors: { scope: 'invalid' } });
    res.json(service.listOrders(req.user.id, { scope: scope ?? null, page: posInt(req.query.page, 1, 100000), pageSize: posInt(req.query.pageSize, 10, 50) }));
  });

  // GET /api/orders/:code -- propia o 404 (inexistente y ajena son indistinguibles).
  router.get('/orders/:code', auth.loadSession, auth.requireAuth, customerOnly, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const key = `order-lookup:user:${req.user.id}`;
    const lock = auth.throttle.check(key);
    if (lock.locked) return res.status(429).json({ error: 'too_many_attempts', retryAfter: lock.retryAfter });
    const order = service.getOrder(req.user.id, req.params.code);
    if (!order) { auth.throttle.hit(key, LOOKUP_THROTTLE); return res.status(404).json({ error: 'not_found' }); }
    res.json({ order });
  });

  // GET /api/presale-quota/:movieId -- cupo de preventa de la cuenta (ligero, para la ficha de la pelicula).
  router.get('/presale-quota/:movieId', auth.loadSession, auth.requireAuth, customerOnly, (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = Number(req.params.movieId);
    const out = Number.isInteger(id) && id > 0 ? service.presaleQuota(req.user.id, id) : null;
    if (!out) return res.status(404).json({ error: 'not_found' });
    res.json(out);
  });

  return { router, service };
}
