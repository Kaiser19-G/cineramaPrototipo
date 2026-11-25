import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startEnv, regBody, DEMO_PASSWORD } from './helpers.js';
import { hashPassword } from '../auth/crypto.js';

// Funciones que cruzan la medianoche: permisos y sede, maquina de estados, concurrencia, validacion
// del codigo, "a la hora de la funcion", "no recogido" (barrido perezoso, sin reembolso), reembolso y privacidad.
const ADMIN_PW = 'clave-admin-test-1';
const P = '/api/admin/pickups';
const T0 = Date.UTC(2026, 10, 12, 15, 0, 0);                  // 10:00 del 12/11 en Lima
const limaAt = (h, m = 0, day = 12) => Date.UTC(2026, 10, day, h + 5, m, 0);
let env; let admin; let michael; let n = 950; let movie; let screenings;

const login = async (email, password = DEMO_PASSWORD) => { const c = env.client(); const r = await c.post('/api/auth/login', { email, password }); assert.equal(r.status, 200); return c; };
const customer = async () => {
  const i = ++n; const c = env.client();
  const reg = await c.post('/api/auth/register', regBody({ name: `Cliente Cola ${i}`, dni: `7700${String(i).padStart(4, '0')}`, email: `cola${i}@example.com`, phone: `97700${String(i).padStart(4, '0')}` }));
  assert.equal(reg.status, 201);
  assert.equal((await c.post('/api/auth/verify-phone', { code: reg.json.simulation.code })).status, 200);
  c.info = { name: `Cliente Cola ${i}`, email: `cola${i}@example.com` };
  return c;
};
const staffLogins = async () => { admin = await login('admin@cinerama.com', ADMIN_PW); michael = await login('michael.chen@cinerama.com'); };
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
const act = (c, id, action, code) => c.post(`${P}/${id}/${action}`, code === undefined ? {} : { code });
const fstatus = (code) => env.db.prepare('SELECT status FROM fulfillments WHERE order_id = ?').get(code).status;

before(async () => {
  env = await startEnv();
  env.db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(await hashPassword(ADMIN_PW));
  admin = await login('admin@cinerama.com', ADMIN_PW);
  movie = (await admin.post('/api/admin/movies', { title: 'Pelicula Medianoche', genre: 'Drama', duration: 100, rating: '+14', format: ['2D'], language: 'ES', status: 'active', branches: [{ branchId: 1 }, { branchId: 2 }, { branchId: 3 }] })).json.movie;
  screenings = { late: await mk(1, '2026-11-13', '23:30'), early: await mk(2, '2026-11-14', '00:30') };
  await setClock(T0);
});
after(() => env.stop());

describe('cruce de medianoche', () => {
  test('funcion 23:30 -> 01:10: pasada la medianoche sigue en la cola, se busca y recorre sus estados', async () => {
    assert.equal(screenings.late.endTime, '01:10');
    await setClock(T0);
    const o = await buy(await customer(), screenings.late);
    const ref = o.code.slice(-5);
    await setClock(limaAt(23, 40, 13));
    assert.ok(find(await queue(michael), ref));
    await setClock(limaAt(0, 20, 14));                               // ya es 14/11, la funcion sigue en curso
    const q = await queue(michael);
    const p = find(q, ref);
    assert.ok(p, 'sigue en la cola'); assert.equal(p.blocked, null); assert.deepEqual(p.actions, ['start', 'ready', 'deliver']);
    const lk = await michael.post(`${P}/lookup`, { code: o.code });
    assert.equal(lk.json.result, 'found'); assert.equal(lk.json.pickup.blocked, null);
    const id = lk.json.pickup.id;
    assert.equal((await act(michael, id, 'start')).status, 200);
    assert.equal((await act(michael, id, 'ready')).status, 200);
    assert.equal((await act(michael, id, 'revert')).status, 200);
    assert.equal((await act(michael, id, 'deliver', o.code)).status, 200);
    assert.equal(fstatus(o.code), 'delivered');
  });

  test('al terminar la funcion pasa a no recogido y sale de la cola', async () => {
    await setClock(T0);
    const o = await buy(await customer(), screenings.late, 'at_showtime');
    const ref = o.code.slice(-5);
    await setClock(limaAt(1, 5, 14));
    assert.ok(find(await queue(michael), ref));
    assert.equal(fstatus(o.code), 'ordered');
    await setClock(limaAt(1, 10, 14));                               // fin = 01:10
    assert.ok(!find(await queue(michael), ref));
    assert.equal(fstatus(o.code), 'not_collected');
    assert.equal((await michael.post(`${P}/lookup`, { code: o.code })).json.pickup.blocked, 'not_collected');
  });

  test('funcion de 00:30 del dia siguiente consultada a las 22:00 no se cuela; ese dia si opera', async () => {
    await setClock(T0);
    const o = await buy(await customer(), screenings.early, 'on_arrival');
    const ref = o.code.slice(-5);
    await setClock(limaAt(22, 0, 13));
    assert.ok(!find(await queue(michael), ref));
    const lk = await michael.post(`${P}/lookup`, { code: o.code });
    assert.equal(lk.json.pickup.blocked, 'wrong_day'); assert.deepEqual(lk.json.pickup.actions, []);
    assert.equal((await act(michael, lk.json.pickup.id, 'start')).status, 409);
    await setClock(limaAt(0, 10, 14));
    const p = find(await queue(michael), ref);
    assert.ok(p); assert.equal(p.blocked, null);
  });

  test('taquilla: el ticket de una funcion en curso pasada la medianoche es valido, no wrong_day', async () => {
    await setClock(T0);
    const c = await customer();
    const r = await c.post('/api/orders', { screeningId: screenings.late.id, seats: ['H8'], idempotencyKey: crypto.randomUUID(), payment: { method: 'card', simulatedOutcome: 'approved' } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    await setClock(limaAt(0, 20, 14));
    const v = await michael.post('/api/admin/counter/tickets/lookup', { code: r.json.order.code });
    assert.equal(v.json.result, 'valid', JSON.stringify(v.json));
    await setClock(limaAt(22, 0, 13));
  });
});
