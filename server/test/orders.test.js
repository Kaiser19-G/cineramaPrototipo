import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startEnv, regBody, DEMO_PASSWORD } from './helpers.js';
import { layoutFor, isValidSeat, allSeatIds, MAX_SEATS_PER_SCREENING } from '../../src/shared/seatLayout.js';
import { ORDER_CODE_RE } from '../orders/service.js';
import { MAX_TICKETS_PER_SCREENING } from '../../src/shared/purchase.js';
import { PRESALE_MAX_TICKETS } from '../../src/shared/presale.js';

let env; let admin; let manager; let cashier; let movie; let presaleMovie; let upcomingPresale; let plainUpcoming;
let n = 0;
const D = '2026-12-10';
const NEWM = { title: 'Peli de compras', genre: 'Drama', duration: 100, rating: '+14', format: ['2D', '3D'], language: 'ES', status: 'active' };
const login = async (email) => { const c = env.client(); assert.equal((await c.post('/api/auth/login', { email, password: DEMO_PASSWORD })).status, 200); return c; };
const customer = async () => {
  const i = ++n; const c = env.client();
  const reg = await c.post('/api/auth/register', regBody({ dni: `7100${String(i).padStart(4, '0')}`, email: `buyer${i}@example.com`, phone: `97100${String(i).padStart(4, '0')}` }));
  assert.equal(reg.status, 201);
  assert.equal((await c.post('/api/auth/verify-phone', { code: reg.json.simulation.code })).status, 200);
  return c;
};
let slot = 0;
// Una funcion nueva en la sala 3 (150 butacas, 2D) o la indicada, a una hora distinta cada vez.
const make = async (m = movie, over = {}) => {
  const hour = 8 + 2 * (slot % 6); const day = 10 + Math.floor(slot / 6); slot++;
  const r = await admin.post('/api/admin/screenings', { movieId: m.id, hallId: 3, date: `2026-12-${String(day).padStart(2, '0')}`, startTime: `${String(hour).padStart(2, '0')}:00`, language: 'ES', format: '2D', price: 20, ...over });
  assert.equal(r.status, 201, JSON.stringify(r.json)); return r.json.screening;
};
const buy = (c, s, seats, over = {}) => c.post('/api/orders', { screeningId: s.id, seats, idempotencyKey: crypto.randomUUID(), payment: { method: 'card', simulatedOutcome: 'approved' }, ...over });
const active = (id) => env.db.prepare('SELECT COUNT(*) c FROM order_seats WHERE screening_id = ? AND active = 1').get(id).c;
const booked = (id) => env.db.prepare('SELECT booked_seats b FROM screenings WHERE id = ?').get(id).b;

before(async () => {
  env = await startEnv();
  admin = await login('admin@cinerama.com'); manager = await login('sarah.mitchell@cinerama.com'); cashier = await login('michael.chen@cinerama.com');
  const mk = async (over) => (await admin.post('/api/admin/movies', { ...NEWM, branches: [{ branchId: 1 }], ...over })).json.movie;
  movie = await mk({});
  presaleMovie = await mk({ title: 'Con preventa', presale: true, releaseDate: '2026-11-20' });
  upcomingPresale = await mk({ title: 'Proxima con preventa', status: 'upcoming', presale: true, releaseDate: '2026-11-25' });
  plainUpcoming = await mk({ title: 'Proxima sin preventa', status: 'upcoming', releaseDate: '2026-11-25' });
});
after(() => env.stop());

describe('distribucion de butacas', () => {
  test('toda capacidad real genera una distribucion coherente', () => {
    const caps = [...env.db.prepare('SELECT DISTINCT capacity c FROM halls').all().map((r) => r.c), 1, 10, 100, 101, 160, 161, 220, 221, 280, 310, MAX_SEATS_PER_SCREENING];
    for (const cap of caps) {
      const l = layoutFor(cap);
      assert.ok(l, `capacidad ${cap}`);
      assert.equal(l.rows.reduce((a, r) => a + r.seats, 0), cap);
      assert.ok(l.rows.every((r, i) => r.seats <= l.cols && (i === l.rows.length - 1 || r.seats === l.cols)));
      const ids = allSeatIds(cap);
      assert.equal(new Set(ids).size, cap);
      assert.ok(ids.every((id) => isValidSeat(cap, id)));
    }
    assert.deepEqual([80, 150, 280, 310].map((c) => layoutFor(c).cols), [10, 14, 20, 20]);
    assert.equal(layoutFor(150).rows.at(-1).seats, 10);
  });
  test('ids invalidos y capacidades fuera de rango', () => {
    for (const id of ['A0', 'a1', 'A01', 'AA1', 'A', '', 'A100', 5, null, undefined, 'F11x']) assert.equal(isValidSeat(150, id), false, String(id));
    assert.equal(isValidSeat(150, 'K10'), true); assert.equal(isValidSeat(150, 'K11'), false); assert.equal(isValidSeat(150, 'L1'), false);
    for (const c of [0, -1, 1.5, MAX_SEATS_PER_SCREENING + 1, '10', null]) assert.equal(layoutFor(c), null);
  });
});

describe('mapa de butacas (GET)', () => {
  test('publico, sin cache; 404 para borrador, cancelada e inexistente', async () => {
    const s = await make();
    const c = env.client();
    const r = await c.get(`/api/screenings/${s.id}/seats`);
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.json.screening.totalSeats, 150); assert.equal(r.json.layout.cols, 14); assert.deepEqual(r.json.taken, []);
    assert.equal(r.json.screening.onSale, true); assert.equal(r.json.viewer, null);
    assert.equal(r.json.screening.movie.title, NEWM.title); assert.ok(!('email' in r.json));
    const draft = await make(movie, { status: 'draft' });
    assert.equal((await c.get(`/api/screenings/${draft.id}/seats`)).status, 404);
    assert.equal((await c.get('/api/screenings/999999/seats')).status, 404);
    assert.equal((await c.get('/api/screenings/abc/seats')).status, 404);
    const cx = await make();
    assert.equal((await admin.post(`/api/admin/screenings/${cx.id}/cancel`, { version: cx.version, confirm: true, reason: 'x' })).status, 200);
    assert.equal((await c.get(`/api/screenings/${cx.id}/seats`)).status, 404);
  });
  test('con sesion de cliente informa su cupo; el personal no puede comprar', async () => {
    const s = await make(); const u = await customer();
    assert.equal((await buy(u, s, ['A1', 'A2'])).status, 201);
    const r = (await u.get(`/api/screenings/${s.id}/seats`)).json;
    assert.deepEqual(r.taken, ['A1', 'A2']); assert.equal(r.limits.screening.bought, 2); assert.equal(r.limits.remaining, MAX_TICKETS_PER_SCREENING - 2);
    assert.equal(r.limits.presale, null); assert.equal(r.viewer.canBuy, true);
    assert.equal((await admin.get(`/api/screenings/${s.id}/seats`)).json.viewer.canBuy, false);
  });
});

describe('comprar', () => {
  test('compra feliz: orden aprobada, butacas activas, contador y codigo', async () => {
    const s = await make(); const u = await customer();
    const r = await buy(u, s, ['B3', 'B2']);
    assert.equal(r.status, 201);
    const o = r.json.order;
    assert.match(o.code, ORDER_CODE_RE); assert.equal(o.status, 'approved'); assert.equal(o.amount, 40);
    assert.deepEqual(o.seats.map((x) => x.seat), ['B2', 'B3']); assert.equal(o.payment.simulated, true); assert.match(o.payment.ref, /^SIM-/);
    assert.equal(o.screening.movieTitle, NEWM.title); assert.equal(o.refund, null);
    assert.equal(active(s.id), 2); assert.equal(booked(s.id), 2);
    const row = env.db.prepare('SELECT * FROM orders WHERE id = ?').get(o.code);
    assert.equal(row.channel, 'web'); assert.equal(row.method, 'card'); assert.equal(row.branch_id, s.branchId);
    assert.ok(!JSON.stringify({ ...row, created_ms: 0 }).match(/\d{13,}/), 'sin numeros de tarjeta');
    assert.ok(!('userId' in o) && !('email' in o));
  });
  test('el precio, la sede y el usuario salen del servidor: el cliente no los manda', async () => {
    const s = await make(); const u = await customer();
    const r = await buy(u, s, ['C1'], { amount: 1, price: 1, branchId: 99, userId: 1, cardNumber: '4242424242424242' });
    assert.equal(r.status, 201); assert.equal(r.json.order.amount, 20);
    const row = env.db.prepare('SELECT * FROM orders WHERE id = ?').get(r.json.order.code);
    assert.equal(row.branch_id, s.branchId); assert.notEqual(row.user_id, 1);
    assert.ok(!JSON.stringify(row).includes('4242'));
  });
  test('validacion del cuerpo', async () => {
    const s = await make(); const u = await customer();
    const cases = [
      [{ seats: [] }, 'seats', 'required'], [{ seats: ['A1', 'A1'] }, 'seats', 'duplicated'], [{ seats: [1] }, 'seats', 'invalid'],
      [{ seats: Array.from({ length: 9 }, (_, i) => `A${i + 1}`) }, 'seats', 'too_many'], [{ idempotencyKey: 'corta' }, 'idempotencyKey', 'invalid'],
      [{ payment: { method: 'paypal' } }, 'payment', 'invalid_method'], [{ payment: { method: 'card', simulatedOutcome: 'maybe' } }, 'payment', 'invalid_outcome'],
      [{ screeningId: 'x' }, 'screeningId', 'invalid'],
    ];
    for (const [over, field, code] of cases) {
      const r = await buy(u, s, ['A1'], over); assert.equal(r.status, 400, JSON.stringify(over)); assert.equal(r.json.errors[field], code);
    }
    const u2 = await customer();
    for (const bad of ['Z1', 'A15', 'K11', 'a1', 'A0']) assert.equal((await buy(u2, s, [bad])).status, 400, bad);
    assert.equal((await u2.post('/api/orders', undefined)).status, 400);
    assert.equal((await u2.post('/api/orders', { x: 1 })).status, 400);
    assert.equal((await buy(u2, { id: 999999 }, ['A1'])).status, 404);
    assert.equal(active(s.id), 0);
  });
  test('sin sesion 401, personal 403, formato no JSON 415', async () => {
    const s = await make();
    assert.equal((await buy(env.client(), s, ['A1'])).status, 401);
    for (const c of [admin, manager, cashier]) { const r = await buy(c, s, ['A1']); assert.equal(r.status, 403); assert.equal(r.json.error, 'customer_only'); }
    const u = await customer();
    assert.equal((await u.post('/api/orders', undefined, { rawBody: 'a=b', headers: { 'content-type': 'application/x-www-form-urlencoded' } })).status, 415);
    assert.equal(active(s.id), 0);
  });
  test('dos clientes por la misma butaca en paralelo: uno entra y el otro recibe seats_taken', async () => {
    const s = await make(); const [a, b] = [await customer(), await customer()];
    const [r1, r2] = await Promise.all([buy(a, s, ['D5', 'D6']), buy(b, s, ['D6', 'D7'])]);
    assert.deepEqual([r1.status, r2.status].sort(), [201, 409]);
    const lose = r1.status === 409 ? r1 : r2;
    assert.equal(lose.json.error, 'seats_taken'); assert.deepEqual(lose.json.seats, ['D6']);
    assert.equal(active(s.id), 2); assert.equal(booked(s.id), 2);
    assert.equal(env.db.prepare('SELECT COUNT(*) c FROM orders WHERE screening_id = ?').get(s.id).c, 1, 'la perdedora no deja orden');
    assert.equal((await buy(lose === r1 ? a : b, s, ['D7'])).status, 201, 'el resto de su seleccion sigue libre');
  });
  test('la misma cuenta con dos compras paralelas que juntas superan el tope: solo entra una', async () => {
    const s = await make(); const u = await customer();
    const [r1, r2] = await Promise.all([buy(u, s, ['E1', 'E2', 'E3', 'E4', 'E5']), buy(u, s, ['F1', 'F2', 'F3', 'F4', 'F5'])]);
    assert.deepEqual([r1.status, r2.status].sort(), [201, 409]);
    const bad = r1.status === 409 ? r1 : r2;
    assert.equal(bad.json.error, 'limit_exceeded'); assert.equal(bad.json.scope, 'screening'); assert.equal(bad.json.remaining, 3); assert.equal(bad.json.bought, 5);
    assert.equal(active(s.id), 5);
  });
  test('tope normal: 8 por funcion acumulado entre ordenes', async () => {
    const s = await make(); const u = await customer();
    assert.equal((await buy(u, s, ['A1', 'A2', 'A3', 'A4', 'A5'])).status, 201);
    const r = await buy(u, s, ['B1', 'B2', 'B3', 'B4']);
    assert.equal(r.status, 409); assert.deepEqual([r.json.error, r.json.scope, r.json.limit, r.json.remaining], ['limit_exceeded', 'screening', 8, 3]);
    assert.equal((await buy(u, s, ['B1', 'B2', 'B3'])).status, 201);
    assert.equal((await buy(u, s, ['B4'])).json.remaining, 0);
    const other = await make(); assert.equal((await buy(u, other, ['A1'])).status, 201, 'otra funcion, cupo propio');
  });
  test('idempotencia: la misma clave devuelve la misma orden; otro cuerpo con la misma clave es conflicto', async () => {
    const s = await make(); const u = await customer(); const key = crypto.randomUUID();
    const r1 = await buy(u, s, ['G1', 'G2'], { idempotencyKey: key });
    const r2 = await buy(u, s, ['G2', 'G1'], { idempotencyKey: key });
    assert.equal(r1.status, 201); assert.equal(r2.status, 200); assert.equal(r2.json.replayed, true); assert.equal(r2.json.order.code, r1.json.order.code);
    assert.equal(env.db.prepare('SELECT COUNT(*) c FROM orders WHERE screening_id = ?').get(s.id).c, 1); assert.equal(active(s.id), 2);
    const c = await buy(u, s, ['G3'], { idempotencyKey: key });
    assert.equal(c.status, 409); assert.equal(c.json.error, 'idempotency_conflict');
    const other = await customer();
    assert.equal((await buy(other, s, ['H1'], { idempotencyKey: key })).status, 201, 'la clave es por cuenta');
    // doble envio simultaneo
    const k2 = crypto.randomUUID();
    const both = await Promise.all([buy(u, s, ['H5'], { idempotencyKey: k2 }), buy(u, s, ['H5'], { idempotencyKey: k2 })]);
    assert.deepEqual(both.map((x) => x.status).sort(), [200, 201]);
    assert.equal(both[0].json.order.code, both[1].json.order.code);
  });
  test('pago rechazado: orden rechazada sin butacas activas; se puede reintentar', async () => {
    const s = await make(); const u = await customer(); const key = crypto.randomUUID();
    const r = await buy(u, s, ['J1', 'J2'], { idempotencyKey: key, payment: { method: 'card', simulatedOutcome: 'declined' } });
    assert.equal(r.status, 402); assert.equal(r.json.error, 'payment_declined'); assert.equal(r.json.order.status, 'rejected');
    assert.equal(active(s.id), 0); assert.equal(booked(s.id), 0);
    assert.equal(env.db.prepare(`SELECT COUNT(*) c FROM order_seats WHERE order_id = ? AND active = 0`).get(r.json.order.code).c, 2);
    const again = await buy(u, s, ['J1', 'J2'], { idempotencyKey: key, payment: { method: 'card', simulatedOutcome: 'declined' } });
    assert.equal(again.status, 402); assert.equal(again.json.replayed, true);
    assert.equal((await buy(u, s, ['J1', 'J2'], { idempotencyKey: key })).json.error, 'idempotency_conflict');
    const ok = await buy(u, s, ['J1', 'J2']);
    assert.equal(ok.status, 201); assert.equal(active(s.id), 2);
    assert.equal((await u.get(`/api/screenings/${s.id}/seats`)).json.limits.screening.bought, 2, 'la rechazada no cuenta');
  });
  test('un pago rechazado sobre una butaca ocupada responde seats_taken', async () => {
    const s = await make(); const [a, b] = [await customer(), await customer()];
    await buy(a, s, ['K1']);
    assert.equal((await buy(b, s, ['K1'], { payment: { method: 'card', simulatedOutcome: 'declined' } })).json.error, 'seats_taken');
  });
});

describe('estado de la funcion al comprar', () => {
  test('borrador, cancelada: 404; terminada e iniciada: cerrada; agotada: sold_out', async () => {
    const u = await customer();
    const draft = await make(movie, { status: 'draft' });
    assert.equal((await buy(u, draft, ['A1'])).status, 404);
    const cx = await make();
    await admin.post(`/api/admin/screenings/${cx.id}/cancel`, { version: cx.version, confirm: true, reason: 'x' });
    assert.equal((await buy(u, cx, ['A1'])).status, 404);
    // agotada: se llenan las butacas de una funcion de 150 con ordenes reales
    const full = await make();
    env.db.prepare(`INSERT INTO orders (id,screening_id,branch_id,customer_name,email,amount,method,status,created_at,created_ms) VALUES ('CIN-FULLL-22222',?,?,'x','x@x.com',1,'card','approved','2026-11-12 10:00',1)`).run(full.id, full.branchId);
    const ins = env.db.prepare(`INSERT INTO order_seats (order_id,screening_id,seat,active) VALUES ('CIN-FULLL-22222',?,?,1)`);
    for (const id of allSeatIds(150)) ins.run(full.id, id);
    env.db.prepare('UPDATE screenings SET booked_seats = 150 WHERE id = ?').run(full.id);
    const r = await buy(u, full, ['A1']); assert.equal(r.status, 409); assert.equal(r.json.error, 'sold_out');
    assert.equal((await env.client().get(`/api/screenings/${full.id}/seats`)).json.screening.reason, 'sold_out');
    // una butaca libre en una funcion a punto de llenarse se vende y la agota (estado derivado, nunca guardado)
    const one = await make();
    env.db.prepare(`INSERT INTO orders (id,screening_id,branch_id,customer_name,email,amount,method,status,created_at,created_ms) VALUES ('CIN-ONEEE-22222',?,?,'x','x@x.com',1,'card','approved','2026-11-12 10:00',1)`).run(one.id, one.branchId);
    const ins2 = env.db.prepare(`INSERT INTO order_seats (order_id,screening_id,seat,active) VALUES ('CIN-ONEEE-22222',?,?,1)`);
    for (const id of allSeatIds(150).slice(1)) ins2.run(one.id, id);
    assert.equal((await buy(u, one, ['A1'])).status, 201);
    assert.equal(booked(one.id), 150);
    assert.equal(env.db.prepare('SELECT status FROM screenings WHERE id = ?').get(one.id).status, 'scheduled', 'sold_out no se guarda');
    assert.equal((await buy(await customer(), one, ['A2'])).json.error, 'sold_out');
  });
  test('funcion iniciada o terminada: no se vende (hora de Lima)', async () => {
    const u = await customer();
    // reloj: 2026-11-12 15:00 UTC = 10:00 Lima. Funcion hoy a las 11:00 Lima.
    const r = await admin.post('/api/admin/screenings', { movieId: movie.id, hallId: 5, date: '2026-11-12', startTime: '11:00', language: 'ES', format: '3D', price: 20 });
    assert.equal(r.status, 201, JSON.stringify(r.json)); const s = r.json.screening;
    assert.equal((await buy(u, s, ['A1'])).status, 201, 'antes del inicio');
    const t0 = env.clock.now;
    try {
      env.clock.now = Date.UTC(2026, 10, 12, 15, 59, 59);            // 10:59:59 Lima
      assert.equal((await buy(u, s, ['A2'])).status, 201);
      env.clock.now = Date.UTC(2026, 10, 12, 16, 0, 0);              // 11:00 Lima: ya empezo
      const closed = await buy(u, s, ['A3']);
      assert.equal(closed.status, 409); assert.equal(closed.json.error, 'not_on_sale');
      assert.equal((await env.client().get(`/api/screenings/${s.id}/seats`)).json.screening.onSale, false);
      env.clock.now = Date.UTC(2026, 10, 12, 20, 0, 0);              // terminada
      const done = await buy(u, s, ['A4']); assert.equal(done.status, 409); assert.equal(done.json.status, 'finished');
    } finally { env.clock.now = t0; }
    assert.equal(active(s.id), 2);
  });
  test('pelicula no habilitada en la sede: no se vende', async () => {
    const u = await customer(); const s = await make();
    env.db.prepare('UPDATE movie_branch SET active = 0 WHERE movie_id = ? AND branch_id = ?').run(movie.id, s.branchId);
    assert.equal((await buy(u, s, ['A1'])).json.error, 'not_on_sale');
    env.db.prepare('UPDATE movie_branch SET active = 1 WHERE movie_id = ? AND branch_id = ?').run(movie.id, s.branchId);
    assert.equal((await buy(u, s, ['A1'])).status, 201);
  });
});

describe('preventa', () => {
  test('4 por cuenta y pelicula, acumulado entre ordenes y funciones; reembolsada y rechazada no cuentan', async () => {
    const [s1, s2] = [await make(presaleMovie), await make(presaleMovie)];
    const u = await customer();
    const info = (await u.get(`/api/screenings/${s1.id}/seats`)).json;
    assert.equal(info.limits.presale.limit, PRESALE_MAX_TICKETS); assert.equal(info.limits.remaining, 4); assert.equal(info.screening.movie.presale, true);
    assert.equal((await buy(u, s1, ['A1', 'A2'])).status, 201);
    const o2 = await buy(u, s2, ['A1']); assert.equal(o2.status, 201);
    const over = await buy(u, s2, ['B1', 'B2']);
    assert.equal(over.status, 409); assert.deepEqual([over.json.error, over.json.scope, over.json.limit, over.json.bought, over.json.remaining], ['limit_exceeded', 'presale_movie', 4, 3, 1]);
    // una orden rechazada no cuenta
    assert.equal((await buy(u, s2, ['C1'], { payment: { method: 'card', simulatedOutcome: 'declined' } })).status, 402);
    assert.equal((await u.get(`/api/screenings/${s1.id}/seats`)).json.limits.presale.remaining, 1);
    // una reembolsada libera cupo
    env.db.prepare(`UPDATE orders SET status = 'refunded' WHERE id = ?`).run(o2.json.order.code);
    env.db.prepare(`UPDATE order_seats SET active = 0 WHERE order_id = ?`).run(o2.json.order.code);
    assert.equal((await u.get(`/api/screenings/${s1.id}/seats`)).json.limits.presale.remaining, 2);
    assert.equal((await buy(u, s2, ['B1', 'B2'])).status, 201);
    assert.equal((await buy(u, s2, ['B3'])).json.scope, 'presale_movie');
    // otra cuenta y otra pelicula no se afectan
    assert.equal((await buy(await customer(), s1, ['D1', 'D2', 'D3', 'D4'])).status, 201);
    assert.equal((await buy(u, await make(), ['A1'])).status, 201);
  });
  test('pelicula upcoming con preventa se puede comprar; sin preventa no tiene funciones', async () => {
    const s = await make(upcomingPresale);
    const u = await customer();
    assert.equal((await buy(u, s, ['A1'])).status, 201);
    const r1 = await buy(await customer(), s, ['A2']);
    assert.equal(env.db.prepare('SELECT presale FROM orders WHERE id = ?').get(r1.json.order.code).presale, 1);
    const r = await admin.post('/api/admin/screenings', { movieId: plainUpcoming.id, hallId: 3, date: D, startTime: '22:00', language: 'ES', format: '2D' });
    assert.equal(r.json.error, 'movie_inactive');
  });
  test('el dia del estreno termina la preventa y deja de aplicar su tope', async () => {
    const m = (await admin.post('/api/admin/movies', { ...NEWM, title: 'Preventa corta', presale: true, releaseDate: '2026-11-13', branches: [{ branchId: 1 }] })).json.movie;
    const s = await make(m); const u = await customer();
    assert.equal((await buy(u, s, ['A1', 'A2', 'A3', 'A4'])).status, 201);
    assert.equal((await buy(u, s, ['B1'])).json.scope, 'presale_movie');
    const t0 = env.clock.now;
    try {
      env.clock.now = Date.UTC(2026, 10, 13, 2, 0, 0); await u.get('/api/auth/me');   // 21:00 Lima del 12: sigue la preventa
      assert.equal((await buy(u, s, ['B1'])).json.scope, 'presale_movie');
      env.clock.now = Date.UTC(2026, 10, 13, 13, 0, 0);                              // 08:00 Lima del 13: ya es el estreno
      const r = await buy(u, s, ['B1']); assert.equal(r.status, 201);
      assert.equal(env.db.prepare('SELECT presale FROM orders WHERE id = ?').get(r.json.order.code).presale, 0);
    } finally { env.clock.now = t0; }
  });
});

describe('invariante, cancelacion y reembolso', () => {
  test('booked_seats == butacas activas tras compras, rechazos y cancelacion; las butacas se pueden recomprar', async () => {
    const s = await make(); const [a, b] = [await customer(), await customer()];
    await buy(a, s, ['A1', 'A2', 'A3']); await buy(b, s, ['B1']); await buy(b, s, ['B2'], { payment: { method: 'card', simulatedOutcome: 'declined' } });
    await buy(a, s, ['A1']);   // choque
    assert.equal(booked(s.id), 4); assert.equal(active(s.id), 4);
    const cur = (await admin.get(`/api/admin/screenings/${s.id}`)).json.screening;
    const r = await manager.post(`/api/admin/screenings/${s.id}/cancel`, { version: cur.version, confirm: true, reason: 'Falla tecnica' });
    assert.equal(r.status, 200); assert.equal(r.json.refundedOrders, 2); assert.equal(r.json.refundedAmount, 80); assert.equal(r.json.refundsPending, false);
    assert.equal(active(s.id), 0); assert.equal(booked(s.id), 0);
    const st = env.db.prepare('SELECT status, COUNT(*) c FROM orders WHERE screening_id = ? GROUP BY status').all(s.id);
    assert.deepEqual(Object.fromEntries(st.map((x) => [x.status, x.c])), { refunded: 2, rejected: 1 });
    // esas butacas vuelven a estar libres para vender en otra funcion y el cupo de la cuenta se libera
    assert.equal((await buy(a, s, ['A1'])).status, 404, 'la funcion cancelada no se vende');
    const s2 = await make();
    assert.equal((await buy(a, s2, ['A1', 'A2', 'A3'])).status, 201);
    for (const f of env.db.prepare('SELECT id, booked_seats FROM screenings').all()) assert.equal(f.booked_seats, active(f.id), `funcion ${f.id}`);
  });
  test('la cancelacion de una funcion libera el cupo de preventa de las cuentas', async () => {
    const s = await make(presaleMovie); const u = await customer();
    await buy(u, s, ['A1', 'A2', 'A3', 'A4']);
    const cur = (await admin.get(`/api/admin/screenings/${s.id}`)).json.screening;
    assert.equal((await admin.post(`/api/admin/screenings/${s.id}/cancel`, { version: cur.version, confirm: true, reason: 'x' })).status, 200);
    const s2 = await make(presaleMovie);
    assert.equal((await u.get(`/api/screenings/${s2.id}/seats`)).json.limits.presale.remaining, 4);
    const refunded = env.db.prepare(`SELECT * FROM orders WHERE screening_id = ?`).get(s.id);
    assert.equal(refunded.status, 'refunded'); assert.equal(refunded.refund_reason, 'screening_cancelled'); assert.ok(refunded.refunded_at);
  });
  test('ni el audit_log ni la consola contienen codigos de orden ni datos de tarjeta', async () => {
    const s = await make(); const u = await customer();
    const code = (await buy(u, s, ['A1'], { cardNumber: '4111111111111111', cvv: '123' })).json.order.code;
    const cur = (await admin.get(`/api/admin/screenings/${s.id}`)).json.screening;
    await admin.post(`/api/admin/screenings/${s.id}/cancel`, { version: cur.version, confirm: true, reason: 'x' });
    const audit = JSON.stringify(env.db.prepare('SELECT * FROM audit_log').all());
    assert.ok(!audit.includes(code) && !audit.includes('CIN-') && !audit.includes('4111'));
    assert.ok(!env.logs.join('\n').includes(code) && !env.logs.join('\n').includes('4111'));
  });
});

describe('limite de intentos', () => {
  test('15 intentos por cuenta en 15 minutos y luego 429', async () => {
    const u = await customer(); const s = await make();
    for (let i = 0; i < 15; i++) assert.equal((await buy(u, s, [])).status, 400);
    const r = await buy(u, s, ['A1']);
    assert.equal(r.status, 429); assert.equal(r.json.error, 'too_many_attempts'); assert.ok(r.json.retryAfter > 0);
    assert.equal(active(s.id), 0);
    assert.equal((await buy(await customer(), s, ['A1'])).status, 201, 'otra cuenta no se ve afectada');
  });
});
