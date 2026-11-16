// Taquilla del panel: venta en mostrador, validacion de entradas en la puerta y reembolso individual. Toda escritura de
// butacas pasa por server/orders/service.js. Nunca se escribe el codigo de orden ni datos personales en consola ni en
// audit_log (el registro lleva solo ids de funcion y de sede, cantidades y codigos fijos).
//
// demoGate: vender y validar NO se bloquean aunque el admin central conserve la contrasena de demostracion (esas rutas
// las usa el cajero u operador, no devuelven nombres ni correos de clientes). Reembolsar SI se bloquea, igual que la
// lista de ordenes desde la que se hace: es una accion destructiva y el mismo bloqueo protege ambas.
import express from 'express';
import { createDemoGate } from '../auth/demoGate.js';
import { STAFF_REFUND_REASONS } from '../../src/shared/purchase.js';
import { branchScope, requirePerm, failValidation, createAudit } from './common.js';
import { createOrderService } from '../orders/service.js';

// Consultas por codigo: solo los fallos cuentan (codigo inexistente, mal formado o de otra sede). 10 fallos en 10 minutos
// bloquean 10 minutos por usuario (429). El bloqueo se revisa ANTES de buscar, asi un bloqueado no distingue aciertos.
const TICKET_THROTTLE = { max: 10, windowMs: 10 * 60 * 1000, lockMs: 10 * 60 * 1000 };

export function createCounter(db, auth, opts = {}) {
  const { clock = Date.now } = opts;
  const service = createOrderService(db, clock);
  const audit = createAudit(db, clock);
  const { demoGate } = createDemoGate(db);
  const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  const staff = [auth.loadSession, auth.requireAuth, auth.requireTier('central', 'branch'), noStore];
  const auditFor = (req) => (...args) => audit(req, ...args);
  const parseId = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null; };
  const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});

  const router = express.Router();
  router.use(...staff);

  // Funciones de hoy de la sede con su estado de venta en mostrador.
  router.get('/screenings', requirePerm('process_sale'), (req, res) => {
    res.json(service.counterScreenings(branchScope(req)));
  });

  // Mapa de butacas de una funcion de la sede (otra sede o inexistente: 404).
  router.get('/screenings/:id/seats', requirePerm('process_sale'), (req, res) => {
    const id = parseId(req);
    const map = id ? service.counterSeatMap(id, branchScope(req)) : null;
    if (!map) return res.status(404).json({ error: 'not_found' });
    res.json(map);
  });

  // POST /orders { screeningId, seats, idempotencyKey, payment: { method: 'cash'|'card' }, customerName? }
  router.post('/orders', requirePerm('process_sale'), (req, res) => {
    const out = service.counterSale({ id: req.user.id, scope: branchScope(req) }, req.body, auditFor(req));
    res.status(out.status).json(out.body);
  });

  const guarded = (req, res) => {
    const key = `ticket-check:user:${req.user.id}`;
    const lock = auth.throttle.check(key);
    if (lock.locked) { res.status(429).json({ error: 'too_many_attempts', retryAfter: lock.retryAfter }); return null; }
    return key;
  };
  const codeOf = (req, res) => {
    const code = bodyOf(req).code;
    if (typeof code !== 'string' || !code.trim() || code.length > 40) { failValidation(res, { code: typeof code === 'string' && code ? 'invalid' : 'required' }); return null; }
    return code;
  };

  // POST /tickets/lookup { code } -> { result, order?, ... } (la consulta no cambia nada).
  router.post('/tickets/lookup', requirePerm('validate_ticket'), (req, res) => {
    const code = codeOf(req, res); if (code === null) return;
    const key = guarded(req, res); if (key === null) return;
    const out = service.evaluateTicket(code, branchScope(req));
    if (out.result === 'not_found') auth.throttle.hit(key, TICKET_THROTTLE);
    res.json(out);
  });

  // POST /tickets/checkin { code, seats? } -> registra el ingreso (total si seats se omite).
  router.post('/tickets/checkin', requirePerm('validate_ticket'), (req, res) => {
    const code = codeOf(req, res); if (code === null) return;
    const key = guarded(req, res); if (key === null) return;
    const out = service.checkIn(code, bodyOf(req).seats, branchScope(req), req.user.id, auditFor(req));
    if (out.status === 409 && out.body.result === 'not_found') auth.throttle.hit(key, TICKET_THROTTLE);
    res.status(out.status).json(out.body);
  });

  // Reembolso individual: POST /api/admin/orders/:code/refund { reason }. Con demoGate (ver el encabezado).
  const refunds = express.Router();
  refunds.post('/:code/refund', ...staff, requirePerm('process_refund'), demoGate, (req, res) => {
    const reason = bodyOf(req).reason;
    if (!Object.hasOwn(STAFF_REFUND_REASONS, reason)) return failValidation(res, { reason: reason === undefined ? 'required' : 'invalid_option' });
    const out = service.refundOrder(req.params.code, reason, branchScope(req), req.user.id, auditFor(req));
    res.status(out.status).json(out.body);
  });

  return { router, refunds };
}
