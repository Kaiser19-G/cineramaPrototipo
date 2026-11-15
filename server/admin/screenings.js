import express from 'express';
import { FORMATS, LANGUAGES } from '../../src/shared/catalogOptions.js';
import { nowInLima } from '../../src/data/limaDate.js';
import {
  MAX_TICKET_PRICE, START_STEP_MINUTES, TIME_RE, toMinutes,
} from '../../src/shared/scheduling.js';
import { mapAdminScreening } from '../mappers.js';
import { requirePerm, branchScope, failValidation, isRealDate, createAudit } from './common.js';
import { createRules } from './screeningRules.js';
import { createOrderService } from '../orders/service.js';

const FIELDS = ['movieId', 'hallId', 'date', 'startTime', 'language', 'format', 'price', 'status'];
// Cambiar cualquiera de estos campos obliga a volver a validar las reglas de negocio.
const RULE_FIELDS = ['movieId', 'hallId', 'date', 'startTime', 'format'];
const LOCKED_WITH_SALES = ['movieId', 'hallId', 'date', 'startTime', 'language', 'format'];
const EDITABLE_STATUSES = ['draft', 'scheduled'];
const REASON_MAX = 300;

const isPrice = (p) => typeof p === 'number' && Number.isFinite(p) && p > 0 && p <= MAX_TICKET_PRICE && Math.abs(p * 100 - Math.round(p * 100)) < 1e-6;

function validateFields(m, given) {
  const e = {};
  const has = (k) => given.has(k);
  for (const k of ['movieId', 'hallId']) if (has(k) && !(Number.isInteger(m[k]) && m[k] > 0)) e[k] = m[k] === undefined || m[k] === null ? 'required' : 'invalid';
  if (has('date') && !isRealDate(m.date)) e.date = m.date ? 'invalid_date' : 'required';
  if (has('startTime')) {
    if (typeof m.startTime !== 'string' || !TIME_RE.test(m.startTime)) e.startTime = m.startTime ? 'invalid_time' : 'required';
    else if (toMinutes(m.startTime) % START_STEP_MINUTES !== 0) e.startTime = 'invalid_step';
  }
  if (has('language') && !LANGUAGES.includes(m.language)) e.language = m.language ? 'invalid_option' : 'required';
  if (has('format') && !FORMATS.includes(m.format)) e.format = m.format ? 'invalid_option' : 'required';
  if (has('price') && !isPrice(m.price)) e.price = typeof m.price === 'number' && m.price > 0 && m.price <= MAX_TICKET_PRICE ? 'invalid_decimals' : (m.price === undefined || m.price === null ? 'required' : 'out_of_range');
  if (has('status') && !EDITABLE_STATUSES.includes(m.status)) e.status = 'invalid_option';
  return e;
}

export function createScreenings(db, opts = {}) {
  const { clock = Date.now } = opts;
  const audit = createAudit(db, clock);
  const rules = createRules(db);
  const orders = createOrderService(db, clock);
  const now = () => nowInLima(new Date(clock()));

  const SELECT = `SELECT s.*, (s.booked_seats > 0 OR EXISTS (SELECT 1 FROM order_seats os WHERE os.screening_id = s.id AND os.active = 1)) AS has_sales
    FROM screenings s`;
  const q = {
    all: db.prepare(`${SELECT} ORDER BY s.starts_on, s.start_time, s.id`),
    byId: db.prepare(`${SELECT} WHERE s.id = ?`),
    insert: db.prepare(`INSERT INTO screenings (movie_id,hall_id,branch_id,starts_on,start_time,end_time,language,format,price,status,
      booked_seats,total_seats,version,created_by,created_at,updated_at)
      VALUES (@movie_id,@hall_id,@branch_id,@starts_on,@start_time,@end_time,@language,@format,@price,@status,0,@total_seats,1,@by,@now,@now)`),
    update: db.prepare(`UPDATE screenings SET movie_id=@movie_id,hall_id=@hall_id,branch_id=@branch_id,starts_on=@starts_on,start_time=@start_time,
      end_time=@end_time,language=@language,format=@format,price=@price,status=@status,total_seats=@total_seats,version=version+1,updated_at=@now
      WHERE id=@id AND version=@version`),
    cancel: db.prepare(`UPDATE screenings SET status='cancelled',cancelled_at=@now,cancelled_by=@by,cancel_reason=@reason,version=version+1,updated_at=@now
      WHERE id=@id AND version=@version`),
  };
  const view = (id) => mapAdminScreening(q.byId.get(id), now().abs);
  const parseId = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null; };
  const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  const inScope = (scope, row) => scope === null || (scope !== 'none' && row.branch_id === scope);

  const router = express.Router();

  // Lista (todas las funciones, tambien borradores y canceladas). El personal de sede ve solo su sede.
  router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const scope = branchScope(req);
    if (scope === 'none') return res.json({ screenings: [] });
    const { branchId, hallId, movieId, from, to, status } = req.query;
    const errors = {};
    const int = (k, v) => { if (v === undefined) return null; const n = Number(v); if (!Number.isInteger(n) || n <= 0) { errors[k] = 'invalid'; return null; } return n; };
    const fBranch = int('branchId', branchId); const fHall = int('hallId', hallId); const fMovie = int('movieId', movieId);
    for (const [k, v] of [['from', from], ['to', to]]) if (v !== undefined && !isRealDate(v)) errors[k] = 'invalid_date';
    if (status !== undefined && !['draft', 'scheduled', 'active', 'sold_out', 'finished', 'cancelled'].includes(status)) errors.status = 'invalid_option';
    if (Object.keys(errors).length) return failValidation(res, errors);
    const t = now().abs;
    const rows = q.all.all()
      .filter((r) => scope === null || r.branch_id === scope)
      .filter((r) => (scope !== null || fBranch === null || r.branch_id === fBranch)
        && (fHall === null || r.hall_id === fHall) && (fMovie === null || r.movie_id === fMovie)
        && (!from || r.starts_on >= from) && (!to || r.starts_on <= to))
      .map((r) => mapAdminScreening(r, t))
      .filter((r) => !status || r.status === status);
    res.json({ screenings: rows });
  });

  router.get('/:id', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = parseId(req);
    const row = id && q.byId.get(id);
    if (!row || !inScope(branchScope(req), row)) return res.status(404).json({ error: 'not_found' });
    res.json({ screening: mapAdminScreening(row, now().abs) });
  });

  router.post('/', requirePerm('create_screening'), (req, res) => {
    const b = bodyOf(req);
    const scope = branchScope(req);
    const given = new Set(['movieId', 'hallId', 'date', 'startTime', 'language', 'format', 'status']);
    const m = { movieId: b.movieId, hallId: b.hallId, date: b.date, startTime: b.startTime, language: b.language, format: b.format, price: b.price, status: b.status ?? 'scheduled' };
    if (b.price !== undefined && b.price !== null) given.add('price');
    const errors = validateFields(m, given);
    if (Object.keys(errors).length) return failValidation(res, errors);
    const out = db.transaction(() => {
      const hall = db.prepare('SELECT * FROM halls WHERE id = ?').get(m.hallId);
      if (!hall || !inScope(scope, { branch_id: hall.branch_id })) return { status: 404, body: { error: 'not_found', field: 'hallId' } };
      const r = rules.check(m, { nowAbs: now().abs });
      if (r.err) return r.err;
      const price = m.price ?? r.ctx.hall.price_base;
      const info = q.insert.run({
        movie_id: m.movieId, hall_id: m.hallId, branch_id: r.ctx.hall.branch_id, starts_on: m.date, start_time: m.startTime,
        end_time: r.ctx.endTime, language: m.language, format: m.format, price, status: m.status, total_seats: r.ctx.totalSeats,
        by: req.user.id, now: clock(),
      });
      audit(req, 'screening.create', 'screening', Number(info.lastInsertRowid), r.ctx.hall.branch_id, { status: m.status });
      return { status: 201, body: { screening: view(Number(info.lastInsertRowid)) } };
    }).immediate();
    res.status(out.status).json(out.body);
  });

  router.patch('/:id', requirePerm('create_screening'), (req, res) => {
    const b = bodyOf(req);
    const id = parseId(req);
    const scope = branchScope(req);
    if (!(Number.isInteger(b.version) && b.version >= 1)) return failValidation(res, { version: 'required' });
    const out = db.transaction(() => {
      const row = id && q.byId.get(id);
      if (!row || !inScope(scope, row)) return { status: 404, body: { error: 'not_found' } };
      if (row.version !== b.version) return { status: 409, body: { error: 'stale', current: mapAdminScreening(row, now().abs) } };
      const eff = mapAdminScreening(row, now().abs).status;
      if (eff === 'cancelled' || eff === 'finished') return { status: 409, body: { error: 'not_editable', status: eff } };
      const cur = {
        movieId: row.movie_id, hallId: row.hall_id, date: row.starts_on, startTime: row.start_time, language: row.language,
        format: row.format, price: row.price, status: EDITABLE_STATUSES.includes(row.status) ? row.status : 'scheduled',
      };
      const given = new Set(FIELDS.filter((k) => b[k] !== undefined));
      const m = { ...cur };
      for (const k of given) m[k] = b[k];
      const errors = validateFields(m, given);
      if (Object.keys(errors).length) return { status: 400, body: { error: 'validation', errors } };
      const changed = [...given].filter((k) => m[k] !== cur[k]);
      if (row.has_sales) {
        const locked = changed.filter((k) => LOCKED_WITH_SALES.includes(k) || (k === 'status' && m.status === 'draft'));
        if (locked.length) return { status: 409, body: { error: 'has_sales', fields: locked } };
      }
      let endTime = row.end_time; let totalSeats = row.total_seats; let branchId = row.branch_id;
      if (changed.some((k) => RULE_FIELDS.includes(k))) {
        const hall = db.prepare('SELECT * FROM halls WHERE id = ?').get(m.hallId);
        if (hall && !inScope(scope, { branch_id: hall.branch_id })) return { status: 404, body: { error: 'not_found', field: 'hallId' } };
        const r = rules.check(m, { excludeId: id, nowAbs: now().abs });
        if (r.err) return r.err;
        endTime = r.ctx.endTime; totalSeats = r.ctx.totalSeats; branchId = r.ctx.hall.branch_id;
      }
      const info = q.update.run({
        id, version: b.version, movie_id: m.movieId, hall_id: m.hallId, branch_id: branchId, starts_on: m.date, start_time: m.startTime,
        end_time: endTime, language: m.language, format: m.format, price: m.price,
        status: changed.includes('status') ? m.status : row.status, total_seats: totalSeats, now: clock(),
      });
      if (info.changes !== 1) return { status: 409, body: { error: 'stale', current: view(id) } };
      audit(req, 'screening.update', 'screening', id, branchId, { fields: changed });
      return { status: 200, body: { screening: view(id) } };
    }).immediate();
    res.status(out.status).json(out.body);
  });

  router.post('/:id/cancel', requirePerm('cancel_screening'), (req, res) => {
    const b = bodyOf(req);
    const id = parseId(req);
    const scope = branchScope(req);
    const errors = {};
    if (!(Number.isInteger(b.version) && b.version >= 1)) errors.version = 'required';
    if (b.confirm !== true) errors.confirm = 'required';
    const reason = typeof b.reason === 'string' ? b.reason.trim() : '';
    if (!reason) errors.reason = 'required'; else if (reason.length > REASON_MAX) errors.reason = 'too_long';
    if (Object.keys(errors).length) return failValidation(res, errors);
    const out = db.transaction(() => {
      const row = id && q.byId.get(id);
      if (!row || !inScope(scope, row)) return { status: 404, body: { error: 'not_found' } };
      if (row.version !== b.version) return { status: 409, body: { error: 'stale', current: mapAdminScreening(row, now().abs) } };
      const eff = mapAdminScreening(row, now().abs).status;
      if (eff === 'cancelled') return { status: 409, body: { error: 'already_cancelled' } };
      if (eff === 'finished') return { status: 409, body: { error: 'not_cancellable', status: eff } };
      const info = q.cancel.run({ id, version: b.version, now: clock(), by: req.user.id, reason });
      if (info.changes !== 1) return { status: 409, body: { error: 'stale', current: view(id) } };
      // Reembolso SIMULADO de las ordenes de la funcion y butacas liberadas, en la misma transaccion.
      const refund = orders.refundScreening(id, req.user.id);
      // El texto del motivo no va al registro de auditoria (podria contener datos personales).
      audit(req, 'screening.cancel', 'screening', id, row.branch_id, { sold: !!row.has_sales, refundedOrders: refund.refundedOrders });
      return { status: 200, body: { screening: view(id), soldSeats: row.booked_seats, refundedOrders: refund.refundedOrders, refundedAmount: refund.refundedAmount, refundsPending: false } };
    }).immediate();
    res.status(out.status).json(out.body);
  });

  return { router };
}
