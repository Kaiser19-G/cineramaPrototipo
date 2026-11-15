// Servicio de compra de entradas. UNICO modulo que escribe order_seats y screenings.booked_seats:
// la verdad de las butacas vendidas es order_seats (active = 1); booked_seats es una cache que se recalcula
// aqui, dentro de la misma transaccion que cambia las butacas. Nunca se escribe el estado 'sold_out'.
// El pago es SIMULADO: no se recibe, guarda ni registra ningun dato de tarjeta.
import crypto from 'node:crypto';
import { nowInLima, todayInLima } from '../../src/data/limaDate.js';
import { effectiveStatus, screeningSpan } from '../../src/shared/scheduling.js';
import { isPresaleEffective, PRESALE_MAX_TICKETS } from '../../src/shared/presale.js';
import { layoutFor, isValidSeat, compareSeats } from '../../src/shared/seatLayout.js';
import { MAX_TICKETS_PER_SCREENING, WEB_SALE_CUTOFF_MINUTES, SIMULATED_OUTCOMES, REFUND_REASONS } from '../../src/shared/purchase.js';

// Sin 0, 1, I, L ni O (se confunden al leerlos o teclearlos): 31 simbolos, 10 caracteres = ~49,5 bits.
const CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTUVWXYZ';
const randomChars = (n) => Array.from({ length: n }, () => CODE_ALPHABET[crypto.randomInt(CODE_ALPHABET.length)]).join('');
export const newOrderCode = () => `CIN-${randomChars(5)}-${randomChars(5)}`;
export const ORDER_CODE_RE = /^CIN-[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/;
const KEY_RE = /^[A-Za-z0-9_-]{8,64}$/;
const round2 = (n) => Math.round(n * 100) / 100;

const limaStamp = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

export function createOrderService(db, clock = Date.now) {
  const q = {
    screening: db.prepare(`SELECT s.*, m.title AS movie_title, m.status AS movie_status, m.presale AS movie_presale,
        m.release_date AS movie_release_date, m.poster AS movie_poster, m.duration AS movie_duration, m.rating AS movie_rating,
        m.language AS movie_language, b.name AS branch_name, b.city AS branch_city, b.status AS branch_status,
        h.name AS hall_name, mb.active AS mb_active
      FROM screenings s JOIN movies m ON m.id = s.movie_id JOIN branches b ON b.id = s.branch_id JOIN halls h ON h.id = s.hall_id
      LEFT JOIN movie_branch mb ON mb.movie_id = s.movie_id AND mb.branch_id = s.branch_id WHERE s.id = ?`),
    taken: db.prepare('SELECT seat FROM order_seats WHERE screening_id = ? AND active = 1'),
    activeCount: db.prepare('SELECT COUNT(*) c FROM order_seats WHERE screening_id = ? AND active = 1'),
    userScreeningCount: db.prepare(`SELECT COUNT(*) c FROM order_seats os JOIN orders o ON o.id = os.order_id
      WHERE o.user_id = ? AND os.screening_id = ? AND os.active = 1 AND o.status = 'approved'`),
    userPresaleCount: db.prepare(`SELECT COUNT(*) c FROM order_seats os JOIN orders o ON o.id = os.order_id JOIN screenings s ON s.id = os.screening_id
      WHERE o.user_id = ? AND s.movie_id = ? AND o.presale = 1 AND os.active = 1 AND o.status = 'approved'`),
    byIdem: db.prepare('SELECT * FROM orders WHERE user_id = ? AND idempotency_key = ?'),
    orderSeats: db.prepare('SELECT seat, checked_in_at FROM order_seats WHERE order_id = ?'),
    insertOrder: db.prepare(`INSERT INTO orders (id,screening_id,branch_id,user_id,customer_name,email,amount,method,status,created_at,
        channel,presale,idempotency_key,payment_ref,created_ms)
      VALUES (@id,@screening_id,@branch_id,@user_id,@customer_name,@email,@amount,'card',@status,@created_at,'web',@presale,@key,@payment_ref,@now)`),
    insertSeat: db.prepare('INSERT INTO order_seats (order_id,screening_id,seat,active,unit_price) VALUES (?,?,?,?,?)'),
    sync: db.prepare(`UPDATE screenings SET booked_seats = (SELECT COUNT(*) FROM order_seats os WHERE os.screening_id = screenings.id AND os.active = 1) WHERE id = ?`),
    approvedOfScreening: db.prepare(`SELECT id, amount FROM orders WHERE screening_id = ? AND status = 'approved'`),
    pendingOfScreening: db.prepare(`SELECT id FROM orders WHERE screening_id = ? AND status = 'pending'`),
    refund: db.prepare(`UPDATE orders SET status = 'refunded', refunded_at = @now, refund_reason = @reason, refunded_by = @by,
        payment_ref = payment_ref || '|RFD-' || @ref WHERE id = @id`),
    cancelOrder: db.prepare(`UPDATE orders SET status = 'cancelled' WHERE id = ?`),
    releaseSeats: db.prepare('UPDATE order_seats SET active = 0 WHERE order_id = ?'),
  };

  // Unico lugar donde se escribe booked_seats.
  const syncBooked = (screeningId) => q.sync.run(screeningId);

  const nowAbs = () => nowInLima(new Date(clock())).abs;

  // Estado de venta de una funcion: { onSale, reason } (reason: not_on_sale | sold_out | closed).
  function saleState(row, taken) {
    const eff = effectiveStatus({ ...row, booked_seats: taken }, nowAbs());
    if (['draft', 'cancelled', 'finished'].includes(eff)) return { eff, onSale: false, reason: eff === 'finished' ? 'closed' : 'not_on_sale' };
    const movieOk = row.movie_status === 'active' || (row.movie_status === 'upcoming' && !!row.movie_presale);
    if (!movieOk || row.branch_status !== 'active' || !row.mb_active) return { eff, onSale: false, reason: 'not_on_sale' };
    const start = screeningSpan(row.starts_on, row.start_time, row.end_time).start;
    if (nowAbs() >= start - WEB_SALE_CUTOFF_MINUTES) return { eff, onSale: false, reason: 'closed' };
    if (taken >= row.total_seats) return { eff, onSale: false, reason: 'sold_out' };
    if (eff === 'sold_out') return { eff, onSale: false, reason: 'sold_out' };
    return { eff, onSale: true, reason: null };
  }

  const presaleActive = (row) => isPresaleEffective({ presale: !!row.movie_presale, releaseDate: row.movie_release_date }, todayInLima(new Date(clock())));

  // Cupo restante de una cuenta para una funcion.
  function limitsFor(userId, row) {
    const bought = userId ? q.userScreeningCount.get(userId, row.id).c : 0;
    const out = {
      perOrder: MAX_TICKETS_PER_SCREENING,
      screening: { limit: MAX_TICKETS_PER_SCREENING, bought, remaining: Math.max(0, MAX_TICKETS_PER_SCREENING - bought) },
      presale: null,
    };
    if (presaleActive(row)) {
      const pb = userId ? q.userPresaleCount.get(userId, row.movie_id).c : 0;
      out.presale = { limit: PRESALE_MAX_TICKETS, bought: pb, remaining: Math.max(0, PRESALE_MAX_TICKETS - pb) };
    }
    out.remaining = Math.min(out.screening.remaining, out.presale ? out.presale.remaining : Infinity);
    return out;
  }

  // Datos publicos del mapa de butacas de una funcion. null = no existe o no se ofrece (borrador, cancelada).
  function seatMap(screeningId, userId = null) {
    const row = q.screening.get(screeningId);
    if (!row || row.status === 'draft' || row.status === 'cancelled') return null;
    const taken = q.taken.all(screeningId).map((r) => r.seat).sort(compareSeats);
    const state = saleState(row, taken.length);
    return {
      screening: {
        id: row.id, status: state.eff, date: row.starts_on, startTime: row.start_time, endTime: row.end_time, format: row.format,
        language: row.language, price: row.price, totalSeats: row.total_seats, soldCount: taken.length,
        onSale: state.onSale, reason: state.reason,
        movie: { id: row.movie_id, title: row.movie_title, poster: row.movie_poster, duration: row.movie_duration, rating: row.movie_rating,
          language: row.movie_language, presale: presaleActive(row), releaseDate: row.movie_release_date },
        branch: { id: row.branch_id, name: row.branch_name, city: row.branch_city },
        hall: { name: row.hall_name },
      },
      layout: layoutFor(row.total_seats),
      taken,
      limits: limitsFor(userId, row),
    };
  }

  const mapOrder = (o) => {
    const s = q.screening.get(o.screening_id);
    return {
      code: o.id, status: o.status, amount: o.amount, createdAt: o.created_ms ?? null, presale: !!o.presale,
      screening: s && {
        id: s.id, date: s.starts_on, startTime: s.start_time, endTime: s.end_time, format: s.format, language: s.language,
        movieTitle: s.movie_title, branchName: s.branch_name, hallName: s.hall_name,
      },
      seats: q.orderSeats.all(o.id).sort((a, b) => compareSeats(a.seat, b.seat)).map((r) => ({ seat: r.seat, checkedIn: !!r.checked_in_at })),
      refund: o.status === 'refunded' ? { at: o.refunded_at ?? null, reasonCode: o.refund_reason, reason: REFUND_REASONS[o.refund_reason] ?? null } : null,
      payment: { method: o.method, simulated: true, ref: (o.payment_ref || '').split('|')[0] },
    };
  };

  const fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });

  // Valida el cuerpo; devuelve { errors } o { value }.
  function parseBody(b) {
    const errors = {};
    const body = b && typeof b === 'object' && !Array.isArray(b) ? b : {};
    const screeningId = body.screeningId;
    if (!(Number.isInteger(screeningId) && screeningId > 0)) errors.screeningId = screeningId === undefined ? 'required' : 'invalid';
    let seats = body.seats;
    if (!Array.isArray(seats) || seats.length === 0) errors.seats = 'required';
    else if (seats.length > MAX_TICKETS_PER_SCREENING) errors.seats = 'too_many';
    else if (seats.some((s) => typeof s !== 'string')) errors.seats = 'invalid';
    else if (new Set(seats).size !== seats.length) errors.seats = 'duplicated';
    if (typeof body.idempotencyKey !== 'string' || !KEY_RE.test(body.idempotencyKey)) errors.idempotencyKey = body.idempotencyKey === undefined ? 'required' : 'invalid';
    const pay = body.payment && typeof body.payment === 'object' ? body.payment : {};
    const outcome = pay.simulatedOutcome ?? 'approved';
    if (pay.method !== 'card') errors.payment = 'invalid_method';
    else if (!SIMULATED_OUTCOMES.includes(outcome)) errors.payment = 'invalid_outcome';
    if (Object.keys(errors).length) return { errors };
    return { value: { screeningId, seats: [...seats].sort(compareSeats), key: body.idempotencyKey, outcome } };
  }

  // Compra (pago simulado). `user`: { id, name, email }. Devuelve { status, body } y lo ejecuta en UNA transaccion.
  function purchase(user, rawBody) {
    const parsed = parseBody(rawBody);
    if (parsed.errors) return fail(400, 'validation', { errors: parsed.errors });
    const { screeningId, seats, key, outcome } = parsed.value;
    return db.transaction(() => {
      // 1. Idempotencia: la misma clave devuelve la orden original.
      const prev = q.byIdem.get(user.id, key);
      if (prev) {
        const prevSeats = q.orderSeats.all(prev.id).map((r) => r.seat).sort(compareSeats);
        const same = prev.screening_id === screeningId && prevSeats.join() === seats.join()
          && (prev.status === 'rejected') === (outcome === 'declined');
        if (!same) return fail(409, 'idempotency_conflict');
        return prev.status === 'rejected'
          ? { status: 402, body: { error: 'payment_declined', order: mapOrder(prev), replayed: true } }
          : { status: 200, body: { order: mapOrder(prev), replayed: true } };
      }
      // 2. Funcion y estado de venta.
      const row = q.screening.get(screeningId);
      if (!row || row.status === 'draft' || row.status === 'cancelled') return fail(404, 'not_found');
      const taken = q.activeCount.get(screeningId).c;
      const state = saleState(row, taken);
      if (!state.onSale) return fail(409, state.reason === 'sold_out' ? 'sold_out' : 'not_on_sale', { status: state.eff });
      // 3. Butacas validas y libres.
      if (!seats.every((s) => isValidSeat(row.total_seats, s))) return fail(400, 'validation', { errors: { seats: 'invalid' } });
      const busy = q.taken.all(screeningId).map((r) => r.seat).filter((s) => seats.includes(s));
      if (busy.length) return fail(409, 'seats_taken', { seats: busy.sort(compareSeats) });
      // 4. Limites (en la misma transaccion: dos compras de una cuenta no pueden pasarlos).
      const lim = limitsFor(user.id, row);
      if (lim.presale && seats.length > lim.presale.remaining) {
        return fail(409, 'limit_exceeded', { scope: 'presale_movie', limit: lim.presale.limit, bought: lim.presale.bought, remaining: lim.presale.remaining });
      }
      if (seats.length > lim.screening.remaining) {
        return fail(409, 'limit_exceeded', { scope: 'screening', limit: lim.screening.limit, bought: lim.screening.bought, remaining: lim.screening.remaining });
      }
      // 5. Orden. Rechazada: se guarda sin butacas activas.
      const approved = outcome === 'approved';
      const now = clock();
      const amount = round2(row.price * seats.length);
      let id;
      for (let i = 0; ; i++) {
        id = newOrderCode();
        try {
          q.insertOrder.run({
            id, screening_id: screeningId, branch_id: row.branch_id, user_id: user.id, customer_name: user.name, email: user.email,
            amount, status: approved ? 'approved' : 'rejected', created_at: limaStamp(now), presale: lim.presale ? 1 : 0, key,
            payment_ref: `SIM-${randomChars(6)}`, now,
          });
          break;
        } catch (e) { if (i >= 5 || !String(e.code).startsWith('SQLITE_CONSTRAINT')) throw e; }
      }
      for (const s of seats) q.insertSeat.run(id, screeningId, s, approved ? 1 : 0, row.price);
      if (approved) syncBooked(screeningId);
      const order = mapOrder(q.byIdem.get(user.id, key));
      return approved ? { status: 201, body: { order } } : { status: 402, body: { error: 'payment_declined', order } };
    }).immediate();
  }

  // Cancelacion de una funcion: reembolso SIMULADO de todas sus ordenes aprobadas y liberacion de butacas. Debe
  // llamarse dentro de la transaccion que cancela la funcion.
  function refundScreening(screeningId, by) {
    const now = clock();
    let refundedOrders = 0; let refundedAmount = 0;
    for (const o of q.approvedOfScreening.all(screeningId)) {
      q.refund.run({ id: o.id, now, reason: 'screening_cancelled', by, ref: randomChars(6) });
      q.releaseSeats.run(o.id);
      refundedOrders++; refundedAmount += o.amount;
    }
    for (const o of q.pendingOfScreening.all(screeningId)) { q.cancelOrder.run(o.id); q.releaseSeats.run(o.id); }
    syncBooked(screeningId);
    return { refundedOrders, refundedAmount: round2(refundedAmount) };
  }

  return { seatMap, purchase, refundScreening, syncBooked, mapOrder, limitsFor };
}
