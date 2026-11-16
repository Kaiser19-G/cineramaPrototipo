// Ventas reales para el panel: lista de ordenes (Pagos), resumen de reportes y tablero de hoy (Dashboard).
// Todo se calcula en SQL/servidor; los dias son de America/Lima (UTC-5 fijo). Nunca se devuelve correo completo, celular,
// DNI, user_id ni la clave de idempotencia, y nunca se escribe el codigo de orden en consola ni en audit_log.
import express from 'express';
import { createDemoGate } from '../auth/demoGate.js';
import { addDaysToDate, nowInLima, todayInLima } from '../../src/data/limaDate.js';
import { compareSeats } from '../../src/shared/seatLayout.js';
import { REFUND_REASONS } from '../../src/shared/purchase.js';
import { branchScope, failValidation, isRealDate } from './common.js';

const LIMA_OFFSET_MS = 5 * 3600 * 1000;
export const MAX_RANGE_DAYS = 92;
const STATUSES = ['pending', 'approved', 'rejected', 'refunded', 'cancelled'];
const CHANNELS = ['web', 'counter'];
const MAX_PAGE_SIZE = 50;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;
const pct = (a, b) => (b > 0 ? Math.round((a / b) * 1000) / 10 : 0);
const maskEmail = (e) => { const [u, d] = String(e).split('@'); return `${u?.[0] ?? ''}***@${d ?? ''}`; };
// Instante (ms) de la medianoche de Lima de una fecha 'YYYY-MM-DD'.
export const limaDayStartMs = (ymd) => Date.parse(`${ymd}T00:00:00Z`) + LIMA_OFFSET_MS;
const DAY_SQL = `date((o.created_ms - ${LIMA_OFFSET_MS}) / 1000, 'unixepoch')`;
const hasAny = (req, ...perms) => perms.some((p) => req.user?.perms?.includes(p));
const likeOf = (t) => `%${t.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;

export function createSales(db, auth, opts = {}) {
  const { clock = Date.now } = opts;
  const { demoGate } = createDemoGate(db);
  const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  const staff = [auth.loadSession, auth.requireAuth, auth.requireTier('central', 'branch'), noStore];
  const forbid = (res) => res.status(403).json({ error: 'forbidden' });
  // Sede efectiva: null = todas. El personal de sede queda fijo en la suya (un branchId ajeno en la URL se ignora).
  const effectiveBranch = (req, requested) => {
    const scope = branchScope(req);
    if (scope === null) return requested ?? null;
    return scope === 'none' ? -1 : scope;
  };
  const parseBranch = (req, errors) => {
    if (req.query.branchId === undefined || req.query.branchId === '') return null;
    const n = Number(req.query.branchId);
    if (!Number.isInteger(n) || n < 1) { errors.branchId = 'invalid'; return null; }
    return n;
  };

  const seatsOf = db.prepare('SELECT seat FROM order_seats WHERE order_id = ?');

  // ───────────────────────── Ordenes ─────────────────────────
  const orders = express.Router();
  orders.use(...staff, demoGate);
  orders.get('/', (req, res) => {
    if (!hasAny(req, 'view_all_sales', 'view_local_sales', 'view_orders')) return forbid(res);
    const errors = {};
    const requested = parseBranch(req, errors);
    const { status, channel, from, to } = req.query;
    if (status !== undefined && status !== '' && !STATUSES.includes(status)) errors.status = 'invalid_option';
    if (channel !== undefined && channel !== '' && !CHANNELS.includes(channel)) errors.channel = 'invalid_option';
    for (const [k, v] of [['from', from], ['to', to]]) if (v !== undefined && v !== '' && !isRealDate(v)) errors[k] = 'invalid_date';
    if (!errors.from && !errors.to && from && to && from > to) errors.to = 'before_from';
    const text = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    if (text.length > 80) errors.q = 'too_long';
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isInteger(page) || page < 1) errors.page = 'invalid';
    const pageSize = req.query.pageSize === undefined ? 20 : Number(req.query.pageSize);
    if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > MAX_PAGE_SIZE) errors.pageSize = 'invalid';
    if (Object.keys(errors).length) return failValidation(res, errors);

    const branch = effectiveBranch(req, requested);
    const where = ['1=1']; const args = [];
    if (branch !== null) { where.push('o.branch_id = ?'); args.push(branch); }
    if (status) { where.push('o.status = ?'); args.push(status); }
    if (channel) { where.push('o.channel = ?'); args.push(channel); }
    if (from) { where.push('o.created_ms >= ?'); args.push(limaDayStartMs(from)); }
    if (to) { where.push('o.created_ms < ?'); args.push(limaDayStartMs(addDaysToDate(to, 1))); }
    if (text) {
      where.push(`(lower(o.customer_name) LIKE lower(?) ESCAPE '\\' OR upper(o.id) LIKE upper(?) ESCAPE '\\')`);
      args.push(likeOf(text), likeOf(text));
    }
    const W = where.join(' AND ');
    const t = db.prepare(`SELECT COUNT(*) n,
        COALESCE(SUM(CASE WHEN o.status='approved' THEN o.amount END),0) revenue,
        COALESCE(SUM(CASE WHEN o.status='refunded' THEN o.amount END),0) refunded,
        COALESCE(SUM(o.status='rejected'),0) rejected
      FROM orders o WHERE ${W}`).get(...args);
    const rows = db.prepare(`SELECT o.id, o.customer_name, o.email, o.amount, o.method, o.status, o.channel, o.presale, o.payment_ref,
        o.created_ms, o.created_at, o.refunded_at, o.refund_reason, o.branch_id, b.name branch_name, s.id screening_id, s.starts_on,
        s.start_time, s.format, s.language, m.title movie_title, h.name hall_name
      FROM orders o JOIN screenings s ON s.id = o.screening_id JOIN movies m ON m.id = s.movie_id
        JOIN branches b ON b.id = o.branch_id JOIN halls h ON h.id = s.hall_id
      WHERE ${W} ORDER BY o.created_ms DESC, o.id LIMIT ? OFFSET ?`).all(...args, pageSize, (page - 1) * pageSize);
    res.json({
      orders: rows.map((o) => ({
        code: o.id, customerName: o.customer_name, emailMasked: maskEmail(o.email), amount: o.amount, status: o.status,
        channel: o.channel, presale: !!o.presale, createdAt: o.created_ms, createdLima: o.created_at,
        branch: { id: o.branch_id, name: o.branch_name },
        screening: { id: o.screening_id, date: o.starts_on, startTime: o.start_time, format: o.format, language: o.language, movieTitle: o.movie_title, hallName: o.hall_name },
        seats: seatsOf.all(o.id).map((r) => r.seat).sort(compareSeats),
        payment: { method: o.method, simulated: true, ref: (o.payment_ref || '').split('|')[0] },
        refund: o.status === 'refunded' ? { at: o.refunded_at ?? null, reasonCode: o.refund_reason, reason: REFUND_REASONS[o.refund_reason] ?? null } : null,
      })),
      totals: { revenue: round2(t.revenue), refunded: round2(t.refunded), rejected: t.rejected, transactions: t.n },
      page, pageSize, total: t.n, pages: Math.max(1, Math.ceil(t.n / pageSize)),
      scope: { branchId: branch === null ? null : branch },
    });
  });

  // ───────────────────────── Reportes ─────────────────────────
  const reports = express.Router();
  reports.use(...staff);
  reports.get('/summary', (req, res) => {
    if (!hasAny(req, 'view_global_reports', 'view_local_reports')) return forbid(res);
    const errors = {};
    const requested = parseBranch(req, errors);
    const today = todayInLima(new Date(clock()));
    const { from: qFrom, to: qTo } = req.query;
    for (const [k, v] of [['from', qFrom], ['to', qTo]]) if (v !== undefined && v !== '' && !isRealDate(v)) errors[k] = 'invalid_date';
    if (Object.keys(errors).length) return failValidation(res, errors);
    const to = qTo || today;
    const from = qFrom || addDaysToDate(to, -6);
    if (from > to) return failValidation(res, { to: 'before_from' });
    const days = Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000) + 1;
    if (days > MAX_RANGE_DAYS) return failValidation(res, { to: 'range_too_long', maxDays: MAX_RANGE_DAYS });
    const branch = effectiveBranch(req, requested);
    const bSql = branch === null ? '' : ' AND o.branch_id = ?';
    const bArg = branch === null ? [] : [branch];
    const lo = limaDayStartMs(from); const hi = limaDayStartMs(addDaysToDate(to, 1));
    const base = [lo, hi, ...bArg];
    const RANGE = `o.created_ms >= ? AND o.created_ms < ?${bSql}`;

    const st = db.prepare(`SELECT COUNT(*) n, COALESCE(SUM(o.status='approved'),0) approved, COALESCE(SUM(o.status='rejected'),0) rejected,
        COALESCE(SUM(o.status='refunded'),0) refunded, COALESCE(SUM(o.status='cancelled'),0) cancelled, COALESCE(SUM(o.status='pending'),0) pending,
        COALESCE(SUM(CASE WHEN o.status='approved' THEN o.amount END),0) revenue,
        COALESCE(SUM(CASE WHEN o.status='refunded' THEN o.amount END),0) refundedAmount
      FROM orders o WHERE ${RANGE}`).get(...base);
    const tickets = db.prepare(`SELECT COUNT(*) c FROM order_seats os JOIN orders o ON o.id = os.order_id WHERE o.status = 'approved' AND ${RANGE}`).get(...base).c;

    const dayRows = db.prepare(`SELECT ${DAY_SQL} d, COALESCE(SUM(o.amount),0) revenue, COUNT(*) orders,
        COALESCE(SUM((SELECT COUNT(*) FROM order_seats os WHERE os.order_id = o.id)),0) tickets
      FROM orders o WHERE o.status = 'approved' AND ${RANGE} GROUP BY d`).all(...base);
    const dayMap = new Map(dayRows.map((r) => [r.d, r]));
    const byDay = [];
    for (let i = 0; i < days; i++) {
      const date = addDaysToDate(from, i); const r = dayMap.get(date);
      byDay.push({ date, revenue: round2(r?.revenue), orders: r?.orders ?? 0, tickets: r?.tickets ?? 0 });
    }

    const approvedGroup = (select, join, groupBy, order) => db.prepare(`SELECT ${select}, COUNT(*) orders, COALESCE(SUM(o.amount),0) revenue,
        COALESCE(SUM((SELECT COUNT(*) FROM order_seats os WHERE os.order_id = o.id)),0) tickets
      FROM orders o ${join} WHERE o.status = 'approved' AND ${RANGE} GROUP BY ${groupBy} ORDER BY ${order}`).all(...base);
    const byBranch = approvedGroup('b.id id, b.name name', 'JOIN branches b ON b.id = o.branch_id', 'b.id', 'revenue DESC, b.id')
      .map((r) => ({ id: r.id, name: r.name, orders: r.orders, revenue: round2(r.revenue), tickets: r.tickets }));
    const byMovie = approvedGroup('m.id id, m.title title', 'JOIN screenings s ON s.id = o.screening_id JOIN movies m ON m.id = s.movie_id', 'm.id', 'tickets DESC, revenue DESC, m.id')
      .map((r) => ({ id: r.id, title: r.title, orders: r.orders, revenue: round2(r.revenue), tickets: r.tickets }));
    const byChannel = approvedGroup('o.channel channel', '', 'o.channel', 'o.channel')
      .map((r) => ({ channel: r.channel, orders: r.orders, revenue: round2(r.revenue), tickets: r.tickets }));
    const byPresale = approvedGroup('o.presale presale', '', 'o.presale', 'o.presale')
      .map((r) => ({ presale: !!r.presale, orders: r.orders, revenue: round2(r.revenue), tickets: r.tickets }));

    // Ocupacion: funciones (no borrador ni cancelada) cuya fecha cae en el rango, butacas activas sobre capacidad.
    const sBranch = branch === null ? '' : ' AND s.branch_id = ?';
    const scrRows = db.prepare(`SELECT s.id, s.starts_on, s.start_time, s.total_seats capacity, m.title movie_title, h.id hall_id, h.name hall_name,
        b.id branch_id, b.name branch_name,
        (SELECT COUNT(*) FROM order_seats os WHERE os.screening_id = s.id AND os.active = 1) sold
      FROM screenings s JOIN movies m ON m.id = s.movie_id JOIN halls h ON h.id = s.hall_id JOIN branches b ON b.id = s.branch_id
      WHERE s.status NOT IN ('draft','cancelled') AND s.starts_on >= ? AND s.starts_on <= ?${sBranch}
      ORDER BY s.starts_on, s.start_time, s.id`).all(from, to, ...bArg);
    const hallMap = new Map();
    let sold = 0; let capacity = 0;
    for (const r of scrRows) {
      sold += r.sold; capacity += r.capacity;
      const h = hallMap.get(r.hall_id) ?? { hallId: r.hall_id, hallName: r.hall_name, branchId: r.branch_id, branchName: r.branch_name, screenings: 0, sold: 0, capacity: 0 };
      h.screenings++; h.sold += r.sold; h.capacity += r.capacity; hallMap.set(r.hall_id, h);
    }
    const byHall = [...hallMap.values()].map((h) => ({ ...h, occupancy: pct(h.sold, h.capacity) }));
    const MAX_SCREENINGS = 200;
    const byScreening = scrRows.slice(0, MAX_SCREENINGS).map((r) => ({
      id: r.id, date: r.starts_on, startTime: r.start_time, movieTitle: r.movie_title, hallName: r.hall_name, branchName: r.branch_name,
      sold: r.sold, capacity: r.capacity, occupancy: pct(r.sold, r.capacity),
    }));

    const attempts = st.approved + st.refunded + st.rejected;
    res.json({
      range: { from, to, days, maxDays: MAX_RANGE_DAYS },
      scope: { branchId: branch },
      totals: {
        revenue: round2(st.revenue), tickets, transactions: st.n, approved: st.approved, rejected: st.rejected, refunded: st.refunded,
        refundedAmount: round2(st.refundedAmount), cancelled: st.cancelled, pending: st.pending,
        // Pagos intentados que fueron aceptados (aprobados o luego reembolsados) sobre los intentados (sin cancelados/pendientes).
        approvalRate: pct(st.approved + st.refunded, attempts),
      },
      occupancy: { sold, capacity, screenings: scrRows.length, rate: pct(sold, capacity) },
      byDay, byBranch, byMovie, byHall, byScreening, screeningsTruncated: scrRows.length > MAX_SCREENINGS, byChannel, byPresale,
    });
  });

  // ───────────────────────── Dashboard (hoy en Lima) ─────────────────────────
  const dashboard = express.Router();
  dashboard.use(...staff);
  dashboard.get('/', (req, res) => {
    const errors = {};
    const requested = parseBranch(req, errors);
    if (Object.keys(errors).length) return failValidation(res, errors);
    const now = nowInLima(new Date(clock()));
    const today = now.date;
    const branch = effectiveBranch(req, requested);
    const bSql = branch === null ? '' : ' AND o.branch_id = ?';
    const bArg = branch === null ? [] : [branch];
    const sBranch = branch === null ? '' : ' AND s.branch_id = ?';
    const lo = limaDayStartMs(today); const hi = limaDayStartMs(addDaysToDate(today, 1));
    const scr = db.prepare(`SELECT s.id, s.starts_on, s.start_time, s.end_time, s.status, s.total_seats capacity, m.title movie_title, h.name hall_name, b.name branch_name,
        (SELECT COUNT(*) FROM order_seats os WHERE os.screening_id = s.id AND os.active = 1) sold
      FROM screenings s JOIN movies m ON m.id = s.movie_id JOIN halls h ON h.id = s.hall_id JOIN branches b ON b.id = s.branch_id
      WHERE s.status NOT IN ('draft','cancelled') AND s.starts_on >= ? AND s.starts_on <= ?${sBranch}
      ORDER BY s.starts_on, s.start_time, s.id`);
    const outScr = (r) => ({ id: r.id, date: r.starts_on, startTime: r.start_time, endTime: r.end_time, movieTitle: r.movie_title, hallName: r.hall_name,
      branchName: r.branch_name, sold: r.sold, capacity: r.capacity, occupancy: pct(r.sold, r.capacity) });
    const todayRows = scr.all(today, today, ...bArg);
    const sold = todayRows.reduce((a, r) => a + r.sold, 0); const capacity = todayRows.reduce((a, r) => a + r.capacity, 0);
    // Proximas: de manana en adelante (las de hoy ya estan en `list`), hasta 7 dias.
    const upcoming = scr.all(addDaysToDate(today, 1), addDaysToDate(today, 7), ...bArg).slice(0, 6).map(outScr);
    const body = {
      today, scope: { branchId: branch },
      screenings: { today: todayRows.length, list: todayRows.map(outScr), upcoming },
      occupancy: { sold, capacity, rate: pct(sold, capacity) },
      money: null, activity: null,
    };
    if (hasAny(req, 'view_all_sales', 'view_local_sales')) {
      const r = db.prepare(`SELECT COALESCE(SUM(CASE WHEN o.status='approved' THEN o.amount END),0) revenue, COALESCE(SUM(o.status='rejected'),0) rejected
        FROM orders o WHERE o.created_ms >= ? AND o.created_ms < ?${bSql}`).get(lo, hi, ...bArg);
      const tickets = db.prepare(`SELECT COUNT(*) c FROM order_seats os JOIN orders o ON o.id = os.order_id
        WHERE o.status = 'approved' AND o.created_ms >= ? AND o.created_ms < ?${bSql}`).get(lo, hi, ...bArg).c;
      body.money = { revenue: round2(r.revenue), tickets, rejected: r.rejected };
    }
    // Ultimas acciones (audit_log: solo ids y codigos). Admin central: todas; gerente: las de su sede.
    if (hasAny(req, 'view_global_reports', 'view_local_reports')) {
      const aSql = branch === null ? '' : 'WHERE a.branch_id = ?';
      body.activity = db.prepare(`SELECT a.id, a.at, a.action, a.entity, a.entity_id, a.branch_id, u.name actor_name FROM audit_log a
        LEFT JOIN users u ON u.id = a.actor_id ${aSql} ORDER BY a.id DESC LIMIT 8`).all(...bArg)
        .map((r) => ({ id: r.id, at: r.at, action: r.action, entity: r.entity, entityId: r.entity_id, branchId: r.branch_id, actorName: r.actor_name ?? null }));
    }
    res.json(body);
  });

  return { orders, reports, dashboard };
}
