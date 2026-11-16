import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startEnv, regBody, DEMO_PASSWORD } from './helpers.js';
import { hashPassword } from '../auth/crypto.js';
import { allSeatIds } from '../../src/shared/seatLayout.js';
import { MAX_TICKETS_PER_COUNTER_ORDER, COUNTER_SALE_GRACE_MINUTES, CHECKIN_OPENS_MINUTES_BEFORE } from '../../src/shared/purchase.js';

// Taquilla (fase 4d): venta en mostrador, validacion en puerta y reembolso individual.
const ADMIN_PW = 'clave-admin-test-1';
const C = '/api/admin/counter';
const T0 = Date.UTC(2026, 10, 12, 15, 0, 0);                  // 10:00 del 12/11 en Lima
const limaAt = (h, m = 0, day = 12) => Date.UTC(2026, 10, day, h + 5, m, 0);
const consoleLines = []; const origConsole = {};
let env; let admin; let michael; let lisa; let anna; let sarah; let emily; let james; let c1; let c2; let n = 800;
let movie; let presaleMovie; let S = {};

const login = async (email, password = DEMO_PASSWORD) => { const c = env.client(); const r = await c.post('/api/auth/login', { email, password }); assert.equal(r.status, 200); return c; };
const customer = async () => {
  const i = ++n; const c = env.client();
  const reg = await c.post('/api/auth/register', regBody({ name: `Cliente Taquilla ${i}`, dni: `7500${String(i).padStart(4, '0')}`, email: `taq${i}@example.com`, phone: `97500${String(i).padStart(4, '0')}` }));
  assert.equal(reg.status, 201);
  assert.equal((await c.post('/api/auth/verify-phone', { code: reg.json.simulation.code })).status, 200);
  return c;
};
const setClock = async (ms) => {
  env.clock.now = ms;
  admin = await login('admin@cinerama.com', ADMIN_PW); michael = await login('michael.chen@cinerama.com'); lisa = await login('lisa.brown@cinerama.com');
  anna = await login('anna.martinez@cinerama.com'); sarah = await login('sarah.mitchell@cinerama.com'); emily = await login('emily.rodriguez@cinerama.com');
  james = await login('james.wilson@cinerama.com'); c1 = await login('taq801@example.com', regBody().password); c2 = await login('taq802@example.com', regBody().password);
};
const mk = async (m, hallId, date, startTime, price = 20) => {
  const r = await admin.post('/api/admin/screenings', { movieId: m.id, hallId, date, startTime, language: 'ES', format: '2D', price });
  assert.equal(r.status, 201, JSON.stringify(r.json)); return r.json.screening;
};
// La compra web limita 15 intentos por cuenta cada 15 minutos; estas pruebas compran mas, asi que se reinicia ese contador.
const web = async (c, s, seats, outcome = 'approved') => {
  env.db.prepare(`DELETE FROM auth_throttle WHERE key LIKE 'buy:user:%'`).run();
  return c.post('/api/orders', { screeningId: s.id, seats, idempotencyKey: crypto.randomUUID(), payment: { method: 'card', simulatedOutcome: outcome } });
};
const sale = (c, s, seats, over = {}) => c.post(`${C}/orders`, { screeningId: s.id, seats, idempotencyKey: crypto.randomUUID(), payment: { method: 'cash' }, ...over });
const look = (c, code) => c.post(`${C}/tickets/lookup`, { code });
const enter = (c, code, seats) => c.post(`${C}/tickets/checkin`, seats ? { code, seats } : { code });
const refund = (c, code, reason = 'customer_request') => c.post(`/api/admin/orders/${code}/refund`, { reason });
const active = (id) => env.db.prepare('SELECT COUNT(*) c FROM order_seats WHERE screening_id = ? AND active = 1').get(id).c;
const booked = (id) => env.db.prepare('SELECT booked_seats b FROM screenings WHERE id = ?').get(id).b;
const invariant = () => {
  const bad = env.db.prepare(`SELECT s.id FROM screenings s WHERE s.booked_seats != (SELECT COUNT(*) FROM order_seats os WHERE os.screening_id = s.id AND os.active = 1)`).all();
  assert.deepEqual(bad, [], 'booked_seats debe igualar las butacas activas');
};

before(async () => {
  for (const m of ['log', 'warn', 'error', 'info']) { origConsole[m] = console[m]; console[m] = (...a) => consoleLines.push(a.map(String).join(' ')); }
  env = await startEnv();
  env.db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(await hashPassword(ADMIN_PW));
  admin = await login('admin@cinerama.com', ADMIN_PW);
  const mkMovie = async (over) => (await admin.post('/api/admin/movies', { title: 'Pelicula Taquilla', genre: 'Drama', duration: 100, rating: '+14', format: ['2D'], language: 'ES', status: 'active', branches: [{ branchId: 1 }, { branchId: 2 }, { branchId: 3 }], ...over })).json.movie;
  movie = await mkMovie({});
  presaleMovie = await mkMovie({ title: 'Preventa Taquilla', presale: true, releaseDate: '2026-11-12' });
  c1 = await customer(); c2 = await customer();
  S = {
    sell: await mk(movie, 3, '2026-11-12', '12:00'), valid: await mk(movie, 2, '2026-11-12', '12:00'), refund: await mk(movie, 1, '2026-11-12', '12:00'),
    race: await mk(movie, 5, '2026-11-12', '12:00'), later: await mk(movie, 3, '2026-11-12', '15:00'), tomorrow: await mk(movie, 3, '2026-11-13', '12:00'),
    s2: await mk(movie, 6, '2026-11-12', '12:00'), s3: await mk(movie, 8, '2026-11-12', '12:00'), presale: await mk(presaleMovie, 2, '2026-11-12', '15:00'),
    cancelled: await mk(movie, 1, '2026-11-12', '15:00'), grace: await mk(movie, 5, '2026-11-12', '15:00'), quota: await mk(presaleMovie, 1, '2026-11-12', '18:00'),
  };
  // La programacion no permite funciones antes del estreno: la preventa efectiva se simula moviendo el estreno despues de programar.
  env.db.prepare('UPDATE movies SET release_date = ? WHERE id = ?').run('2026-11-20', presaleMovie.id);
  await setClock(T0);
  const cx = await admin.post(`/api/admin/screenings/${S.cancelled.id}/cancel`, { version: S.cancelled.version, confirm: true, reason: 'prueba' });
  assert.equal(cx.status, 200, JSON.stringify(cx.json));
});
after(async () => { for (const m of Object.keys(origConsole)) console[m] = origConsole[m]; await env.stop(); });

describe('permisos y alcance por sede', () => {
  test('vender: solo el cajero; los demas 403, clientes 403, sin sesion 401', async () => {
    assert.equal((await env.client().get(`${C}/screenings`)).status, 401);
    assert.equal((await env.client().post(`${C}/orders`, {})).status, 401);
    for (const c of [admin, sarah, james, anna, c1]) {
      assert.equal((await c.get(`${C}/screenings`)).status, 403);
      assert.equal((await sale(c, S.sell, ['A1'])).status, 403);
      assert.equal((await c.get(`${C}/screenings/${S.sell.id}/seats`)).status, 403);
    }
    assert.equal((await michael.get(`${C}/screenings`)).status, 200);
  });

  test('vender en otra sede: 404 (funcion y mapa); el cajero solo ve las funciones de su sede', async () => {
    assert.equal((await sale(michael, S.s2, ['A1'])).status, 404);
    assert.equal((await sale(michael, S.s3, ['A1'])).status, 404);
    assert.equal((await michael.get(`${C}/screenings/${S.s2.id}/seats`)).status, 404);
    assert.equal((await michael.get(`${C}/screenings/99999/seats`)).status, 404);
    const ids = (await michael.get(`${C}/screenings`)).json.screenings.map((s) => s.id);
    assert.ok(ids.includes(S.sell.id) && !ids.includes(S.s2.id) && !ids.includes(S.s3.id) && !ids.includes(S.tomorrow.id));
    assert.ok(!ids.includes(S.cancelled.id), 'las canceladas no se ofrecen');
    assert.equal(active(S.s2.id), 0);
  });

  test('validar: cajero, operador y gerente si; soporte y admin central 403; clientes 403', async () => {
    for (const c of [michael, anna, sarah]) assert.equal((await look(c, 'CIN-AAAAA-BBBBB')).status, 200);
    for (const c of [james, admin, c1]) {
      assert.equal((await look(c, 'CIN-AAAAA-BBBBB')).status, 403);
      assert.equal((await enter(c, 'CIN-AAAAA-BBBBB')).status, 403);
    }
    assert.equal((await look(env.client(), 'CIN-AAAAA-BBBBB')).status, 401);
  });

  test('reembolsar: soporte y gerente de la sede, admin central; cajero y operador 403; otra sede 404', async () => {
    const o = (await web(c1, S.refund, ['H1'])).json.order.code;
    for (const c of [michael, anna, c1]) assert.equal((await refund(c, o)).status, 403);
    assert.equal((await refund(env.client(), o)).status, 401);
    assert.equal((await refund(emily, o)).status, 404, 'gerente de otra sede');
    assert.equal((await refund(lisa, o)).status, 403);
    assert.equal((await refund(james, o)).status, 200);
    assert.equal((await refund(james, o)).status, 409, 'ya reembolsada');
    const o2 = (await web(c1, S.refund, ['H2'])).json.order.code;
    assert.equal((await refund(admin, o2)).status, 200);
    const o3 = (await web(c1, S.refund, ['H3'])).json.order.code;
    assert.equal((await refund(sarah, o3)).status, 200);
    // soporte de sede 1 sobre una orden de la sede 2
    const o4 = (await web(c1, S.s2, ['H1'])).json.order.code;
    assert.equal((await refund(james, o4)).status, 404);
    assert.equal((await refund(sarah, o4)).status, 404);
    assert.equal((await refund(admin, o4)).status, 200);
    invariant();
  });
});

describe('venta en mostrador', () => {
  test('lista de funciones de hoy con estado y butacas libres', async () => {
    const r = await michael.get(`${C}/screenings`);
    assert.equal(r.headers.get('cache-control'), 'no-store'); assert.equal(r.json.date, '2026-11-12');
    const s = r.json.screenings.find((x) => x.id === S.sell.id);
    assert.equal(s.startTime, '12:00'); assert.equal(s.price, 20); assert.equal(s.totalSeats, 150); assert.equal(s.freeSeats, 150);
    assert.deepEqual(s.sale, { open: true, reason: 'open', closesAt: '12:15' });
    const p = r.json.screenings.find((x) => x.id === S.presale.id);
    assert.equal(p.sale.open, false); assert.equal(p.sale.reason, 'presale_requires_account');
  });

  test('venta anonima feliz: orden de mostrador sin cuenta, total, butacas y booked_seats', async () => {
    const r = await sale(michael, S.sell, ['B2', 'B1', 'B3']);
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const o = r.json.order;
    assert.match(o.code, /^CIN-/); assert.equal(o.amount, 60); assert.deepEqual(o.seats.map((x) => x.seat), ['B1', 'B2', 'B3']);
    assert.equal(o.payment.method, 'cash'); assert.equal(o.status, 'approved');
    const row = env.db.prepare('SELECT * FROM orders WHERE id = ?').get(o.code);
    assert.equal(row.channel, 'counter'); assert.equal(row.user_id, null); assert.equal(row.customer_name, 'Venta en mostrador'); assert.equal(row.email, '');
    assert.equal(active(S.sell.id), 3); assert.equal(booked(S.sell.id), 3);
    const map = (await michael.get(`${C}/screenings/${S.sell.id}/seats`)).json;
    assert.deepEqual(map.taken, ['B1', 'B2', 'B3']); assert.equal(map.limits.perOrder, MAX_TICKETS_PER_COUNTER_ORDER);
    assert.equal(map.layout.cols, 14);
    invariant();
  });

  test('venta con nombre y pago con tarjeta; el nombre sale solo en la lista de ordenes y el correo no existe', async () => {
    const r = await sale(michael, S.sell, ['C1'], { customerName: '  Rosa   Medina ', payment: { method: 'card' } });
    assert.equal(r.status, 201);
    const row = env.db.prepare('SELECT * FROM orders WHERE id = ?').get(r.json.order.code);
    assert.equal(row.customer_name, 'Rosa Medina'); assert.equal(row.email, ''); assert.equal(row.method, 'card');
    const list = (await sarah.get('/api/admin/orders?channel=counter')).json;
    const mine = list.orders.find((o) => o.code === r.json.order.code);
    assert.equal(mine.customerName, 'Rosa Medina'); assert.equal(mine.emailMasked, null); assert.equal(mine.channel, 'counter');
    assert.equal(list.orders.length, 2);
  });

  test('idempotencia: misma clave devuelve la misma orden sin duplicar; otra carga distinta 409', async () => {
    const key = crypto.randomUUID();
    const body = { screeningId: S.sell.id, seats: ['D1', 'D2'], idempotencyKey: key, payment: { method: 'cash' } };
    const a = await michael.post(`${C}/orders`, body); const b = await michael.post(`${C}/orders`, body);
    assert.equal(a.status, 201); assert.equal(b.status, 200); assert.equal(b.json.replayed, true); assert.equal(a.json.order.code, b.json.order.code);
    assert.equal(env.db.prepare(`SELECT COUNT(*) c FROM order_seats WHERE order_id = ?`).get(a.json.order.code).c, 2);
    assert.equal((await michael.post(`${C}/orders`, { ...body, seats: ['D1', 'D3'] })).status, 409);
    invariant();
  });

  test('validaciones: cuerpo, tope por orden, duplicadas, butaca invalida, metodo y nombre', async () => {
    const bad = async (over, field) => { const r = await sale(michael, S.sell, ['E1'], over); assert.equal(r.status, 400, JSON.stringify(over)); assert.ok(r.json.errors[field], field); };
    await bad({ seats: [] }, 'seats'); await bad({ seats: ['E1', 'E1'] }, 'seats'); await bad({ seats: [1] }, 'seats');
    await bad({ seats: Array.from({ length: MAX_TICKETS_PER_COUNTER_ORDER + 1 }, (_, i) => `F${i + 1}`) }, 'seats');
    await bad({ payment: { method: 'credit_card' } }, 'payment'); await bad({ payment: {} }, 'payment');
    await bad({ idempotencyKey: 'x' }, 'idempotencyKey'); await bad({ customerName: 'a'.repeat(61) }, 'customerName'); await bad({ customerName: 5 }, 'customerName');
    await bad({ screeningId: 'x' }, 'screeningId');
    assert.equal((await sale(michael, S.sell, ['Z99'])).status, 400);
    assert.equal((await sale(michael, S.sell, ['A1'])).status, 201);
  });

  test('hasta 10 butacas por orden (mas que la web) y sin tope acumulado', async () => {
    const seats = Array.from({ length: MAX_TICKETS_PER_COUNTER_ORDER }, (_, i) => `G${i + 1}`);
    assert.equal((await sale(michael, S.sell, seats)).status, 201);
    assert.equal((await sale(michael, S.sell, ['H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'H7', 'H8', 'H9', 'H10'])).status, 201);
    invariant();
  });

  test('butaca tomada: 409 seats_taken con la lista y sin ventas parciales', async () => {
    const r = await sale(michael, S.sell, ['J1', 'B1']);
    assert.equal(r.status, 409); assert.equal(r.json.error, 'seats_taken'); assert.deepEqual(r.json.seats, ['B1']);
    assert.equal(env.db.prepare(`SELECT COUNT(*) c FROM order_seats WHERE screening_id = ? AND seat = 'J1'`).get(S.sell.id).c, 0);
  });

  test('en paralelo con una compra web por la misma butaca: gana una sola', async () => {
    for (let i = 0; i < 6; i++) {
      const seat = `I${i + 1}`;
      const [a, b] = await Promise.all([sale(michael, S.race, [seat]), web(c2, S.race, [seat])]);
      assert.deepEqual([a.status, b.status].sort(), [201, 409], `${seat}: ${a.status}/${b.status}`);
      assert.equal(env.db.prepare(`SELECT COUNT(*) c FROM order_seats WHERE screening_id = ? AND seat = ? AND active = 1`).get(S.race.id, seat).c, 1);
    }
    invariant();
  });

  test('una compra web ve las butacas vendidas en mostrador y a la inversa', async () => {
    const r = await sale(michael, S.race, ['H1']);
    assert.equal(r.status, 201);
    const pub = (await c1.get(`/api/screenings/${S.race.id}/seats`)).json;
    assert.ok(pub.taken.includes('H1'));
    assert.equal((await web(c1, S.race, ['H1'])).status, 409);
    const w = await web(c1, S.race, ['H2']); assert.equal(w.status, 201);
    assert.equal((await sale(michael, S.race, ['H2'])).status, 409);
    invariant();
  });

  test('preventa efectiva: 409 presale_requires_account y no se escribe nada', async () => {
    const r = await sale(michael, S.presale, ['A1']);
    assert.equal(r.status, 409); assert.equal(r.json.error, 'presale_requires_account');
    assert.equal(active(S.presale.id), 0);
  });

  test('funcion cancelada: 404; funcion de otro dia: no se vende (no esta a la venta de hoy)', async () => {
    assert.equal((await sale(michael, S.cancelled, ['A1'])).status, 404);
    assert.equal((await sale(michael, { id: 99999 }, ['A1'])).status, 404);
  });

  test('ventana: la web cierra al inicio; el mostrador vende hasta 15 minutos despues', async () => {
    await setClock(limaAt(15, 0));                                   // justo al inicio de grace (15:00)
    assert.equal((await web(c1, S.grace, ['A1'])).status, 409, 'web cerrada');
    assert.equal((await sale(michael, S.grace, ['A1'])).status, 201, 'mostrador abierto al inicio');
    await setClock(limaAt(15, COUNTER_SALE_GRACE_MINUTES - 1));
    assert.equal((await sale(michael, S.grace, ['A2'])).status, 201, '14 minutos despues');
    const st = (await michael.get(`${C}/screenings`)).json.screenings.find((x) => x.id === S.grace.id);
    assert.equal(st.sale.open, true); assert.equal(st.sale.closesAt, '15:15');
    await setClock(limaAt(15, COUNTER_SALE_GRACE_MINUTES));
    const r = await sale(michael, S.grace, ['A3']);
    assert.equal(r.status, 409); assert.equal(r.json.error, 'not_on_sale');
    assert.equal((await michael.get(`${C}/screenings`)).json.screenings.find((x) => x.id === S.grace.id).sale.reason, 'closed');
    await setClock(limaAt(17, 0));                                   // ya termino (16:40)
    assert.equal((await sale(michael, S.grace, ['A4'])).status, 409);
    assert.equal((await michael.get(`${C}/screenings`)).json.screenings.find((x) => x.id === S.grace.id).sale.reason, 'finished');
    await setClock(T0);
    invariant();
  });

  test('agotada: 409 sold_out y estado en la lista', async () => {
    const small = await mk(movie, 8, '2026-11-12', '20:00');        // sede 3, 130 butacas
    const tot = env.db.prepare('SELECT total_seats t FROM screenings WHERE id = ?').get(small.id).t;
    assert.equal(tot, 130);
    // llena la funcion por SQL de servicio: ventas en mostrador de a 10 con emily no puede (no es cajera): usa la cajera de la sede 3
    env.db.prepare(`UPDATE users SET role = 'cashier' WHERE id = 4`).run();
    const e = await login('emily.rodriguez@cinerama.com');
    const all = allSeatIds(130);
    assert.equal(all.length, 130);
    for (let i = 0; i < all.length; i += 10) assert.equal((await sale(e, small, all.slice(i, i + 10))).status, 201);
    assert.equal(booked(small.id), 130);
    const r = await sale(e, small, ['A1']);
    assert.equal(r.status, 409); assert.equal(r.json.error, 'sold_out');
    assert.equal((await e.get(`${C}/screenings`)).json.screenings.find((x) => x.id === small.id).sale.reason, 'sold_out');
    env.db.prepare(`UPDATE users SET role = 'manager' WHERE id = 4`).run();
    invariant();
  });
});

describe('validacion en puerta', () => {
  let web1; let counter1; let codeNorm;
  test('valida un codigo web y uno de mostrador; acepta minusculas, sin guiones y con espacios', async () => {
    web1 = (await web(c1, S.valid, ['A1', 'A2', 'A3'])).json.order.code;
    // sede 2: operador
    assert.equal((await look(anna, web1)).json.result, 'not_found', 'el operador de la sede 2 no ve la orden de la sede 1');
    const w2 = (await web(c1, S.s2, ['B1', 'B2'])).json.order.code;
    const lk = await look(anna, w2);
    assert.equal(lk.status, 200); assert.equal(lk.json.result, 'too_early');                  // 10:00, abre a las 11:00
    assert.equal(lk.json.opensAt, '11:00'); assert.equal(CHECKIN_OPENS_MINUTES_BEFORE, 60);
    await setClock(limaAt(11, 30));
    const ok = await look(anna, w2.toLowerCase().replaceAll('-', ' '));
    assert.equal(ok.json.result, 'valid'); assert.equal(ok.json.pending, 2);
    assert.equal(ok.json.order.code, w2); assert.deepEqual(ok.json.order.seats, [{ seat: 'B1', checkedIn: false }, { seat: 'B2', checkedIn: false }]);
    const cs = await sale(michael, S.valid, ['K1', 'K2']); assert.equal(cs.status, 201, JSON.stringify(cs.json));
    counter1 = cs.json.order.code;
    codeNorm = w2.replaceAll('-', '').toLowerCase();
    assert.equal((await look(michael, web1)).json.result, 'valid');
    assert.equal((await look(michael, counter1)).json.result, 'valid');
  });

  test('el resumen no trae nombre, correo, cuenta ni datos de pago', async () => {
    const raw = JSON.stringify((await look(michael, web1)).json);
    assert.ok(!/customer|email|correo|user|phone|dni|payment|idempotency|taq80/i.test(raw), raw);
    assert.ok(!raw.includes('Cliente Taquilla'));
  });

  test('ingreso total, parcial y repetido (idempotente), con registro de quien y cuando', async () => {
    const a = await enter(michael, web1, ['A1']);
    assert.equal(a.status, 200); assert.equal(a.json.changed, 1); assert.equal(a.json.result, 'valid'); assert.equal(a.json.pending, 2);
    const rep = await enter(michael, web1, ['A1']);
    assert.equal(rep.status, 200); assert.equal(rep.json.changed, 0); assert.equal(rep.json.pending, 2);
    const row = env.db.prepare(`SELECT checked_in_at, checked_in_by FROM order_seats WHERE order_id = ? AND seat = 'A1'`).get(web1);
    assert.equal(row.checked_in_at, env.clock.now); assert.equal(row.checked_in_by, 3);
    assert.equal(env.db.prepare(`SELECT checked_in_at FROM order_seats WHERE order_id = ? AND seat = 'A2'`).get(web1).checked_in_at, null);
    // parcial: la orden de la web sigue "vigente" para el cliente
    assert.equal((await c1.get(`/api/orders/${web1}`)).json.order.displayStatus, 'valid');
    const rest = await enter(michael, web1);                        // todas las pendientes
    assert.equal(rest.json.changed, 2); assert.equal(rest.json.result, 'used');
    const again = await enter(michael, web1);
    assert.equal(again.status, 200); assert.equal(again.json.changed, 0); assert.equal(again.json.result, 'used');
    assert.equal((await look(michael, web1)).json.result, 'used');
    // el cliente la ve como usada
    const mine = (await c1.get(`/api/orders/${web1}`)).json.order;
    assert.equal(mine.displayStatus, 'used'); assert.ok(mine.seats.every((s) => s.checkedIn));
    // el segundo check-in no cambio la hora original
    assert.equal(env.db.prepare(`SELECT checked_in_by FROM order_seats WHERE order_id = ? AND seat = 'A1'`).get(web1).checked_in_by, 3);
  });

  test('ingreso: butacas ajenas a la orden o lista vacia 400; no se puede ingresar fuera de ventana ni en otra sede', async () => {
    assert.equal((await enter(michael, counter1, ['Z1'])).status, 400);
    assert.equal((await enter(michael, counter1, [])).status, 400);
    assert.equal((await enter(michael, counter1, ['K1', 'K1'])).status, 400);
    assert.equal((await enter(michael, counter1, 'K1')).status, 400);
    assert.equal((await enter(anna, counter1)).status, 409, 'otra sede');
    assert.equal((await enter(anna, counter1)).json.result, 'not_found');
    assert.equal(env.db.prepare(`SELECT COUNT(*) c FROM order_seats WHERE order_id = ? AND checked_in_at IS NOT NULL`).get(counter1).c, 0);
    assert.equal((await enter(michael, counter1, ['K2'])).json.changed, 1);
  });

  test('cada resultado: reembolsada, rechazada, cancelada, otra sede = inexistente = mal formada', async () => {
    const refundedCode = (await sale(michael, S.valid, ['J1'])).json.order.code;
    assert.equal((await refund(sarah, refundedCode, 'duplicate_purchase')).status, 200);
    const r = await look(michael, refundedCode);
    assert.equal(r.json.result, 'refunded'); assert.equal(r.json.order.refund.reasonCode, 'duplicate_purchase'); assert.equal(r.json.order.refund.reason, 'Compra duplicada');
    assert.equal((await enter(michael, refundedCode)).status, 409);
    const dec = await web(c2, S.valid, ['J3'], 'declined');
    assert.equal(dec.status, 402);
    assert.equal((await look(michael, dec.json.order.code)).json.result, 'rejected');
    const cc = (await sale(michael, S.valid, ['J2'])).json.order.code;
    env.db.prepare(`UPDATE orders SET status = 'cancelled' WHERE id = ?`).run(cc);
    assert.equal((await look(michael, cc)).json.result, 'cancelled');
    // otra sede, inexistente y mal formado: exactamente la misma respuesta y sin datos
    const foreign = (await sale(lisa, S.s2, ['C1'])).json.order.code;
    const a = await look(michael, foreign); const b = await look(michael, 'CIN-AAAAA-BBBBB'); const c = await look(michael, 'hola');
    for (const x of [a, b, c]) { assert.equal(x.status, 200); assert.deepEqual(x.json, { result: 'not_found' }); }
    assert.equal(JSON.stringify(a.json), JSON.stringify(b.json));
    assert.equal((await look(michael, undefined)).status, 400);
    assert.equal((await look(michael, '')).status, 400);
    assert.equal((await look(michael, 'x'.repeat(41))).status, 400);
  });

  test('otro dia y funcion terminada', async () => {
    await setClock(T0);
    const tm = (await web(c1, S.tomorrow, ['A1'])).json.order.code;
    const r = await look(michael, tm);
    assert.equal(r.json.result, 'wrong_day'); assert.equal(r.json.order.screening.date, '2026-11-13');
    assert.equal((await enter(michael, tm)).status, 409);
    await setClock(limaAt(10, 0, 13));                               // ese dia: abre a las 11:00
    assert.equal((await look(michael, tm)).json.result, 'too_early');
    await setClock(limaAt(11, 0, 13));
    assert.equal((await look(michael, tm)).json.result, 'valid');
    await setClock(limaAt(13, 40, 13));                              // termina a las 13:40
    assert.equal((await look(michael, tm)).json.result, 'finished');
    assert.equal((await enter(michael, tm)).status, 409);
    await setClock(limaAt(11, 30));
  });

  test('un dia despues de la funcion tambien es otro dia; la borde de medianoche usa hora de Lima', async () => {
    await setClock(Date.UTC(2026, 10, 13, 4, 59, 0));                // 23:59 del 12 en Lima
    assert.equal((await look(michael, codeNorm.toUpperCase())).json.result, 'not_found');
    const late = (await sale(lisa, S.s2, ['C2'])).json;
    assert.equal(late.error, 'not_on_sale');                         // ya paso: la venta del mostrador cerro
    await setClock(Date.UTC(2026, 10, 12, 15, 0, 0));
  });

  test('limite de intentos: 10 fallos y luego 429; el bloqueo no distingue aciertos; otro usuario no se afecta', async () => {
    await setClock(limaAt(11, 30));
    const good = (await sale(lisa, S.s2, ['C3'])).json.order.code;
    for (let i = 0; i < 10; i++) assert.equal((await look(lisa, `CIN-AAAAA-${String(i).repeat(5).replace(/[01]/g, 'B')}`)).status, 200);
    const r1 = await look(lisa, 'CIN-AAAAA-BBBBB');
    assert.equal(r1.status, 429); assert.equal(r1.json.error, 'too_many_attempts'); assert.ok(r1.json.retryAfter > 0);
    assert.equal((await look(lisa, good)).status, 429, 'ni un acierto');
    assert.equal((await enter(lisa, good)).status, 429);
    assert.equal((await look(anna, good)).json.result, 'valid');
    await setClock(env.clock.now + 11 * 60 * 1000);
    assert.equal((await look(lisa, good)).json.result, 'valid');
    // los aciertos y estados no cuentan como fallos
    for (let i = 0; i < 12; i++) assert.equal((await look(anna, good)).json.result, 'valid');
  });
});

describe('reembolso individual', () => {
  test('motivo fijo obligatorio; el cliente ve el texto; butacas liberadas y recomprables; booked_seats al dia', async () => {
    await setClock(T0);
    const r0 = (await web(c1, S.refund, ['B1', 'B2'])).json.order.code;
    assert.equal(booked(S.refund.id) >= 2, true);
    const before = booked(S.refund.id);
    assert.equal((await james.post(`/api/admin/orders/${r0}/refund`, {})).status, 400);
    assert.equal((await james.post(`/api/admin/orders/${r0}/refund`, { reason: 'screening_cancelled' })).status, 400, 'el motivo del sistema no se elige');
    assert.equal((await james.post(`/api/admin/orders/${r0}/refund`, { reason: 'texto libre' })).status, 400);
    assert.equal(booked(S.refund.id), before);
    const ok = await refund(james, r0, 'wrong_selection');
    assert.equal(ok.status, 200); assert.equal(ok.json.order.status, 'refunded'); assert.equal(ok.json.order.displayStatus, 'refunded');
    assert.deepEqual(ok.json.order.refund.reasonCode, 'wrong_selection'); assert.equal(ok.json.order.refund.reason, 'Función o butacas equivocadas');
    const row = env.db.prepare('SELECT status, refunded_at, refund_reason, refunded_by, payment_ref FROM orders WHERE id = ?').get(r0);
    assert.equal(row.refunded_at, env.clock.now); assert.equal(row.refund_reason, 'wrong_selection'); assert.equal(row.refunded_by, 7); assert.match(row.payment_ref, /\|RFD-/);
    assert.equal(booked(S.refund.id), before - 2);
    assert.equal((await c1.get(`/api/orders/${r0}`)).json.order.refund.reason, 'Función o butacas equivocadas');
    assert.equal((await c1.get('/api/orders?scope=past')).json.orders.some((o) => o.code === r0 && o.displayStatus === 'refunded'), true);
    assert.equal((await web(c2, S.refund, ['B1', 'B2'])).status, 201, 'recomprables');
    assert.equal((await sale(michael, S.refund, ['C1', 'C2'])).status, 201);
    invariant();
  });

  test('estados no reembolsables: rechazada, cancelada, reembolsada y funcion terminada', async () => {
    const dec = await web(c2, S.refund, ['D1'], 'declined');
    const rj = await refund(james, dec.json.order.code); assert.equal(rj.status, 409); assert.equal(rj.json.error, 'not_refundable'); assert.equal(rj.json.status, 'rejected');
    const cc = (await sale(michael, S.refund, ['D2'])).json.order.code;
    env.db.prepare(`UPDATE orders SET status = 'cancelled' WHERE id = ?`).run(cc);
    assert.equal((await refund(james, cc)).json.status, 'cancelled');
    assert.equal((await refund(james, 'CIN-AAAAA-BBBBB')).status, 404);
    assert.equal((await refund(james, 'x')).status, 404);
    const late = (await sale(michael, S.refund, ['D3'])).json.order.code;
    await setClock(limaAt(13, 40));                                  // la funcion de las 12:00 termino
    const fin = await refund(james, late); assert.equal(fin.status, 409); assert.equal(fin.json.error, 'screening_finished');
    await setClock(T0);
    invariant();
  });

  test('con butacas ya ingresadas (total o parcial) no se reembolsa; ingresar no cambia las libres', async () => {
    await setClock(limaAt(11, 30));
    const o = (await sale(michael, S.refund, ['E1', 'E2'])).json.order.code;
    assert.equal((await enter(michael, o, ['E1'])).json.changed, 1);
    const r = await refund(james, o); assert.equal(r.status, 409); assert.equal(r.json.error, 'already_checked_in');
    assert.equal((await enter(michael, o)).json.result, 'used');
    assert.equal((await refund(sarah, o)).json.error, 'already_checked_in');
    assert.equal(env.db.prepare('SELECT status FROM orders WHERE id = ?').get(o).status, 'approved');
    invariant();
  });

  test('cupo de preventa del cliente restituido al reembolsar', async () => {
    await setClock(T0);
    const u = await customer();
    const q1 = (await web(u, S.quota, ['A1', 'A2', 'A3'])).json.order.code;
    assert.equal((await u.get(`/api/presale-quota/${presaleMovie.id}`)).json.presale.remaining, 1);
    assert.equal((await web(u, S.quota, ['A4', 'A5'])).status, 409, 'por encima del cupo');
    assert.equal((await refund(james, q1, 'customer_request')).status, 200);
    assert.equal((await u.get(`/api/presale-quota/${presaleMovie.id}`)).json.presale.remaining, 4);
    assert.equal((await web(u, S.quota, ['A1', 'A2', 'A3', 'A4'])).status, 201);
    invariant();
  });

  test('reembolsar una venta de mostrador funciona igual', async () => {
    const o = (await sale(michael, S.refund, ['F1'])).json.order.code;
    assert.equal((await refund(sarah, o)).status, 200);
    assert.equal(env.db.prepare(`SELECT COUNT(*) c FROM order_seats WHERE order_id = ? AND active = 1`).get(o).c, 0);
    invariant();
  });
});

describe('invariante, cancelacion, auditoria y consola', () => {
  test('cancelar una funcion con ventas de mostrador y web las reembolsa y deja booked_seats en cero', async () => {
    const s = await mk(movie, 3, '2026-11-12', '22:00');
    await web(c1, s, ['A1']); await sale(michael, s, ['A2', 'A3']);
    assert.equal(booked(s.id), 3);
    const r = await admin.post(`/api/admin/screenings/${s.id}/cancel`, { version: s.version, confirm: true, reason: 'prueba' });
    assert.equal(r.status, 200); assert.equal(r.json.refundedOrders, 2);
    assert.equal(booked(s.id), 0); assert.equal(active(s.id), 0);
    invariant();
  });

  test('el invariante vale para todas las funciones al final', () => invariant());

  test('demoGate: con la contrasena de demostracion vender y validar siguen; reembolsar y la lista se bloquean', async () => {
    env.db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(await hashPassword(DEMO_PASSWORD));
    const o = (await sale(michael, S.later, ['A1'])).json.order.code;
    assert.equal((await sale(michael, S.later, ['A2'])).status, 201);
    assert.equal((await michael.get(`${C}/screenings`)).status, 200);
    assert.equal((await look(michael, o)).status, 200);
    const r = await refund(james, o); assert.equal(r.status, 403); assert.deepEqual(r.json, { error: 'demo_password' });
    assert.equal((await sarah.get('/api/admin/orders')).json.error, 'demo_password');
    assert.equal(env.db.prepare('SELECT status FROM orders WHERE id = ?').get(o).status, 'approved');
    env.db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(await hashPassword(ADMIN_PW));
    assert.equal((await refund(james, o)).status, 200);
  });

  test('audit_log: solo ids, cantidades y codigos fijos; nada de codigos de orden, nombres ni correos', () => {
    const rows = env.db.prepare(`SELECT action, entity, entity_id, detail_json FROM audit_log WHERE action IN ('counter.sale','ticket.checkin','order.refund')`).all();
    const actions = new Set(rows.map((r) => r.action));
    assert.deepEqual([...actions].sort(), ['counter.sale', 'order.refund', 'ticket.checkin']);
    const raw = JSON.stringify(rows);
    assert.ok(!/CIN-|Rosa|Medina|Cliente|@|Venta en mostrador/i.test(raw), raw.slice(0, 300));
    for (const r of rows) assert.equal(r.entity, 'screening');
  });

  test('la consola no registra codigos de orden, nombres ni correos', () => {
    const all = consoleLines.concat(env.logs).join('\n');
    assert.ok(!/CIN-[2-9A-Z]{5}/.test(all) && !/Rosa Medina|taq80|@example\.com/.test(all));
  });
});
