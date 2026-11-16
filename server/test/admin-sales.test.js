import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { startEnv, regBody, DEMO_PASSWORD } from './helpers.js';
import { hashPassword } from '../auth/crypto.js';

// Ventas reales en el panel: Pagos (ordenes), Reportes (resumen) y Dashboard (hoy en Lima).
// Escenario con totales hechos a mano (ver el bloque "escenario").
const ADMIN_PW = 'clave-admin-test-1';
const O = '/api/admin/orders'; const R = '/api/admin/reports/summary'; const D = '/api/admin/dashboard';
const consoleLines = []; const origConsole = {};
let env; let admin; let adminDemo; let sarah; let emily; let michael; let james; let anna; let c1; let c2;
let n = 500; let S1; let S2; let S3; let S4; let codes = {};
const T_MIDNIGHT_BEFORE = Date.UTC(2026, 10, 13, 4, 59, 0);   // 23:59 del 12/11 en Lima
const T_MIDNIGHT_AFTER = Date.UTC(2026, 10, 13, 5, 1, 0);     // 00:01 del 13/11 en Lima
const NOON_13 = Date.UTC(2026, 10, 13, 17, 0, 0);             // 12:00 del 13/11 en Lima

const login = async (email, password = DEMO_PASSWORD) => { const c = env.client(); const r = await c.post('/api/auth/login', { email, password }); assert.equal(r.status, 200); return c; };
const customer = async () => {
  const i = ++n; const c = env.client();
  const reg = await c.post('/api/auth/register', regBody({ name: `Cliente Numero ${i}`, dni: `7400${String(i).padStart(4, '0')}`, email: `ventas${i}@example.com`, phone: `97400${String(i).padStart(4, '0')}` }));
  assert.equal(reg.status, 201);
  assert.equal((await c.post('/api/auth/verify-phone', { code: reg.json.simulation.code })).status, 200);
  return c;
};
// Cambia el reloj y renueva las sesiones (la inactividad maxima es de 12 horas).
const setClock = async (ms) => {
  env.clock.now = ms;
  admin = await login('admin@cinerama.com', ADMIN_PW); sarah = await login('sarah.mitchell@cinerama.com'); emily = await login('emily.rodriguez@cinerama.com');
  michael = await login('michael.chen@cinerama.com'); james = await login('james.wilson@cinerama.com'); anna = await login('anna.martinez@cinerama.com');
  c1 = await login('ventas501@example.com', regBody().password); c2 = await login('ventas502@example.com', regBody().password);
};
const buy = (c, s, seats, outcome = 'approved') => c.post('/api/orders', { screeningId: s.id, seats, idempotencyKey: crypto.randomUUID(), payment: { method: 'card', simulatedOutcome: outcome } });
const mkScreening = async (movieId, hallId, date, startTime, price) => {
  const r = await admin.post('/api/admin/screenings', { movieId, hallId, date, startTime, language: 'ES', format: '2D', price });
  assert.equal(r.status, 201, JSON.stringify(r.json)); return r.json.screening;
};

before(async () => {
  for (const m of ['log', 'warn', 'error', 'info']) { origConsole[m] = console[m]; console[m] = (...a) => consoleLines.push(a.map(String).join(' ')); }
  env = await startEnv();
  adminDemo = await login('admin@cinerama.com');           // sesion con la contrasena de demostracion
  sarah = await login('sarah.mitchell@cinerama.com'); emily = await login('emily.rodriguez@cinerama.com');
  michael = await login('michael.chen@cinerama.com'); james = await login('james.wilson@cinerama.com'); anna = await login('anna.martinez@cinerama.com');
});
after(async () => { for (const m of Object.keys(origConsole)) console[m] = origConsole[m]; await env.stop(); });

describe('demoGate', () => {
  test('con la contrasena de demostracion: ordenes 403 demo_password; reportes y dashboard (solo agregados) abren', async () => {
    const o = await adminDemo.get(O); assert.equal(o.status, 403); assert.deepEqual(o.json, { error: 'demo_password' });
    assert.equal((await sarah.get(O)).json.error, 'demo_password');
    assert.equal((await adminDemo.get(R)).status, 200);
    assert.equal((await adminDemo.get(D)).status, 200);
  });
});

describe('escenario', () => {
  test('preparar ventas reales', async () => {
    env.db.prepare('UPDATE users SET password_hash = ? WHERE id = 1').run(await hashPassword(ADMIN_PW));
    admin = await login('admin@cinerama.com', ADMIN_PW);
    const mk = await admin.post('/api/admin/movies', { title: 'Pelicula Ventas 4C', genre: 'Drama', duration: 100, rating: '+14', format: ['2D'], language: 'ES', status: 'active', branches: [{ branchId: 1 }, { branchId: 3 }] });
    assert.equal(mk.status, 201, JSON.stringify(mk.json));
    const movieId = mk.json.movie.id;
    S1 = await mkScreening(movieId, 3, '2026-12-14', '10:00', 20);   // sede 1, 150 butacas
    S2 = await mkScreening(movieId, 3, '2026-12-14', '14:00', 10);   // sede 1, se cancela
    S3 = await mkScreening(movieId, 8, '2026-12-15', '10:00', 15);   // sede 3, 130 butacas
    S4 = await mkScreening(movieId, 3, '2026-11-13', '18:00', 12);   // sede 1, HOY (13/11) en Lima
    c1 = await customer(); c2 = await customer();
    await setClock(T_MIDNIGHT_BEFORE);
    const A = await buy(c1, S1, ['A1', 'A2']); assert.equal(A.status, 201);            // 40, 12/11 23:59
    await setClock(T_MIDNIGHT_AFTER);
    const B = await buy(c2, S1, ['B1']); assert.equal(B.status, 201);                  // 20, 13/11 00:01
    const C = await buy(c1, S3, ['A1', 'A2', 'A3']); assert.equal(C.status, 201);      // 45, sede 3
    const Dd = await buy(c2, S3, ['B1', 'B2'], 'declined'); assert.equal(Dd.status, 402); // rechazada 30
    const E = await buy(c1, S2, ['C1', 'C2']); assert.equal(E.status, 201);           // 20, luego reembolsada
    const F = await buy(c2, S4, ['A1']); assert.equal(F.status, 201);                  // 12, funcion de hoy
    codes = { A: A.json.order.code, B: B.json.order.code, C: C.json.order.code, D: Dd.json.order.code, E: E.json.order.code, F: F.json.order.code };
    env.clock.now += 60000;
    const cancel = await admin.post(`/api/admin/screenings/${S2.id}/cancel`, { version: S2.version, confirm: true, reason: 'prueba de ventas' });
    assert.equal(cancel.status, 200, JSON.stringify(cancel.json));
  });

  test('permisos de /orders: admin y soporte, gerente (su sede) si; cajero y operador 403; clientes 403; sin sesion 401', async () => {
    assert.equal((await env.client().get(O)).status, 401);
    assert.equal((await c1.get(O)).status, 403);
    for (const c of [michael, anna]) { const r = await c.get(O); assert.equal(r.status, 403); assert.deepEqual(r.json, { error: 'forbidden' }); }
    for (const c of [admin, sarah, emily, james]) assert.equal((await c.get(O)).status, 200);
  });

  test('totales y filas coinciden con la suma hecha a mano', async () => {
    const r = await admin.get(`${O}?from=2026-11-12&to=2026-11-13`);
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
    // aprobadas A 40 + B 20 + C 45 + F 12 = 117; reembolsada E 20; rechazada D (1); 6 ordenes
    assert.deepEqual(r.json.totals, { revenue: 117, refunded: 20, rejected: 1, transactions: 6 });
    assert.equal(r.json.total, 6);
    const byCode = Object.fromEntries(r.json.orders.map((o) => [o.code, o]));
    assert.equal(byCode[codes.E].status, 'refunded'); assert.equal(byCode[codes.E].refund.reasonCode, 'screening_cancelled');
    assert.equal(byCode[codes.D].status, 'rejected'); assert.deepEqual(byCode[codes.C].seats, ['A1', 'A2', 'A3']);
    assert.equal(byCode[codes.A].emailMasked, 'v***@example.com'); assert.equal(byCode[codes.A].customerName.startsWith('Cliente Numero'), true);
    assert.equal(byCode[codes.A].branch.id, 1); assert.equal(byCode[codes.C].branch.id, 3);
    assert.match(byCode[codes.A].payment.ref, /^SIM-/);
    // la sede 1 por separado: 40 + 20 + 12 aprobadas, 20 reembolsado, 0 rechazadas, 4 ordenes
    const b1 = await admin.get(`${O}?branchId=1`);
    assert.deepEqual(b1.json.totals, { revenue: 72, refunded: 20, rejected: 0, transactions: 4 });
  });

  test('el JSON completo no trae correo completo, celular, DNI, user_id, hashes ni clave de idempotencia', async () => {
    const raw = JSON.stringify((await admin.get(O)).json);
    assert.ok(!/@example\.com/.test(raw.replace(/[a-z]\*\*\*@example\.com/g, '')), 'correo completo');
    assert.ok(!/user_id|userId|"email"|phone|celular|dni|hash|password|idempotency|974\d{6}|7400\d{4}/i.test(raw), raw.slice(0, 600));
  });

  test('gerente y soporte: el servidor fuerza su sede; un branchId ajeno no filtra otra sede', async () => {
    for (const [c, branch, rev] of [[sarah, 1, 72], [james, 1, 72], [emily, 3, 45]]) {
      for (const q of ['', '?branchId=1', '?branchId=3', '?branchId=99']) {
        const r = await c.get(`${O}${q}`);
        assert.equal(r.status, 200, q);
        assert.ok(r.json.orders.every((o) => o.branch.id === branch), `${q} sede ajena`);
        assert.equal(r.json.totals.revenue, rev); assert.equal(r.json.scope.branchId, branch);
      }
    }
    assert.ok(!JSON.stringify((await emily.get(O)).json).includes(codes.A));
  });

  test('filtros: estado, canal, fechas, busqueda por codigo y por nombre', async () => {
    assert.equal((await admin.get(`${O}?status=rejected`)).json.total, 1);
    assert.equal((await admin.get(`${O}?status=approved`)).json.total, 4);
    assert.equal((await admin.get(`${O}?channel=web`)).json.total, 6);
    assert.equal((await admin.get(`${O}?channel=counter`)).json.total, 0);
    // borde de medianoche de Lima: A es del 12/11 (23:59) y el resto del 13/11 (00:01)
    const d12 = await admin.get(`${O}?from=2026-11-12&to=2026-11-12`); assert.deepEqual(d12.json.orders.map((o) => o.code), [codes.A]);
    assert.equal((await admin.get(`${O}?from=2026-11-13&to=2026-11-13`)).json.total, 5);
    assert.equal((await admin.get(`${O}?q=${codes.C}`)).json.orders[0].code, codes.C);
    assert.equal((await admin.get(`${O}?q=${codes.C.toLowerCase()}`)).json.total, 1);
    assert.equal((await admin.get(`${O}?q=zzz-no-existe`)).json.total, 0);
    const name = (await admin.get(`${O}?q=${encodeURIComponent('cliente numero 502')}`)).json;
    assert.ok(name.total > 0 && name.orders.every((o) => o.customerName === 'Cliente Numero 502'));
    assert.equal((await admin.get(`${O}?q=${encodeURIComponent('%')}`)).json.total, 0, 'el comodin se escapa');
  });

  test('paginado y validacion', async () => {
    const p1 = await admin.get(`${O}?pageSize=4&page=1`); const p2 = await admin.get(`${O}?pageSize=4&page=2`);
    assert.equal(p1.json.pages, 2); assert.equal(p1.json.orders.length, 4); assert.equal(p2.json.orders.length, 2);
    assert.deepEqual(p1.json.totals, p2.json.totals, 'los totales son de toda la consulta, no de la pagina');
    assert.equal(new Set([...p1.json.orders, ...p2.json.orders].map((o) => o.code)).size, 6);
    for (const q of ['status=zzz', 'channel=x', 'from=2026-13-40', 'from=2026-11-13&to=2026-11-01', 'page=0', 'pageSize=500', 'branchId=abc']) {
      assert.equal((await admin.get(`${O}?${q}`)).status, 400, q);
    }
  });
});

describe('reportes', () => {
  test('permisos: admin global, gerente su sede; soporte, cajero, operador y clientes 403', async () => {
    assert.equal((await env.client().get(R)).status, 401);
    for (const c of [james, michael, anna, c1]) assert.equal((await c.get(R)).status, 403);
    for (const c of [admin, sarah, emily]) assert.equal((await c.get(R)).status, 200);
  });

  test('ingresos por dia (con ceros), sede, pelicula, canal y preventa suman a mano', async () => {
    const r = await admin.get(`${R}?from=2026-11-11&to=2026-11-14`);
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(r.json.byDay, [
      { date: '2026-11-11', revenue: 0, orders: 0, tickets: 0 },
      { date: '2026-11-12', revenue: 40, orders: 1, tickets: 2 },                   // A, 23:59 Lima
      { date: '2026-11-13', revenue: 77, orders: 3, tickets: 5 },                   // B 20 + C 45 + F 12
      { date: '2026-11-14', revenue: 0, orders: 0, tickets: 0 },
    ]);
    assert.deepEqual(r.json.totals, { revenue: 117, tickets: 7, transactions: 6, approved: 4, rejected: 1, refunded: 1, refundedAmount: 20, cancelled: 0, pending: 0, approvalRate: 83.3 });
    assert.deepEqual(r.json.byBranch.map((b) => [b.id, b.revenue, b.tickets]), [[1, 72, 4], [3, 45, 3]]);
    assert.deepEqual(r.json.byMovie.map((m) => [m.title, m.revenue, m.tickets]), [['Pelicula Ventas 4C', 117, 7]]);
    assert.deepEqual(r.json.byChannel, [{ channel: 'web', orders: 4, revenue: 117, tickets: 7 }]);
    assert.deepEqual(r.json.byPresale, [{ presale: false, orders: 4, revenue: 117, tickets: 7 }]);
    assert.equal(r.json.range.days, 4);
  });

  test('ocupacion por funcion y por sala: vendidas / capacidad (la cancelada no cuenta)', async () => {
    const r = await admin.get(`${R}?from=2026-11-13&to=2026-12-31`);
    const mine = r.json.byScreening.filter((s) => s.movieTitle === 'Pelicula Ventas 4C');
    assert.equal(mine.length, 3, 'S1, S3 y S4; S2 esta cancelada');
    const by = Object.fromEntries(mine.map((s) => [s.id, s]));
    assert.deepEqual([by[S1.id].sold, by[S1.id].capacity, by[S1.id].occupancy], [3, 150, 2]);
    assert.deepEqual([by[S3.id].sold, by[S3.id].capacity, by[S3.id].occupancy], [3, 130, 2.3]);
    assert.deepEqual([by[S4.id].sold, by[S4.id].capacity], [1, 150]);
    assert.equal(r.json.occupancy.sold, 7);
    const hall3 = r.json.byHall.find((h) => h.hallId === 3); const hall8 = r.json.byHall.find((h) => h.hallId === 8);
    assert.equal(hall3.sold, 4); assert.ok(hall3.capacity >= 300 && hall3.capacity % 150 === 0);
    assert.equal(hall8.sold, 3); assert.ok(hall8.capacity >= 130 && hall8.capacity % 130 === 0);
  });

  test('gerente: solo su sede; branchId ajeno se ignora', async () => {
    const r = await sarah.get(`${R}?from=2026-11-11&to=2026-11-14&branchId=3`);
    assert.equal(r.json.scope.branchId, 1);
    assert.equal(r.json.totals.revenue, 72); assert.deepEqual(r.json.byBranch.map((b) => b.id), [1]);
    const e = await emily.get(`${R}?from=2026-11-11&to=2026-11-14`);
    assert.equal(e.json.totals.revenue, 45); assert.equal(e.json.totals.rejected, 1);
    assert.deepEqual(e.json.byDay.map((d) => d.revenue), [0, 0, 45, 0]);
  });

  test('rango invalido, demasiado largo; sin ventas devuelve ceros', async () => {
    for (const q of ['from=2026-11-13&to=2026-11-01', 'from=abc', 'to=2026-02-31', 'from=2026-01-01&to=2026-12-31', 'branchId=0']) assert.equal((await admin.get(`${R}?${q}`)).status, 400, q);
    const max = await admin.get(`${R}?from=2026-09-01&to=2026-11-30`); assert.equal(max.status, 200); assert.equal(max.json.byDay.length, 91);
    assert.equal((await admin.get(`${R}?from=2026-01-01&to=2026-04-03`)).status, 400, '93 dias');
    const empty = await admin.get(`${R}?from=2026-01-01&to=2026-01-03`);
    assert.deepEqual(empty.json.byDay.map((d) => d.revenue), [0, 0, 0]);
    assert.equal(empty.json.totals.approvalRate, 0); assert.equal(empty.json.totals.transactions, 0);
  });

  test('sin fechas: ultimos 7 dias hasta hoy en Lima', async () => {
    await setClock(Date.UTC(2026, 10, 14, 4, 30, 0)); // 23:30 del 13/11 en Lima (UTC ya es 14)
    const r = await admin.get(R);
    assert.equal(r.json.range.to, '2026-11-13'); assert.equal(r.json.range.from, '2026-11-07'); assert.equal(r.json.range.days, 7);
  });
});

describe('dashboard', () => {
  test('indicadores de hoy en Lima: admin central', async () => {
    await setClock(NOON_13);
    const r = await admin.get(D);
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.json.today, '2026-11-13');
    // hoy (13/11): B 20 + C 45 + F 12 aprobadas, 5 entradas; E (reembolsada) y A (12/11) no cuentan; 1 rechazada
    assert.deepEqual(r.json.money, { revenue: 77, tickets: 5, rejected: 1 });
    const today = r.json.screenings.list.filter((s) => s.movieTitle === 'Pelicula Ventas 4C');
    assert.equal(today.length, 1); assert.deepEqual([today[0].sold, today[0].capacity, today[0].startTime], [1, 150, '18:00']);
    assert.ok(r.json.screenings.upcoming.every((s) => s.date > '2026-11-13') && !r.json.screenings.upcoming.some((s) => s.id === S4.id), 'proximas = de manana en adelante');
    assert.ok(r.json.screenings.upcoming.length <= 6);
    assert.ok(Array.isArray(r.json.activity) && r.json.activity.length > 0);
    assert.ok(r.json.activity.some((a) => a.action === 'screening.cancel'));
  });

  test('gerente: su sede; cajero y operador solo funciones y ocupacion, sin dinero ni actividad', async () => {
    const s = await sarah.get(D);
    assert.deepEqual(s.json.money, { revenue: 32, tickets: 2, rejected: 0 });   // B 20 + F 12 (sede 1)
    assert.ok(s.json.activity.every((a) => a.branchId === 1));
    const a3 = await admin.get(`${D}?branchId=3`); assert.deepEqual(a3.json.money, { revenue: 45, tickets: 3, rejected: 1 }); assert.equal(a3.json.scope.branchId, 3);
    assert.equal((await sarah.get(`${D}?branchId=3`)).json.scope.branchId, 1);
    assert.equal((await admin.get(`${D}?branchId=x`)).status, 400);
    const e = await emily.get(D); assert.deepEqual(e.json.money, { revenue: 45, tickets: 3, rejected: 1 });
    for (const c of [michael, anna, james]) {
      const r = await c.get(D); assert.equal(r.status, 200);
      assert.equal(r.json.money, null); assert.equal(r.json.activity, null);
      assert.ok(!/revenue|amount/.test(JSON.stringify(r.json)));
    }
    const m = await michael.get(D); assert.equal(m.json.scope.branchId, 1);
    assert.ok(m.json.screenings.list.every((x) => x.branchName === env.db.prepare('SELECT name FROM branches WHERE id = 1').get().name));
    assert.equal((await env.client().get(D)).status, 401); assert.equal((await c1.get(D)).status, 403);
  });

  test('borde de medianoche de Lima en el dashboard', async () => {
    await setClock(T_MIDNIGHT_BEFORE); // 23:59 del 12/11 en Lima: hoy = 12/11
    const r = await admin.get(D);
    assert.equal(r.json.today, '2026-11-12'); assert.deepEqual(r.json.money, { revenue: 40, tickets: 2, rejected: 0 });
    await setClock(T_MIDNIGHT_AFTER);
    assert.equal((await admin.get(D)).json.today, '2026-11-13');
  });
});

describe('sin datos personales en consola ni en audit_log', () => {
  test('ni codigos de orden, ni nombres, ni correos', () => {
    const logs = consoleLines.join('\n') + env.logs.join('\n');
    const audit = JSON.stringify(env.db.prepare('SELECT * FROM audit_log').all());
    for (const text of [logs, audit]) {
      for (const code of Object.values(codes)) assert.ok(!text.includes(code), 'codigo de orden');
      assert.ok(!/Cliente Numero|@example\.com/.test(text));
    }
  });
});
