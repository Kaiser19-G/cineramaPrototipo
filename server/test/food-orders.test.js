import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startEnv, regBody, DEMO_PASSWORD } from './helpers.js';
import { hashPassword } from '../auth/crypto.js';
import { MAX_ITEM_QTY, MAX_FOOD_UNITS_PER_ORDER, MAX_FOOD_LINES, PICKUP_PREP_LEAD_MINUTES } from '../../src/shared/purchase.js';

// Compra con confiteria (fase 5b): precios y disponibilidad calculados por el servidor, foto de precios, limites,
// idempotencia con carrito, reembolsos y reportes con ingresos separados.
const ADMIN_PW = 'clave-admin-test-1';
const T0 = Date.UTC(2026, 10, 12, 15, 0, 0);                  // 10:00 del 12/11 en Lima
let env; let admin; let james; let n = 900; let slot = 0; let movie;

const login = async (email, password = DEMO_PASSWORD) => { const c = env.client(); const r = await c.post('/api/auth/login', { email, password }); assert.equal(r.status, 200); return c; };
const customer = async () => {
  const i = ++n; const c = env.client();
  const reg = await c.post('/api/auth/register', regBody({ name: `Cliente Comida ${i}`, dni: `7600${String(i).padStart(4, '0')}`, email: `comida${i}@example.com`, phone: `97600${String(i).padStart(4, '0')}` }));
  assert.equal(reg.status, 201);
  assert.equal((await c.post('/api/auth/verify-phone', { code: reg.json.simulation.code })).status, 200);
  return c;
};
// Funcion nueva en la sala 1 (sede 1), cada vez en un dia distinto (a partir del 13/11) a las 18:00; precio 20.
const make = async (over = {}, m = movie) => {
  for (;;) {
    const date = new Date(Date.UTC(2026, 10, 13 + slot++)).toISOString().slice(0, 10);
    const r = await admin.post('/api/admin/screenings', { movieId: m.id, hallId: 1, date, startTime: '18:00', language: 'ES', format: '2D', price: 20, ...over });
    if (r.status === 409 && r.json.error === 'hall_overlap') continue;   // choca con una funcion de ejemplo: otro dia
    assert.equal(r.status, 201, JSON.stringify(r.json)); return r.json.screening;
  }
};
const buy = (c, s, seats, over = {}) => {
  env.db.prepare(`DELETE FROM auth_throttle WHERE key LIKE 'buy:user:%'`).run();
  return c.post('/api/orders', { screeningId: s.id, seats, idempotencyKey: crypto.randomUUID(), payment: { method: 'card', simulatedOutcome: 'approved' }, ...over });
};
const vid = (name, label) => env.db.prepare(`SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.name = ? AND v.label = ?`).get(name, label).id;
const price = (id) => env.db.prepare('SELECT price FROM product_variants WHERE id = ?').get(id).price;
const orderRows = () => env.db.prepare('SELECT COUNT(*) c FROM orders').get().c;
const takenSeats = (sid) => env.db.prepare('SELECT COUNT(*) c FROM order_seats WHERE screening_id = ? AND active = 1').get(sid).c;
const soldOut = (branch, id) => env.db.prepare(`INSERT OR REPLACE INTO branch_variants (branch_id,variant_id,status) VALUES (?,?,'sold_out')`).run(branch, id);
const restock = (branch, id) => env.db.prepare('DELETE FROM branch_variants WHERE branch_id = ? AND variant_id = ?').run(branch, id);
const fulfil = (code) => env.db.prepare('SELECT * FROM fulfillments WHERE order_id = ?').get(code);
const AT = { timing: 'on_arrival' };

before(async () => {
  env = await startEnv();
  env.db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(await hashPassword(ADMIN_PW));
  admin = await login('admin@cinerama.com', ADMIN_PW);
  james = await login('james.wilson@cinerama.com');
  movie = (await admin.post('/api/admin/movies', { title: 'Pelicula Comida', genre: 'Drama', duration: 100, rating: '+14', format: ['2D'], language: 'ES', status: 'active', branches: [{ branchId: 1 }] })).json.movie;
  env.clock.now = T0;
});
after(() => env.stop());

describe('compra con items', () => {
  test('total = entradas + confiteria calculado por el servidor; foto de precios; fila de preparacion', async () => {
    const c = await customer(); const s = await make();
    const pop = vid('Canchita salada', 'Mediano'); const combo = vid('Combo pareja', 'Único');
    const r = await buy(c, s, ['A1', 'A2'], { items: [{ variantId: combo, qty: 1 }, { variantId: pop, qty: 2 }], pickup: { timing: 'at_showtime' } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const o = r.json.order;
    const food = Math.round((price(combo) + 2 * price(pop)) * 100) / 100;
    assert.equal(o.foodAmount, food); assert.equal(o.ticketAmount, 40); assert.equal(o.amount, Math.round((40 + food) * 100) / 100);
    assert.deepEqual(o.items.map((i) => [i.name, i.variantLabel, i.qty, i.unitPrice, i.lineTotal]).sort(),
      [['Canchita salada', 'Mediano', 2, 14.9, 29.8], ['Combo pareja', 'Único', 1, 27.9, 27.9]].sort());
    assert.match(o.items.find((i) => i.name === 'Combo pareja').includes, /1 × Canchita salada Mediano, 2 × Gaseosa Mediano/);
    // Fila de preparacion: a la hora de la funcion, 15 min antes del inicio (o ahora si ya paso).
    const f = fulfil(o.code);
    assert.equal(f.status, 'ordered'); assert.equal(f.timing, 'at_showtime'); assert.equal(f.branch_id, 1);
    const start = Date.parse(`${s.date}T00:00:00Z`) + (5 + 18) * 3600000;
    assert.equal(f.prepare_from_ms, Math.max(start - PICKUP_PREP_LEAD_MINUTES * 60000, T0));
    assert.deepEqual([o.pickup.timing, o.pickup.timingLabel, o.pickup.status, o.pickup.statusLabel, o.pickup.point],
      ['at_showtime', 'A la hora de la función', 'ordered', 'Pedido recibido', 'Mostrador de pedidos web']);
    // El detalle (GET) devuelve lo mismo.
    const g = await c.get(`/api/orders/${o.code}`);
    assert.deepEqual(g.json.order, o);
    // La foto no cambia al editar el catalogo despues.
    env.db.prepare('UPDATE product_variants SET price = 99 WHERE id = ?').run(pop);
    env.db.prepare(`UPDATE products SET name = 'Renombrada' WHERE name = 'Canchita salada'`).run();
    const again = await c.get(`/api/orders/${o.code}`);
    assert.deepEqual(again.json.order.items, o.items); assert.equal(again.json.order.amount, o.amount);
    env.db.prepare('UPDATE product_variants SET price = 14.9 WHERE id = ?').run(pop);
    env.db.prepare(`UPDATE products SET name = 'Canchita salada' WHERE name = 'Renombrada'`).run();
  });

  test('on_arrival no fija hora de preparacion; el servidor ignora precios, nombres y totales del cliente', async () => {
    const c = await customer(); const s = await make();
    const water = vid('Agua mineral', 'Único');
    const r = await buy(c, s, ['B1'], {
      items: [{ variantId: water, qty: 2, unitPrice: 0.01, price: 0.01, name: 'Gratis', lineTotal: 0 }], pickup: { timing: 'on_arrival', status: 'delivered' },
      amount: 1, foodAmount: 0, branchId: 3,
    });
    assert.equal(r.status, 201);
    assert.equal(r.json.order.foodAmount, 9); assert.equal(r.json.order.amount, 29);
    assert.equal(r.json.order.items[0].name, 'Agua mineral');
    const f = fulfil(r.json.order.code); assert.equal(f.prepare_from_ms, null); assert.equal(f.status, 'ordered');
  });

  test('compra sin items: identica a antes (sin confiteria, sin fila de preparacion); pickup sin items se ignora', async () => {
    const c = await customer(); const s = await make();
    const r = await buy(c, s, ['C1', 'C2', 'C3'], { pickup: AT });
    assert.equal(r.status, 201);
    assert.deepEqual([r.json.order.amount, r.json.order.foodAmount, r.json.order.ticketAmount, r.json.order.items, r.json.order.pickup], [60, 0, 60, [], null]);
    assert.equal(fulfil(r.json.order.code), undefined);
    const e = await buy(c, await make(), ['C1'], { items: [] });
    assert.equal(e.status, 201); assert.deepEqual([e.json.order.amount, e.json.order.items], [20, []]);
  });

  test('pago rechazado: guarda los items por trazabilidad, sin butacas activas ni fila de preparacion', async () => {
    const c = await customer(); const s = await make();
    const r = await buy(c, s, ['D1'], { items: [{ variantId: vid('Hot dog clásico', 'Único'), qty: 1 }], pickup: AT, payment: { method: 'card', simulatedOutcome: 'declined' } });
    assert.equal(r.status, 402);
    assert.equal(r.json.order.items.length, 1); assert.equal(r.json.order.status, 'rejected');
    assert.equal(fulfil(r.json.order.code), undefined); assert.equal(takenSeats(s.id), 0);
  });
});

describe('validacion y limites', () => {
  const v1 = () => vid('Agua mineral', 'Único');
  const bad = async (items, pickup, expectKey, expectVal) => {
    const c = await customer(); const s = await make(); const before = orderRows();
    const r = await buy(c, s, ['A1'], { items, pickup });
    assert.equal(r.status, 400, JSON.stringify(r.json));
    assert.equal(r.json.errors[expectKey], expectVal);
    assert.equal(orderRows(), before); assert.equal(takenSeats(s.id), 0);
  };
  test('10 por producto/tamano, 20 por pedido y 12 lineas; el limite exacto si pasa', async () => {
    await bad([{ variantId: v1(), qty: MAX_ITEM_QTY + 1 }], AT, 'items', 'qty_too_high');
    env.db.prepare('DELETE FROM branch_variants WHERE branch_id = 1').run();   // todo disponible en la sede 1
    const all = env.db.prepare('SELECT id FROM product_variants WHERE active = 1 ORDER BY id').all().map((r) => r.id);
    await bad(all.slice(0, MAX_FOOD_LINES + 1).map((variantId) => ({ variantId, qty: 1 })), AT, 'items', 'too_many_lines');
    await bad([0, 1, 2].map((i) => ({ variantId: all[i], qty: 7 })), AT, 'items', 'too_many_units');
    // Exactamente 12 lineas y 20 unidades (8 lineas de 2 y 4 de 1) pasa.
    const items = all.slice(0, MAX_FOOD_LINES).map((variantId, i) => ({ variantId, qty: i < 8 ? 2 : 1 }));
    assert.equal(items.reduce((a, i) => a + i.qty, 0), MAX_FOOD_UNITS_PER_ORDER);
    const r = await buy(await customer(), await make(), ['A1'], { items, pickup: AT });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    const r10 = await buy(await customer(), await make(), ['A1'], { items: [{ variantId: v1(), qty: MAX_ITEM_QTY }], pickup: AT });
    assert.equal(r10.status, 201);
  });
  test('cantidad invalida, duplicados, formato, pickup obligatorio e invalido, variante inexistente', async () => {
    await bad([{ variantId: v1(), qty: 0 }], AT, 'items', 'invalid_qty');
    await bad([{ variantId: v1(), qty: 1.5 }], AT, 'items', 'invalid_qty');
    await bad([{ variantId: v1(), qty: 1 }, { variantId: v1(), qty: 2 }], AT, 'items', 'duplicated');
    await bad([{ variantId: '1', qty: 1 }], AT, 'items', 'invalid');
    await bad('agua', AT, 'items', 'invalid');
    await bad([{ variantId: v1(), qty: 1 }], undefined, 'pickup', 'required');
    await bad([{ variantId: v1(), qty: 1 }], { timing: 'mañana' }, 'pickup', 'invalid');
    await bad([{ variantId: 999999, qty: 1 }], AT, 'items', 'unknown_variant');
  });
});

describe('disponibilidad', () => {
  const tryBuy = async (items) => {
    const c = await customer(); const s = await make(); const before = orderRows();
    const r = await buy(c, s, ['A1'], { items, pickup: AT });
    assert.equal(orderRows(), before, 'no se crea orden'); assert.equal(takenSeats(s.id), 0, 'no se toman butacas');
    return r;
  };
  test('tamano inactivo, producto inactivo y agotado en la sede de la funcion: 409 item_unavailable sin orden', async () => {
    const id = vid('Gaseosa', 'Grande');
    env.db.prepare('UPDATE product_variants SET active = 0 WHERE id = ?').run(id);
    let r = await tryBuy([{ variantId: id, qty: 1 }]);
    assert.equal(r.status, 409); assert.equal(r.json.error, 'item_unavailable'); assert.deepEqual(r.json.variantIds, [id]); assert.equal(r.json.items[0].reason, 'inactive');
    env.db.prepare('UPDATE product_variants SET active = 1 WHERE id = ?').run(id);
    const nach = vid('Nachos con queso', 'Único');
    env.db.prepare(`UPDATE products SET active = 0 WHERE name = 'Nachos con queso'`).run();
    r = await tryBuy([{ variantId: nach, qty: 1 }]);
    assert.equal(r.json.error, 'item_unavailable'); assert.equal(r.json.items[0].reason, 'inactive');
    env.db.prepare(`UPDATE products SET active = 1 WHERE name = 'Nachos con queso'`).run();
    soldOut(1, id);
    r = await tryBuy([{ variantId: id, qty: 1 }, { variantId: vid('Agua mineral', 'Único'), qty: 1 }]);
    assert.equal(r.status, 409); assert.deepEqual(r.json.variantIds, [id]); assert.equal(r.json.items[0].reason, 'sold_out');
    assert.deepEqual([r.json.items[0].name, r.json.items[0].variantLabel], ['Gaseosa', 'Grande']);
    // Agotado en OTRA sede no afecta a la sede de la funcion (sede 1).
    restock(1, id); soldOut(3, id);
    r = await buy(await customer(), await make(), ['A1'], { items: [{ variantId: id, qty: 1 }], pickup: AT });
    assert.equal(r.status, 201); restock(3, id);
  });
  test('combo agotado si un componente lo esta (o fue retirado) en la sede', async () => {
    const combo = vid('Combo pareja', 'Único'); const soda = vid('Gaseosa', 'Mediano');
    soldOut(1, soda);
    let r = await tryBuy([{ variantId: combo, qty: 1 }]);
    assert.equal(r.status, 409); assert.deepEqual(r.json.variantIds, [combo]); assert.equal(r.json.items[0].reason, 'sold_out');
    restock(1, soda);
    env.db.prepare('UPDATE product_variants SET active = 0 WHERE id = ?').run(soda);
    r = await tryBuy([{ variantId: combo, qty: 1 }]);
    assert.equal(r.status, 409); assert.equal(r.json.items[0].reason, 'inactive');
    env.db.prepare('UPDATE product_variants SET active = 1 WHERE id = ?').run(soda);
  });
});

describe('cambio de precio entre ver el menu y pagar', () => {
  test('expectedAmount o expectedUnitPrice distintos: 409 price_changed, sin cobro, orden ni butacas; luego se compra con el nuevo total', async () => {
    const c = await customer(); const s = await make();
    const pop = vid('Canchita dulce', 'Pequeño'); const before = orderRows();
    const items = [{ variantId: pop, qty: 2 }];
    // Total que vio el cliente: 2 entradas (40) + 2 x 9.90.
    env.db.prepare('UPDATE product_variants SET price = 11.5 WHERE id = ?').run(pop);
    let r = await buy(c, s, ['A1', 'A2'], { items, pickup: AT, expectedAmount: 59.8 });
    assert.equal(r.status, 409); assert.equal(r.json.error, 'price_changed');
    assert.deepEqual([r.json.amount, r.json.ticketAmount, r.json.foodAmount], [63, 40, 23]);
    assert.deepEqual(r.json.items.map((i) => [i.variantId, i.unitPrice, i.qty]), [[pop, 11.5, 2]]);
    assert.equal(orderRows(), before); assert.equal(takenSeats(s.id), 0);
    // Detalle por linea: el precio unitario que vio el cliente.
    r = await buy(c, s, ['A1', 'A2'], { items: [{ ...items[0], expectedUnitPrice: 9.9 }], pickup: AT });
    assert.equal(r.status, 409); assert.deepEqual(r.json.changedVariantIds, [pop]); assert.equal(r.json.items[0].previousUnitPrice, 9.9);
    assert.equal(orderRows(), before);
    // Con el nuevo total se compra.
    r = await buy(c, s, ['A1', 'A2'], { items: [{ ...items[0], expectedUnitPrice: 11.5 }], pickup: AT, expectedAmount: 63 });
    assert.equal(r.status, 201); assert.equal(r.json.order.amount, 63);
    // Sin expectedAmount (cliente viejo) se cobra el calculado.
    const r2 = await buy(await customer(), await make(), ['A1'], { items, pickup: AT });
    assert.equal(r2.status, 201); assert.equal(r2.json.order.amount, 43);
    // Sin items, un total esperado distinto del precio de la funcion tambien se rechaza.
    const r3 = await buy(await customer(), await make(), ['A1'], { expectedAmount: 15 });
    assert.equal(r3.status, 409); assert.equal(r3.json.error, 'price_changed');
    const r4 = await buy(await customer(), await make(), ['A1'], { expectedAmount: 20 });
    assert.equal(r4.status, 201);
    env.db.prepare('UPDATE product_variants SET price = 9.9 WHERE id = ?').run(pop);
  });
});

describe('idempotencia con carrito', () => {
  test('misma peticion = misma orden (200, replayed); otro carrito, otra cantidad u otro momento = 409 idempotency_conflict', async () => {
    const c = await customer(); const s = await make();
    const key = crypto.randomUUID(); const a = vid('Agua mineral', 'Único'); const b = vid('Hot dog clásico', 'Único');
    const body = { items: [{ variantId: a, qty: 1 }, { variantId: b, qty: 2 }], pickup: AT, idempotencyKey: key };
    const first = await buy(c, s, ['E1'], body);
    assert.equal(first.status, 201);
    const same = await buy(c, s, ['E1'], { ...body, items: [{ variantId: b, qty: 2 }, { variantId: a, qty: 1 }] });
    assert.equal(same.status, 200); assert.equal(same.json.replayed, true); assert.equal(same.json.order.code, first.json.order.code);
    const rows = orderRows();
    for (const other of [
      { ...body, items: [{ variantId: a, qty: 1 }] },
      { ...body, items: [{ variantId: a, qty: 1 }, { variantId: b, qty: 3 }] },
      { ...body, items: [{ variantId: a, qty: 1 }, { variantId: b, qty: 2 }], pickup: { timing: 'at_showtime' } },
      { idempotencyKey: key },
    ]) {
      const r = await buy(c, s, ['E1'], other);
      assert.equal(r.status, 409, JSON.stringify(other)); assert.equal(r.json.error, 'idempotency_conflict');
    }
    assert.equal(orderRows(), rows);
    // Una orden sin items reintentada con items tambien es conflicto.
    const k2 = crypto.randomUUID();
    assert.equal((await buy(c, s, ['E2'], { idempotencyKey: k2 })).status, 201);
    assert.equal((await buy(c, s, ['E2'], { idempotencyKey: k2, items: [{ variantId: a, qty: 1 }], pickup: AT })).status, 409);
    assert.equal((await buy(c, s, ['E2'], { idempotencyKey: k2 })).status, 200);
  });
});

describe('reembolsos', () => {
  const mkOrder = async (items = [{ variantId: vid('Combo personal', 'Único'), qty: 1 }]) => {
    const c = await customer(); const s = await make();
    const r = await buy(c, s, ['F1', 'F2'], { items, pickup: AT });
    assert.equal(r.status, 201); return { c, s, order: r.json.order };
  };
  test('reembolso individual: devuelve todo junto (entradas + confiteria) y cancela el pedido', async () => {
    const { order, s } = await mkOrder();
    assert.equal(order.amount, 55.9);
    const r = await james.post(`/api/admin/orders/${order.code}/refund`, { reason: 'customer_request' });
    assert.equal(r.status, 200, JSON.stringify(r.json));
    assert.equal(r.json.order.status, 'refunded'); assert.equal(r.json.order.amount, 55.9); assert.equal(r.json.order.foodAmount, 15.9);
    assert.equal(r.json.order.pickup.status, 'cancelled'); assert.equal(fulfil(order.code).status, 'cancelled');
    assert.equal(takenSeats(s.id), 0);
  });
  test('en preparacion o lista aun se reembolsa; entregado se bloquea con already_delivered', async () => {
    for (const st of ['preparing', 'ready']) {
      const { order } = await mkOrder();
      env.db.prepare('UPDATE fulfillments SET status = ? WHERE order_id = ?').run(st, order.code);
      assert.equal((await james.post(`/api/admin/orders/${order.code}/refund`, { reason: 'customer_request' })).status, 200);
      assert.equal(fulfil(order.code).status, 'cancelled');
    }
    const { order, s } = await mkOrder();
    env.db.prepare(`UPDATE fulfillments SET status = 'delivered', delivered_at = 1 WHERE order_id = ?`).run(order.code);
    const r = await james.post(`/api/admin/orders/${order.code}/refund`, { reason: 'customer_request' });
    assert.equal(r.status, 409); assert.equal(r.json.error, 'already_delivered');
    assert.equal(env.db.prepare('SELECT status FROM orders WHERE id = ?').get(order.code).status, 'approved');
    assert.equal(takenSeats(s.id), 2); assert.equal(fulfil(order.code).status, 'delivered');
  });
  test('cancelar la funcion reembolsa entradas y confiteria y cancela los pedidos (aunque ya se hubieran entregado)', async () => {
    const { s, order } = await mkOrder();
    const other = await mkOrder([{ variantId: vid('Agua mineral', 'Único'), qty: 1 }]);
    const c2 = await customer();
    const second = await buy(c2, s, ['G1'], { items: [{ variantId: vid('Hot dog clásico', 'Único'), qty: 1 }], pickup: AT });
    assert.equal(second.status, 201);
    env.db.prepare(`UPDATE fulfillments SET status = 'delivered' WHERE order_id = ?`).run(second.json.order.code);
    const cx = await admin.post(`/api/admin/screenings/${s.id}/cancel`, { version: s.version, confirm: true, reason: 'prueba' });
    assert.equal(cx.status, 200, JSON.stringify(cx.json));
    for (const code of [order.code, second.json.order.code]) {
      const o = env.db.prepare('SELECT status, amount FROM orders WHERE id = ?').get(code);
      assert.equal(o.status, 'refunded'); assert.equal(fulfil(code).status, 'cancelled');
    }
    // Una orden de otra funcion no se toca.
    assert.equal(fulfil(other.order.code).status, 'ordered');
  });
});

describe('Taquilla sin confiteria', () => {
  test('la venta en mostrador no lleva items aunque se envien', async () => {
    const s = await make();
    env.db.prepare(`DELETE FROM auth_throttle`).run();
    const cashier = await login('michael.chen@cinerama.com');
    const r = await cashier.post('/api/admin/counter/orders', { screeningId: s.id, seats: ['H1'], idempotencyKey: crypto.randomUUID(), payment: { method: 'cash' },
      items: [{ variantId: vid('Agua mineral', 'Único'), qty: 1 }], pickup: AT });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.deepEqual([r.json.order.amount, r.json.order.foodAmount, r.json.order.items, r.json.order.pickup], [20, 0, [], null]);
    assert.equal(fulfil(r.json.order.code), undefined);
  });
});

describe('Pagos, Reportes y Dashboard separan entradas y confiteria', () => {
  test('ingresos separados, la comida no se atribuye a peliculas, por producto y tasa de adjuncion', async () => {
    const m2 = (await admin.post('/api/admin/movies', { title: 'Pelicula Solo Reportes', genre: 'Drama', duration: 100, rating: '+14', format: ['2D'], language: 'ES', status: 'active', branches: [{ branchId: 1 }] })).json.movie;
    const R = '/api/admin/reports/summary?from=2026-11-12&to=2026-11-12';
    const base = (await admin.get(R)).json;
    const s = await make({}, m2);
    const water = vid('Agua mineral', 'Único'); const combo = vid('Combo pareja', 'Único');
    const o1 = (await buy(await customer(), s, ['A1', 'A2'], { items: [{ variantId: water, qty: 2 }, { variantId: combo, qty: 1 }], pickup: AT })).json.order;   // 40 + 9 + 27.9
    const o2 = (await buy(await customer(), s, ['A3'], {})).json.order;                                                                                           // 20
    const o3 = (await buy(await customer(), s, ['A4'], { items: [{ variantId: water, qty: 1 }], pickup: AT, payment: { method: 'card', simulatedOutcome: 'declined' } })).json.order;
    assert.deepEqual([o1.amount, o1.foodAmount, o2.amount, o3.status], [76.9, 36.9, 20, 'rejected']);
    const r = (await admin.get(R)).json;
    const d = (k) => Math.round((r.totals[k] - base.totals[k]) * 100) / 100;
    assert.deepEqual([d('revenue'), d('ticketRevenue'), d('foodRevenue'), d('ordersWithFood'), d('tickets')], [96.9, 60, 36.9, 1, 3]);
    assert.equal(r.totals.revenue, Math.round((r.totals.ticketRevenue + r.totals.foodRevenue) * 100) / 100);
    const day = r.byDay[0]; assert.equal(day.revenue, Math.round((day.ticketRevenue + day.foodRevenue) * 100) / 100);
    for (const g of [r.byBranch, r.byChannel, r.byPresale]) for (const x of g) assert.equal(x.revenue, Math.round((x.ticketRevenue + x.foodRevenue) * 100) / 100);
    // Por pelicula: solo entradas.
    const mv = r.byMovie.find((x) => x.id === m2.id);
    assert.deepEqual([mv.revenue, mv.ticketRevenue, mv.tickets, mv.orders], [60, 60, 3, 2]);
    assert.equal(r.byMovie.reduce((a, x) => a + x.revenue, 0).toFixed(2), r.totals.ticketRevenue.toFixed(2));
    // Por producto: solo ordenes aprobadas.
    const bp = (rep) => Object.fromEntries(rep.byProduct.map((p) => [p.variantId, p]));
    assert.deepEqual([bp(r)[water].units - (bp(base)[water]?.units ?? 0), bp(r)[combo].units - (bp(base)[combo]?.units ?? 0)], [2, 1]);
    assert.equal(bp(r)[water].name, 'Agua mineral');
    // Pagos: totales y desglose por orden.
    const p = (await admin.get('/api/admin/orders?from=2026-11-12&to=2026-11-12&pageSize=50')).json;
    assert.equal(p.totals.revenue, Math.round((p.totals.ticketRevenue + p.totals.foodRevenue) * 100) / 100);
    const po = p.orders.find((x) => x.code === o1.code);
    assert.deepEqual([po.amount, po.foodAmount, po.ticketAmount], [76.9, 36.9, 40]);
    assert.deepEqual(po.items.map((i) => [i.name, i.qty, i.lineTotal]).sort(), [['Agua mineral', 2, 9], ['Combo pareja', 1, 27.9]].sort());
    // Reembolso: la confiteria reembolsada se informa aparte.
    await james.post(`/api/admin/orders/${o1.code}/refund`, { reason: 'customer_request' });
    const r2 = (await admin.get(R)).json;
    assert.equal(Math.round((r2.totals.refundedFoodAmount - base.totals.refundedFoodAmount) * 100) / 100, 36.9);
    // Dashboard de hoy.
    const dash = (await admin.get('/api/admin/dashboard')).json;
    assert.equal(dash.money.revenue, Math.round((dash.money.ticketRevenue + dash.money.foodRevenue) * 100) / 100);
    assert.ok(dash.money.foodRevenue >= 0);
  });
});
