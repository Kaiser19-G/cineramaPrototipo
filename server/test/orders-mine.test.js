import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startEnv, regBody, DEMO_PASSWORD } from './helpers.js';

let env; let admin; let cashier; let movie; let presaleMovie;
let n = 100; let slot = 0;
const T0 = Date.UTC(2026, 10, 12, 15, 0, 0); // 10:00 en Lima
const login = async (email) => { const c = env.client(); assert.equal((await c.post('/api/auth/login', { email, password: DEMO_PASSWORD })).status, 200); return c; };
const customer = async () => {
  const i = ++n; const c = env.client();
  const reg = await c.post('/api/auth/register', regBody({ dni: `7300${String(i).padStart(4, '0')}`, email: `mine${i}@example.com`, phone: `97300${String(i).padStart(4, '0')}` }));
  assert.equal(reg.status, 201);
  assert.equal((await c.post('/api/auth/verify-phone', { code: reg.json.simulation.code })).status, 200);
  return c;
};
const make = async (m = movie, over = {}) => {
  const hour = 8 + 2 * (slot % 6); const day = 14 + Math.floor(slot / 6); slot++;
  const r = await admin.post('/api/admin/screenings', { movieId: m.id, hallId: 3, date: `2026-12-${String(day).padStart(2, '0')}`, startTime: `${String(hour).padStart(2, '0')}:00`, language: 'ES', format: '2D', price: 20, ...over });
  assert.equal(r.status, 201, JSON.stringify(r.json)); return r.json.screening;
};
const buy = (c, s, seats, over = {}) => c.post('/api/orders', { screeningId: s.id, seats, idempotencyKey: crypto.randomUUID(), payment: { method: 'card', simulatedOutcome: 'approved' }, ...over });

before(async () => {
  env = await startEnv();
  admin = await login('admin@cinerama.com'); cashier = await login('michael.chen@cinerama.com');
  const mk = async (over) => (await admin.post('/api/admin/movies', { title: 'Peli mis entradas', genre: 'Drama', duration: 100, rating: '+14', format: ['2D'], language: 'ES', status: 'active', branches: [{ branchId: 1 }], ...over })).json.movie;
  movie = await mk({});
  presaleMovie = await mk({ title: 'Preventa mis entradas', presale: true, releaseDate: '2026-11-20' });
});
after(() => env.stop());

describe('GET /api/orders y /api/orders/:code', () => {
  test('401 sin sesion y 403 para el personal', async () => {
    const anon = env.client();
    for (const u of ['/api/orders', '/api/orders/CIN-AAAAA-BBBBB', '/api/presale-quota/1']) assert.equal((await anon.get(u)).status, 401, u);
    for (const u of ['/api/orders', '/api/orders/CIN-AAAAA-BBBBB', '/api/presale-quota/1']) {
      const r = await cashier.get(u); assert.equal(r.status, 403, u); assert.equal(r.json.error, 'customer_only');
    }
  });

  test('lista solo las ordenes propias, mas recientes primero, sin datos ajenos ni internos', async () => {
    const a = await customer(); const b = await customer(); const s = await make();
    const o1 = (await buy(a, s, ['A1'])).json.order.code;
    env.clock.now += 60000;
    const o2 = (await buy(a, s, ['A2', 'A3'])).json.order.code;
    const ob = (await buy(b, s, ['B1'])).json.order.code;
    const r = await a.get('/api/orders');
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(r.json.orders.map((o) => o.code), [o2, o1]);
    assert.ok(!JSON.stringify(r.json).includes(ob));
    const o = r.json.orders[0];
    assert.equal(o.displayStatus, 'valid'); assert.deepEqual(o.seats.map((x) => x.seat), ['A2', 'A3']); assert.equal(o.screening.movieTitle, 'Peli mis entradas');
    const raw = JSON.stringify(r.json) + JSON.stringify((await a.get(`/api/orders/${o1}`)).json);
    assert.ok(!/user_id|userId|email|@example|customer_name|password|hash|idempotency/i.test(raw), raw);
    assert.deepEqual((await b.get('/api/orders')).json.orders.map((x) => x.code), [ob]);
    env.clock.now = T0;
  });

  test('orden ajena e inexistente: 404 con el mismo cuerpo', async () => {
    const a = await customer(); const b = await customer(); const s = await make();
    const code = (await buy(a, s, ['C1'])).json.order.code;
    assert.equal((await a.get(`/api/orders/${code}`)).status, 200);
    const foreign = await b.get(`/api/orders/${code}`);
    const none = await b.get('/api/orders/CIN-22222-33333');
    const junk = await b.get('/api/orders/no-es-un-codigo');
    assert.equal(foreign.status, 404); assert.equal(none.status, 404); assert.equal(junk.status, 404);
    assert.deepEqual(foreign.json, none.json); assert.deepEqual(none.json, junk.json);
  });

  test('limite de intentos: 10 fallos bloquean (429), tambien los aciertos; otra cuenta no se afecta', async () => {
    const a = await customer(); const other = await customer(); const s = await make();
    const mine = (await buy(a, s, ['D1'])).json.order.code;
    for (let i = 0; i < 9; i++) assert.equal((await a.get('/api/orders/CIN-22222-33333')).status, 404);
    assert.equal((await a.get(`/api/orders/${mine}`)).status, 200, 'los aciertos no cuentan');
    assert.equal((await a.get('/api/orders/CIN-22222-33333')).status, 404); // el 10.o fallo bloquea
    const locked = await a.get('/api/orders/CIN-22222-33333');
    assert.equal(locked.status, 429); assert.ok(locked.json.retryAfter > 0);
    assert.equal((await a.get(`/api/orders/${mine}`)).status, 429, 'bloqueado: ni los aciertos se distinguen');
    assert.equal((await a.get('/api/orders')).status, 200, 'la lista no se bloquea');
    assert.equal((await other.get('/api/orders/CIN-22222-33333')).status, 404);
  });

  test('scope upcoming/past con reloj controlado en el cruce de medianoche de Lima', async () => {
    const u = await customer();
    // Funcion de 23:00 a 00:40 (cruza la medianoche de Lima).
    const night = await make(movie, { date: '2026-11-12', startTime: '23:00' });
    const later = await make(movie, { date: '2026-11-14', startTime: '10:00' });
    const nightCode = (await buy(u, night, ['E1'])).json.order.code;
    const laterCode = (await buy(u, later, ['E2'])).json.order.code;
    const codes = async (q) => (await u.get(`/api/orders?scope=${q}`)).json.orders.map((o) => o.code);
    const at = (iso) => { env.clock.now = Date.parse(iso); };
    at('2026-11-13T00:00:00Z'); // 19:00: se toca la sesion (caduca a las 12 h sin uso)
    assert.equal((await u.get('/api/orders')).status, 200);
    assert.equal((await admin.get('/api/admin/screenings')).status, 200);
    at('2026-11-13T04:59:00Z'); // 23:59 del 12 en Lima: en curso
    assert.deepEqual((await codes('upcoming')).sort(), [nightCode, laterCode].sort());
    assert.deepEqual(await codes('past'), []);
    at('2026-11-13T05:10:00Z'); // 00:10 del 13: sigue en curso (cruzo la medianoche)
    assert.equal((await codes('upcoming')).length, 2);
    assert.equal((await u.get(`/api/orders/${nightCode}`)).json.order.displayStatus, 'valid');
    at('2026-11-13T05:40:00Z'); // 00:40 exacto: terminada
    assert.deepEqual(await codes('upcoming'), [laterCode]);
    assert.deepEqual(await codes('past'), [nightCode]);
    const list = (await u.get('/api/orders')).json;
    assert.deepEqual(list.counts, { upcoming: 1, past: 1 });
    assert.equal((await u.get(`/api/orders/${nightCode}`)).json.order.displayStatus, 'past');
    assert.equal((await u.get('/api/orders?scope=otro')).status, 400);
    env.clock.now = T0;
    admin = await login('admin@cinerama.com'); // la sesion del admin caduco al avanzar el reloj
  });

  test('usada, reembolsada con su motivo y rechazadas excluidas de la lista', async () => {
    const u = await customer(); const s = await make(); const s2 = await make();
    const used = (await buy(u, s, ['F1', 'F2'])).json.order.code;
    const refunded = (await buy(u, s2, ['F3'])).json.order.code;
    const rej = await buy(u, s, ['F9'], { payment: { method: 'card', simulatedOutcome: 'declined' } });
    assert.equal(rej.status, 402);
    env.db.prepare('UPDATE order_seats SET checked_in_at = ? WHERE order_id = ?').run(Date.now(), used);
    const cur = (await admin.get(`/api/admin/screenings/${s2.id}`)).json.screening;
    assert.equal((await admin.post(`/api/admin/screenings/${s2.id}/cancel`, { version: cur.version, confirm: true, reason: 'motivo interno privado' })).status, 200);
    const r = await u.get('/api/orders');
    const by = Object.fromEntries(r.json.orders.map((o) => [o.code, o]));
    assert.equal(by[used].displayStatus, 'used'); assert.equal(by[used].seats[0].checkedIn, true);
    assert.equal(by[refunded].displayStatus, 'refunded');
    assert.equal(by[refunded].refund.reasonCode, 'screening_cancelled');
    assert.equal(by[refunded].refund.reason, 'Función cancelada por el cine');
    assert.ok(!JSON.stringify(r.json).includes('motivo interno privado'));
    assert.ok(!by[rej.json.order.code], 'rechazadas fuera de la lista');
    assert.equal(r.json.orders.length, 2);
    const detail = await u.get(`/api/orders/${rej.json.order.code}`);
    assert.equal(detail.status, 200); assert.equal(detail.json.order.displayStatus, 'rejected'); assert.deepEqual(detail.json.order.seats.map((x) => x.seat), ['F9']);
    assert.deepEqual((await u.get('/api/orders?scope=upcoming')).json.orders, []);
    assert.equal((await u.get('/api/orders?scope=past')).json.orders.length, 2);
  });

  test('paginado', async () => {
    const u = await customer(); const s = await make();
    const codes = [];
    for (let i = 1; i <= 5; i++) { env.clock.now += 1000; codes.unshift((await buy(u, s, [`G${i}`])).json.order.code); }
    const p1 = (await u.get('/api/orders?pageSize=2&page=1')).json;
    const p3 = (await u.get('/api/orders?pageSize=2&page=3')).json;
    const p9 = (await u.get('/api/orders?pageSize=2&page=9')).json;
    assert.deepEqual(p1.orders.map((o) => o.code), codes.slice(0, 2));
    assert.equal(p1.total, 5); assert.equal(p1.totalPages, 3);
    assert.deepEqual(p3.orders.map((o) => o.code), codes.slice(4));
    assert.equal(p9.page, 3);
    assert.equal((await u.get('/api/orders?pageSize=9999')).json.pageSize, 50);
    assert.equal((await u.get('/api/orders?pageSize=abc&page=-4')).json.pageSize, 10);
    env.clock.now = T0;
  });

  test('cupo de preventa por pelicula', async () => {
    const u = await customer(); const s = await make(presaleMovie);
    assert.deepEqual((await u.get(`/api/presale-quota/${presaleMovie.id}`)).json, { presale: { limit: 4, bought: 0, remaining: 4 } });
    await buy(u, s, ['H1', 'H2', 'H3']);
    const r = await u.get(`/api/presale-quota/${presaleMovie.id}`);
    assert.equal(r.headers.get('cache-control'), 'no-store'); assert.deepEqual(r.json.presale, { limit: 4, bought: 3, remaining: 1 });
    assert.deepEqual((await u.get(`/api/presale-quota/${movie.id}`)).json, { presale: null });
    assert.equal((await u.get('/api/presale-quota/99999')).status, 404);
  });

  test('la consola no registra codigos de orden', () => {
    assert.ok(!env.logs.join('\n').includes('CIN-'));
  });
});
