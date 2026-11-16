import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startEnv, regBody, DEMO_PASSWORD } from './helpers.js';
import { hashPassword } from '../auth/crypto.js';

// Cola de preparacion y entrega de confiteria (fase 5d): permisos y sede, maquina de estados, concurrencia, validacion
// del codigo, "a la hora de la funcion", "no recogido" (barrido perezoso, sin reembolso), reembolso y privacidad.
const ADMIN_PW = 'clave-admin-test-1';
const P = '/api/admin/pickups';
const T0 = Date.UTC(2026, 10, 12, 15, 0, 0);                  // 10:00 del 12/11 en Lima
const limaAt = (h, m = 0, day = 12) => Date.UTC(2026, 10, day, h + 5, m, 0);
let env; let admin; let sarah; let michael; let lisa; let anna; let james; let emily; let n = 950; let movie; let screenings;

const login = async (email, password = DEMO_PASSWORD) => { const c = env.client(); const r = await c.post('/api/auth/login', { email, password }); assert.equal(r.status, 200); return c; };
const customer = async () => {
  const i = ++n; const c = env.client();
  const reg = await c.post('/api/auth/register', regBody({ name: `Cliente Cola ${i}`, dni: `7700${String(i).padStart(4, '0')}`, email: `cola${i}@example.com`, phone: `97700${String(i).padStart(4, '0')}` }));
  assert.equal(reg.status, 201);
  assert.equal((await c.post('/api/auth/verify-phone', { code: reg.json.simulation.code })).status, 200);
  c.info = { name: `Cliente Cola ${i}`, email: `cola${i}@example.com` };
  return c;
};
const staffLogins = async () => {
  admin = await login('admin@cinerama.com', ADMIN_PW); sarah = await login('sarah.mitchell@cinerama.com'); michael = await login('michael.chen@cinerama.com');
  lisa = await login('lisa.brown@cinerama.com'); anna = await login('anna.martinez@cinerama.com'); james = await login('james.wilson@cinerama.com');
  emily = await login('emily.rodriguez@cinerama.com');
};
const setClock = async (ms) => { env.clock.now = ms; await staffLogins(); };
const mk = async (hallId, date, startTime) => {
  const r = await admin.post('/api/admin/screenings', { movieId: movie.id, hallId, date, startTime, language: 'ES', format: '2D', price: 20 });
  assert.equal(r.status, 201, JSON.stringify(r.json)); return r.json.screening;
};
const vid = (name, label) => env.db.prepare(`SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.name = ? AND v.label = ?`).get(name, label).id;
let seatN = 0;
const seatFor = () => { const s = `${'ABCDEFGH'[Math.floor(seatN / 9) % 8]}${(seatN % 9) + 1}`; seatN++; return s; };
// Compra web con confiteria; `c` = cliente; devuelve la orden.
const buy = async (c, s, timing = 'on_arrival', over = {}) => {
  env.db.prepare(`DELETE FROM auth_throttle WHERE key LIKE 'buy:user:%'`).run();
  const r = await c.post('/api/orders', { screeningId: s.id, seats: [seatFor()], idempotencyKey: crypto.randomUUID(), payment: { method: 'card', simulatedOutcome: 'approved' },
    items: [{ variantId: vid('Canchita salada', 'Mediano'), qty: 2 }, { variantId: vid('Combo pareja', 'Único'), qty: 1 }], pickup: { timing }, ...over });
  assert.equal(r.status, 201, JSON.stringify(r.json));
  return r.json.order;
};
const queue = async (c) => { const r = await c.get(P); assert.equal(r.status, 200, JSON.stringify(r.json)); return r.json; };
const all = (q) => Object.values(q.sections).flat();
const find = (q, ref) => all(q).find((x) => x.ref === ref);
const pid = async (c, code) => { const r = await c.post(`${P}/lookup`, { code }); assert.equal(r.json.result, 'found', JSON.stringify(r.json)); return r.json.pickup.id; };
const act = (c, id, action, code) => c.post(`${P}/${id}/${action}`, code === undefined ? {} : { code });
const fstatus = (code) => env.db.prepare('SELECT status FROM fulfillments WHERE order_id = ?').get(code).status;

before(async () => {
  env = await startEnv();
  env.db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(await hashPassword(ADMIN_PW));
  admin = await login('admin@cinerama.com', ADMIN_PW);
  movie = (await admin.post('/api/admin/movies', { title: 'Pelicula Cola', genre: 'Drama', duration: 100, rating: '+14', format: ['2D'], language: 'ES', status: 'active', branches: [{ branchId: 1 }, { branchId: 2 }, { branchId: 3 }] })).json.movie;
  screenings = {
    arrival: await mk(1, '2026-11-12', '12:00'), showtime: await mk(2, '2026-11-12', '12:00'), flow: await mk(3, '2026-11-12', '15:00'),
    other: await mk(6, '2026-11-12', '12:00'), tomorrow: await mk(1, '2026-11-13', '12:00'), refund: await mk(5, '2026-11-12', '18:00'),
  };
  await setClock(T0);
});
after(() => env.stop());

describe('permisos y alcance por sede', () => {
  test('sin sesion 401; admin central, soporte y clientes 403; gerente, cajero y operador de sede 200', async () => {
    for (const [m, u, b] of [['get', P], ['post', `${P}/lookup`, { code: 'CIN-AAAAA-BBBBB' }], ['post', `${P}/1/start`, {}], ['post', `${P}/1/ready`, {}],
      ['post', `${P}/1/revert`, {}], ['post', `${P}/1/deliver`, { code: 'CIN-AAAAA-BBBBB' }]]) {
      assert.equal((await env.client()[m](u, b)).status, 401, `${m} ${u}`);
      const cust = await customer();
      for (const c of [admin, james, cust]) assert.equal((await c[m](u, b)).status, 403, `${m} ${u}`);
    }
    for (const c of [sarah, michael, lisa, anna, emily]) assert.equal((await c.get(P)).status, 200);
    assert.equal((await admin.get(P)).json.error, 'forbidden');
  });

  test('la cola solo trae la sede del empleado; un pedido de otra sede es 404 / not_found aunque se conozca el codigo', async () => {
    const c = await customer();
    const o = await buy(c, screenings.arrival);                      // sede 1
    const id = await pid(michael, o.code);
    assert.ok(find(await queue(sarah), o.code.slice(-5)));
    assert.ok(!find(await queue(lisa), o.code.slice(-5)), 'sede 2 no lo ve');
    assert.ok(!find(await queue(emily), o.code.slice(-5)), 'sede 3 no lo ve');
    assert.deepEqual((await lisa.post(`${P}/lookup`, { code: o.code })).json, { result: 'not_found' });
    assert.deepEqual((await lisa.post(`${P}/lookup`, { code: 'CIN-AAAAA-BBBBB' })).json, { result: 'not_found' }, 'misma respuesta que un codigo inexistente');
    for (const a of ['start', 'ready', 'revert']) assert.equal((await act(lisa, id, a)).status, 404);
    assert.equal((await act(lisa, id, 'deliver', o.code)).status, 404);
    assert.equal(fstatus(o.code), 'ordered');
    assert.equal((await act(michael, 999999, 'start')).status, 404);
    assert.equal((await act(michael, 'abc', 'start')).status, 404);
  });
});

describe('privacidad de la cola', () => {
  test('no expone nombre, correo ni el codigo completo; solo la referencia de 5 caracteres', async () => {
    const c = await customer();
    const o = await buy(c, screenings.arrival);
    const q = await queue(michael);
    const p = find(q, o.code.slice(-5));
    assert.ok(p); assert.equal(p.ref.length, 5);
    const text = JSON.stringify(q) + JSON.stringify((await michael.post(`${P}/lookup`, { code: o.code })).json);
    assert.ok(!text.includes(o.code), 'codigo completo');
    assert.ok(!text.includes(o.code.slice(0, 9)), 'primer grupo del codigo');
    assert.ok(!text.includes(c.info.name) && !text.includes('Cliente Cola') && !text.includes(c.info.email) && !text.includes('example.com'));
    assert.ok(!/email|customer|user_?id|phone|dni/i.test(text), 'ni campos de datos personales');
    assert.deepEqual(p.items.map((i) => [i.qty, i.name, i.variantLabel]).sort(), [[1, 'Combo pareja', 'Único'], [2, 'Canchita salada', 'Mediano']]);
    assert.ok(p.items.find((i) => i.name === 'Combo pareja').includes, 'composicion del combo');
    assert.equal(p.timing, 'on_arrival'); assert.equal(p.screening.startTime, '12:00');
    assert.deepEqual(p.actions, ['start', 'ready', 'deliver'], 'la cola ya trae las acciones posibles'); assert.equal(p.blocked, null);
    assert.equal((await michael.get(P)).headers.get('cache-control'), 'no-store');
  });
});

describe('maquina de estados', () => {
  test('al llegar: ordered -> preparing (registra la llegada) -> ready -> delivered; cada paso repetido da 409', async () => {
    const c = await customer(); const o = await buy(c, screenings.arrival);
    const id = await pid(michael, o.code);
    assert.ok(find(await queue(michael), o.code.slice(-5)) && (await queue(michael)).sections.waitingArrival.some((x) => x.ref === o.code.slice(-5)), 'esperando llegada');
    const row0 = env.db.prepare('SELECT arrived_at FROM fulfillments WHERE order_id = ?').get(o.code); assert.equal(row0.arrived_at, null);
    let r = await act(michael, id, 'start'); assert.equal(r.status, 200); assert.equal(r.json.pickup.status, 'preparing'); assert.ok(r.json.pickup.arrivedAt);
    assert.equal(env.db.prepare('SELECT arrived_at FROM fulfillments WHERE order_id = ?').get(o.code).arrived_at, env.clock.now);
    assert.ok((await queue(michael)).sections.preparing.some((x) => x.ref === o.code.slice(-5)));
    r = await act(sarah, id, 'start'); assert.equal(r.status, 409); assert.equal(r.json.error, 'invalid_transition'); assert.equal(r.json.status, 'preparing');
    r = await act(michael, id, 'ready'); assert.equal(r.status, 200); assert.equal(r.json.pickup.status, 'ready');
    assert.equal(env.db.prepare('SELECT ready_by FROM fulfillments WHERE order_id = ?').get(o.code).ready_by, 3);
    r = await act(michael, id, 'ready'); assert.equal(r.status, 409); assert.equal(r.json.status, 'ready');
    assert.ok((await queue(michael)).sections.ready.some((x) => x.ref === o.code.slice(-5)));
    r = await act(michael, id, 'revert'); assert.equal(r.status, 200); assert.equal(r.json.pickup.status, 'preparing');
    assert.equal(env.db.prepare('SELECT ready_at FROM fulfillments WHERE order_id = ?').get(o.code).ready_at, null);
    assert.equal((await act(michael, id, 'revert')).status, 409, 'solo se deshace desde listo');
    await act(michael, id, 'ready');
    r = await act(michael, id, 'deliver', o.code); assert.equal(r.status, 200); assert.equal(r.json.pickup.status, 'delivered');
    const f = env.db.prepare('SELECT delivered_by, delivered_at FROM fulfillments WHERE order_id = ?').get(o.code);
    assert.equal(f.delivered_by, 3); assert.equal(f.delivered_at, env.clock.now);
    assert.ok(!find(await queue(michael), o.code.slice(-5)), 'entregado sale de la cola');
    for (const a of ['start', 'ready', 'revert']) { const x = await act(michael, id, a); assert.equal(x.status, 409, a); assert.equal(x.json.status, 'delivered'); }
    assert.equal((await act(michael, id, 'deliver', o.code)).status, 409, 'no se entrega dos veces');
    // el cliente lo ve actualizado
    const mine = await c.get(`/api/orders/${o.code}`);
    assert.equal(mine.json.order.pickup.status, 'delivered'); assert.equal(mine.json.order.pickup.statusLabel, 'Entregado');
  });

  test('saltos permitidos por el informe: ordered -> ready y ordered -> delivered con el codigo; llegada registrada tambien', async () => {
    const c = await customer(); const a = await buy(c, screenings.arrival); const b = await buy(c, screenings.arrival);
    const ia = await pid(michael, a.code); const ib = await pid(michael, b.code);
    assert.equal((await act(michael, ia, 'ready')).json.pickup.status, 'ready');
    assert.ok(env.db.prepare('SELECT arrived_at FROM fulfillments WHERE order_id = ?').get(a.code).arrived_at);
    const r = await act(michael, ib, 'deliver', b.code); assert.equal(r.status, 200); assert.equal(r.json.pickup.status, 'delivered');
    assert.ok(env.db.prepare('SELECT arrived_at FROM fulfillments WHERE order_id = ?').get(b.code).arrived_at);
  });

  test('concurrencia: dos empleados a la vez; uno gana y el otro recibe 409 con el estado actual', async () => {
    const c = await customer(); const o = await buy(c, screenings.arrival);
    const id = await pid(michael, o.code);
    const rs = await Promise.all([act(michael, id, 'ready'), act(sarah, id, 'ready')]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409]);
    assert.equal(rs.find((r) => r.status === 409).json.status, 'ready');
    const ds = await Promise.all([act(michael, id, 'deliver', o.code), act(sarah, id, 'deliver', o.code)]);
    assert.deepEqual(ds.map((r) => r.status).sort(), [200, 409]);
    assert.equal(env.db.prepare(`SELECT COUNT(*) c FROM audit_log WHERE action = 'pickup.deliver' AND entity_id = ?`).get(screenings.arrival.id).c >= 1, true);
  });

  test('una orden sin confiteria o rechazada no tiene pedido: lookup no_food', async () => {
    const c = await customer();
    const r = await c.post('/api/orders', { screeningId: screenings.arrival.id, seats: [seatFor()], idempotencyKey: crypto.randomUUID(), payment: { method: 'card' } });
    assert.equal(r.status, 201);
    assert.deepEqual((await michael.post(`${P}/lookup`, { code: r.json.order.code })).json, { result: 'no_food' });
    env.db.prepare(`DELETE FROM auth_throttle WHERE key LIKE 'buy:user:%'`).run();
    const d = await c.post('/api/orders', { screeningId: screenings.arrival.id, seats: [seatFor()], idempotencyKey: crypto.randomUUID(), payment: { method: 'card', simulatedOutcome: 'declined' },
      items: [{ variantId: vid('Canchita salada', 'Mediano'), qty: 1 }], pickup: { timing: 'on_arrival' } });
    assert.equal(d.status, 402);
    assert.deepEqual((await michael.post(`${P}/lookup`, { code: d.json.order.code })).json, { result: 'no_food' });
  });
});

describe('entrega con el codigo', () => {
  test('codigo correcto (con o sin guiones, en minusculas); incorrecto, ausente o de OTRO pedido no entregan', async () => {
    const c = await customer(); const o = await buy(c, screenings.arrival); const other = await buy(c, screenings.arrival);
    const id = await pid(michael, o.code);
    assert.equal((await act(michael, id, 'deliver')).status, 400);
    assert.equal((await michael.post(`${P}/${id}/deliver`, { code: '' })).status, 400);
    assert.equal((await michael.post(`${P}/${id}/deliver`, { code: 'x'.repeat(41) })).status, 400);
    let r = await act(michael, id, 'deliver', 'CIN-AAAAA-BBBBB'); assert.equal(r.status, 422); assert.equal(r.json.error, 'code_mismatch');
    r = await act(michael, id, 'deliver', other.code); assert.equal(r.status, 422, 'el codigo de otro pedido de la misma sede no sirve');
    r = await act(michael, id, 'deliver', o.code.slice(0, 9)); assert.equal(r.status, 422, 'codigo parcial');
    r = await act(michael, id, 'deliver', o.code.slice(-5)); assert.equal(r.status, 422, 'solo la referencia no sirve');
    assert.equal(fstatus(o.code), 'ordered'); assert.equal(fstatus(other.code), 'ordered');
    const compact = o.code.toLowerCase().replace(/-/g, '');
    r = await act(michael, id, 'deliver', ` ${compact} `); assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(fstatus(o.code), 'delivered'); assert.equal(fstatus(other.code), 'ordered');
  });

  test('intentos fallidos: 10 bloquean con 429 (clave propia: la puerta no se bloquea) y no hay oraculo', async () => {
    const c = await customer(); const o = await buy(c, screenings.showtime); // sala 2: sede 1
    const id = await pid(michael, o.code);
    env.db.prepare(`DELETE FROM auth_throttle WHERE key LIKE 'pickup-check:%'`).run();
    for (let i = 0; i < 10; i++) assert.equal((await act(michael, id, 'deliver', 'CIN-AAAAA-BBBBB')).status, 422);
    let r = await act(michael, id, 'deliver', o.code); assert.equal(r.status, 429); assert.ok(r.json.retryAfter > 0);
    r = await michael.post(`${P}/lookup`, { code: o.code }); assert.equal(r.status, 429);
    assert.equal((await michael.post('/api/admin/counter/tickets/lookup', { code: 'CIN-AAAAA-BBBBB' })).status, 200, 'la puerta tiene su propio contador');
    assert.equal((await sarah.post(`${P}/lookup`, { code: o.code })).status, 200, 'otro empleado no se ve afectado');
    assert.equal((await act(michael, id, 'start')).status, 200, 'empezar no usa el codigo ni el bloqueo');
    env.db.prepare(`DELETE FROM auth_throttle WHERE key LIKE 'pickup-check:%'`).run();
  });
});

describe('a la hora de la funcion y otros dias', () => {
  test('no entra a "por preparar" antes de 15 minutos antes del inicio; empezar antes da 409 too_early', async () => {
    const c = await customer(); const o = await buy(c, screenings.flow, 'at_showtime');   // funcion 15:00 -> prepara desde 14:45
    const ref = o.code.slice(-5);
    const id = await pid(michael, o.code);
    let q = await queue(michael);
    assert.ok(!find(q, ref), 'a las 10:00 no aparece'); assert.ok(q.counts.later >= 1);
    for (const a of ['start', 'ready']) { const r = await act(michael, id, a); assert.equal(r.status, 409); assert.equal(r.json.blocked, 'too_early'); }
    assert.equal((await act(michael, id, 'deliver', o.code)).status, 409);
    assert.equal(fstatus(o.code), 'ordered');
    const look = (await michael.post(`${P}/lookup`, { code: o.code })).json;
    assert.equal(look.pickup.blocked, 'too_early'); assert.deepEqual(look.pickup.actions, []); assert.equal(look.pickup.prepareAt, '14:45');
    await setClock(limaAt(14, 44));
    assert.ok(!find(await queue(michael), ref), 'a las 14:44 todavia no');
    await setClock(limaAt(14, 45));
    q = await queue(michael);
    assert.ok(q.sections.toPrepare.some((x) => x.ref === ref), 'a las 14:45 pasa a por preparar');
    assert.equal((await act(michael, id, 'start')).status, 200);
    await act(michael, id, 'deliver', o.code);
    await setClock(T0);
  });

  test('pedido de otro dia: no esta en la cola de hoy y no se opera (wrong_day)', async () => {
    const c = await customer(); const o = await buy(c, screenings.tomorrow);
    assert.ok(!find(await queue(michael), o.code.slice(-5)));
    const id = await pid(michael, o.code);
    const r = await act(michael, id, 'start'); assert.equal(r.status, 409); assert.equal(r.json.blocked, 'wrong_day');
  });
});

describe('no recogido (barrido perezoso, sin reembolso)', () => {
  test('al terminar la funcion pasa a not_collected al leer la cola o la orden; sigue aprobada y sin reembolso', async () => {
    const c = await customer(); const a = await buy(c, screenings.arrival); const b = await buy(c, screenings.arrival); const d = await buy(c, screenings.arrival);
    const ia = await pid(michael, a.code); const ib = await pid(michael, b.code);
    await act(michael, ib, 'start');                                 // preparando y nunca recogido
    await act(michael, await pid(michael, d.code), 'deliver', d.code);   // entregado: no cambia
    await setClock(limaAt(11));
    assert.equal(fstatus(a.code), 'ordered', 'la funcion aun no termina: nada cambia');
    await setClock(limaAt(15));                                      // la funcion de 12:00 ya termino
    assert.equal(fstatus(a.code), 'ordered', 'perezoso: nada hasta que alguien lea');
    // lectura de la orden por el cliente
    const mine = await c.get(`/api/orders/${a.code}`);
    assert.equal(mine.json.order.pickup.status, 'not_collected'); assert.equal(mine.json.order.pickup.statusLabel, 'No recogido');
    assert.equal(mine.json.order.status, 'approved'); assert.equal(mine.json.order.refund, null);
    assert.equal(mine.json.order.amount, a.amount);
    // lectura de la cola
    const q = await queue(michael);
    assert.ok(!find(q, a.code.slice(-5)) && !find(q, b.code.slice(-5)), 'no recogidos fuera de la cola');
    assert.equal(fstatus(b.code), 'not_collected'); assert.equal(fstatus(d.code), 'delivered');
    assert.equal(env.db.prepare('SELECT status, refunded_at FROM orders WHERE id = ?').get(a.code).status, 'approved');
    assert.equal(env.db.prepare('SELECT refunded_at FROM orders WHERE id = ?').get(b.code).refunded_at, null);
    // idempotente y no se opera
    await queue(michael); assert.equal(fstatus(b.code), 'not_collected');
    for (const [id, code] of [[ia, a.code], [ib, b.code]]) {
      for (const act1 of ['start', 'ready', 'revert']) { const r = await act(michael, id, act1); assert.equal(r.status, 409); assert.equal(r.json.status, 'not_collected'); }
      assert.equal((await act(michael, id, 'deliver', code)).status, 409);
    }
    // el reembolso individual ya no aplica (la funcion termino) y tampoco se hizo solo
    assert.equal((await james.post(`/api/admin/orders/${a.code}/refund`, { reason: 'customer_request' })).json.error, 'screening_finished');
    // reportes: el admin ve los no recogidos
    const rep = await admin.get('/api/admin/reports/summary?from=2026-11-12&to=2026-11-12');
    assert.equal(rep.status, 200); assert.ok(rep.json.totals.pickups.notCollected >= 2); assert.ok(rep.json.totals.pickups.delivered >= 1);
    assert.equal(rep.json.totals.pickups.toDeliver, 0);
    await setClock(T0);
  });
});

describe('reembolso y cancelacion', () => {
  test('antes de entregar se reembolsa y sale de la cola; despues de entregar con el flujo real: already_delivered', async () => {
    const c = await customer(); const a = await buy(c, screenings.flow); const b = await buy(c, screenings.flow);
    const ia = await pid(michael, a.code); const ib = await pid(michael, b.code);
    await act(michael, ia, 'start');
    assert.equal((await james.post(`/api/admin/orders/${a.code}/refund`, { reason: 'customer_request' })).status, 200);
    assert.equal(fstatus(a.code), 'cancelled');
    assert.ok(!find(await queue(michael), a.code.slice(-5)));
    for (const x of ['start', 'ready', 'revert']) { const r = await act(michael, ia, x); assert.equal(r.status, 409); assert.equal(r.json.status, 'cancelled'); }
    assert.equal((await act(michael, ia, 'deliver', a.code)).status, 409);
    assert.equal((await michael.post(`${P}/lookup`, { code: a.code })).json.pickup.statusLabel, 'Cancelado');
    // entrega real y luego intento de reembolso
    assert.equal((await act(michael, ib, 'ready')).status, 200);
    assert.equal((await act(michael, ib, 'deliver', b.code)).status, 200);
    const r = await james.post(`/api/admin/orders/${b.code}/refund`, { reason: 'customer_request' });
    assert.equal(r.status, 409); assert.equal(r.json.error, 'already_delivered');
    assert.equal(env.db.prepare('SELECT status FROM orders WHERE id = ?').get(b.code).status, 'approved'); assert.equal(fstatus(b.code), 'delivered');
  });

  test('funcion cancelada: el pedido se cancela y deja la cola', async () => {
    const c = await customer(); const o = await buy(c, screenings.refund);
    assert.ok(find(await queue(sarah), o.code.slice(-5)));
    const s = (await admin.get(`/api/admin/screenings/${screenings.refund.id}`)).json.screening ?? screenings.refund;
    const x = await admin.post(`/api/admin/screenings/${screenings.refund.id}/cancel`, { version: s.version, confirm: true, reason: 'prueba' });
    assert.equal(x.status, 200, JSON.stringify(x.json));
    assert.equal(fstatus(o.code), 'cancelled');
    assert.ok(!find(await queue(sarah), o.code.slice(-5)));
  });
});

describe('auditoria y consola', () => {
  test('cada transicion queda en audit_log (funcion y sede) sin codigos ni datos personales', async () => {
    const rows = env.db.prepare(`SELECT * FROM audit_log WHERE action LIKE 'pickup.%' ORDER BY id`).all();
    assert.ok(rows.length >= 8);
    const actions = new Set(rows.map((r) => r.action));
    for (const a of ['pickup.start', 'pickup.ready', 'pickup.revert', 'pickup.deliver']) assert.ok(actions.has(a), a);
    for (const r of rows) {
      assert.equal(r.entity, 'screening'); assert.ok(Number.isInteger(r.entity_id)); assert.ok(Number.isInteger(r.branch_id)); assert.ok(r.actor_id > 0);
      assert.deepEqual(Object.keys(JSON.parse(r.detail_json)).sort(), ['from', 'to']);
      assert.ok(!/CIN-|@|Cliente/.test(JSON.stringify(r)));
    }
    const codes = env.db.prepare('SELECT id FROM orders').all().map((r) => r.id);
    const logs = env.logs.join('\n');
    assert.ok(codes.every((c) => !logs.includes(c)), 'ningun codigo de orden en la consola');
    // una transicion invalida no deja rastro
    const before2 = env.db.prepare(`SELECT COUNT(*) c FROM audit_log WHERE action LIKE 'pickup.%'`).get().c;
    await act(michael, 999999, 'start');
    assert.equal(env.db.prepare(`SELECT COUNT(*) c FROM audit_log WHERE action LIKE 'pickup.%'`).get().c, before2);
  });
});
