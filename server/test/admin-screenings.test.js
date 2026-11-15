import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, regBody, DEMO_PASSWORD } from './helpers.js';
import { createRules } from '../admin/screeningRules.js';
import { CLEANING_MINUTES, MIN_LEAD_MINUTES, START_STEP_MINUTES } from '../../src/shared/scheduling.js';

let env; let admin; let manager; let other; let cashier; let customer; let movie; let movie2D;
const D = '2026-12-10';      // dia sin funciones de ejemplo
const D2 = '2026-12-11';
const NEWM = { title: 'Peli de programacion', genre: 'Drama', duration: 100, rating: '+14', format: ['2D', '3D'], language: 'ES', status: 'active' };

const login = async (email) => { const c = env.client(); assert.equal((await c.post('/api/auth/login', { email, password: DEMO_PASSWORD })).status, 200); return c; };
const post = (c, body) => c.post('/api/admin/screenings', body);
const patch = (c, id, body) => c.call('PATCH', `/api/admin/screenings/${id}`, body);
const cancel = (c, id, body) => c.post(`/api/admin/screenings/${id}/cancel`, body);
const base = (over = {}) => ({ movieId: movie.id, hallId: 1, date: D, startTime: '15:00', language: 'ES', format: '3D', ...over });
const make = async (over) => { const r = await post(admin, base(over)); assert.equal(r.status, 201, JSON.stringify(r.json)); return r.json.screening; };
const sell = (id, n = 5) => env.db.prepare('UPDATE screenings SET booked_seats = ? WHERE id = ?').run(n, id);

before(async () => {
  env = await startEnv();
  admin = await login('admin@cinerama.com');
  manager = await login('sarah.mitchell@cinerama.com');   // gerente sede 1
  other = await login('emily.rodriguez@cinerama.com');    // gerente sede 3
  cashier = await login('michael.chen@cinerama.com');     // cajero sede 1
  customer = env.client();
  const reg = await customer.post('/api/auth/register', regBody({ dni: '60000021', email: 'cli-scr@example.com', phone: '991111133' }));
  await customer.post('/api/auth/verify-phone', { code: reg.json.simulation.code });
  movie = (await admin.post('/api/admin/movies', { ...NEWM, branches: [{ branchId: 1 }, { branchId: 2 }] })).json.movie;
  movie2D = (await admin.post('/api/admin/movies', { ...NEWM, title: 'Solo 2D', format: ['2D'], branches: [{ branchId: 1 }] })).json.movie;
});
after(() => env.stop());

describe('permisos', () => {
  test('401 sin sesion y 403 a clientes en todas las rutas', async () => {
    for (const c of [env.client(), customer]) {
      const want = c === customer ? 403 : 401;
      assert.equal((await c.get('/api/admin/screenings')).status, want);
      assert.equal((await post(c, base())).status, want);
      assert.equal((await patch(c, 1, { version: 1 })).status, want);
      assert.equal((await cancel(c, 1, {})).status, want);
      assert.equal((await c.call('PATCH', '/api/admin/halls/1', { status: 'maintenance' })).status, want);
    }
  });
  test('cajero (y soporte/operador): lectura de su sede; nada de escritura', async () => {
    const l = await cashier.get('/api/admin/screenings');
    assert.equal(l.status, 200);
    assert.ok(l.json.screenings.length > 0 && l.json.screenings.every((s) => s.branchId === 1));
    assert.equal((await post(cashier, base())).status, 403);
    assert.equal((await patch(cashier, 1, { version: 1, price: 20 })).status, 403);
    assert.equal((await cancel(cashier, 1, { version: 1, confirm: true, reason: 'x' })).status, 403);
    assert.equal((await cashier.call('PATCH', '/api/admin/halls/1', { status: 'maintenance' })).status, 403);
  });
  test('gerente: programa en su sede, 404 en otra (sala o funcion); el administrador, en cualquiera', async () => {
    const mine = await post(manager, base({ startTime: '10:00' }));
    assert.equal(mine.status, 201, JSON.stringify(mine.json));
    const sede2 = await post(manager, base({ hallId: 6, format: '2D' }));    // sala de la sede 2
    assert.equal(sede2.status, 404);
    assert.equal(sede2.json.field, 'hallId');
    const adm = await post(admin, base({ hallId: 6, format: '2D' }));
    assert.equal(adm.status, 201);
    // funcion de otra sede: GET/PATCH/cancelar -> 404 para el gerente
    const sid = adm.json.screening.id;
    assert.equal((await manager.get(`/api/admin/screenings/${sid}`)).status, 404);
    assert.equal((await patch(manager, sid, { version: 1, price: 30 })).status, 404);
    assert.equal((await cancel(manager, sid, { version: 1, confirm: true, reason: 'x' })).status, 404);
    assert.equal((await other.get(`/api/admin/screenings/${mine.json.screening.id}`)).status, 404);
    // mover una funcion propia a una sala de otra sede -> 404
    assert.equal((await patch(manager, mine.json.screening.id, { version: 1, hallId: 6 })).status, 404);
    // la lista del gerente no trae otras sedes aunque pida otra
    const list = await manager.get('/api/admin/screenings?branchId=2');
    assert.ok(list.json.screenings.every((s) => s.branchId === 1));
  });
});

describe('validacion de campos', () => {
  test('codigos por campo', async () => {
    const r = await post(admin, { movieId: 'x', hallId: 0, date: '2026-13-40', startTime: '25:00', language: 'FR', format: '4D', price: -1, status: 'active' });
    assert.equal(r.status, 400);
    assert.deepEqual(r.json.errors, { movieId: 'invalid', hallId: 'invalid', date: 'invalid_date', startTime: 'invalid_time', language: 'invalid_option', format: 'invalid_option', price: 'out_of_range', status: 'invalid_option' });
    assert.equal((await post(admin, base({ startTime: '15:03' }))).json.errors.startTime, 'invalid_step');
    assert.equal(START_STEP_MINUTES, 5);
    assert.equal((await post(admin, base({ price: 12.345 }))).json.errors.price, 'invalid_decimals');
    assert.equal((await post(admin, base({ price: 501 }))).json.errors.price, 'out_of_range');
    assert.equal((await post(admin, base({ price: 0 }))).json.errors.price, 'out_of_range');
    assert.equal((await post(admin, {})).status, 400);
  });
  test('el servidor deriva sede, capacidad, fin y precio; ignora lo que el cliente intente fijar', async () => {
    const r = await post(admin, { ...base({ startTime: '09:00', date: D2 }), branchId: 9, totalSeats: 1, endTime: '23:59', bookedSeats: 50, version: 7, id: 99 });
    assert.equal(r.status, 201);
    const s = r.json.screening;
    assert.equal(s.branchId, 1); assert.equal(s.totalSeats, 280); assert.equal(s.endTime, '10:40');
    assert.equal(s.price, 35); // precio base de la sala 1
    assert.equal(s.bookedSeats, 0); assert.equal(s.version, 1); assert.equal(s.status, 'scheduled'); assert.notEqual(s.id, 99);
    const custom = await post(admin, base({ startTime: '11:00', date: D2, price: 22.5 }));
    assert.equal(custom.json.screening.price, 22.5);
    const draft = await post(admin, base({ startTime: '14:00', date: D2, status: 'draft' }));
    assert.equal(draft.json.screening.status, 'draft');
  });
});

describe('reglas de negocio', () => {
  test('pelicula: estados programables y habilitacion en la sede', async () => {
    const mk = async (extra) => (await admin.post('/api/admin/movies', { ...NEWM, title: 'Regla ' + Math.random(), branches: [{ branchId: 1 }], ...extra })).json.movie;
    const draft = await mk({ status: 'draft' });
    const arch = await mk({ status: 'archived' });
    const soon = await mk({ status: 'upcoming' });
    const presale = await mk({ status: 'upcoming', presale: true, releaseDate: '2026-12-05' });
    const noSede = (await admin.post('/api/admin/movies', { ...NEWM, title: 'Sin sede', branches: [{ branchId: 2 }] })).json.movie;
    const t = (m, extra) => post(admin, base({ movieId: m.id, startTime: '20:00', date: '2026-12-12', ...extra }));
    for (const m of [draft, arch, soon]) { const r = await t(m); assert.equal(r.status, 409); assert.equal(r.json.error, 'movie_inactive'); }
    assert.equal((await t(presale)).status, 201, 'upcoming con preventa SI se puede programar');
    assert.equal((await t(noSede)).json.error, 'movie_not_enabled');
    assert.equal((await t({ id: 99999 })).status, 404);
    // sede inactiva
    env.db.prepare(`UPDATE branches SET status = 'maintenance' WHERE id = 2`).run();
    assert.equal((await post(admin, base({ hallId: 6, startTime: '08:00' }))).json.error, 'branch_inactive');
    env.db.prepare(`UPDATE branches SET status = 'active' WHERE id = 2`).run();
    // deshabilitada en la sede
    await admin.call('PUT', `/api/admin/movies/${noSede.id}/branches/1`, { active: false });
    assert.equal((await t(noSede)).json.error, 'movie_not_enabled');
  });

  test('ventana de fechas de la pelicula y de la pelicula en la sede', async () => {
    const m = (await admin.post('/api/admin/movies', { ...NEWM, title: 'Ventana', releaseDate: '2026-12-15', endDate: '2026-12-20', branches: [{ branchId: 1 }] })).json.movie;
    const t = (date) => post(admin, base({ movieId: m.id, date, startTime: '09:00' }));
    const early = await t('2026-12-14');
    assert.equal(early.json.error, 'outside_window'); assert.equal(early.json.from, '2026-12-15'); assert.equal(early.json.to, '2026-12-20');
    assert.equal((await t('2026-12-21')).json.error, 'outside_window');
    assert.equal((await t('2026-12-15')).status, 201);
    assert.equal((await t('2026-12-20')).status, 201);
    // la ventana de la sede acota mas
    await admin.call('PUT', `/api/admin/movies/${m.id}/branches/1`, { startDate: '2026-12-17', endDate: '2026-12-18' });
    assert.equal((await t('2026-12-16')).json.error, 'outside_window');
    assert.equal((await t('2026-12-19')).json.error, 'outside_window');
    assert.equal((await t('2026-12-17')).status, 201);
  });

  test('no en el pasado: anticipacion minima de 30 minutos (hora de Lima)', async () => {
    // el reloj de las pruebas marca 10:00 del 2026-11-12 en Lima
    assert.equal(MIN_LEAD_MINUTES, 30);
    const today = '2026-11-12';
    const r1 = await post(admin, base({ date: today, startTime: '10:25' }));
    assert.equal(r1.status, 409); assert.equal(r1.json.error, 'in_the_past'); assert.equal(r1.json.minLeadMinutes, 30);
    assert.equal((await post(admin, base({ date: '2026-11-11', startTime: '20:00' }))).json.error, 'in_the_past');
    assert.equal((await post(admin, base({ date: today, startTime: '09:00' }))).json.error, 'in_the_past');
    assert.equal((await post(admin, base({ date: today, startTime: '10:30', hallId: 3, format: '2D' }))).status, 201, 'justo 30 min antes: permitido');
  });

  test('sala en mantenimiento y formato compatible con pelicula, sede y sala', async () => {
    assert.equal((await post(admin, base({ hallId: 4, format: '2D' }))).json.error, 'hall_in_maintenance');
    const f = (over) => post(admin, base({ date: '2026-12-13', ...over }));
    const h2d = await f({ hallId: 3, format: '3D', startTime: '09:00' });
    assert.equal(h2d.json.error, 'format_not_supported_by_hall');
    assert.equal((await f({ hallId: 1, format: '2D', startTime: '09:00' })).status, 201, 'una sala 3D proyecta 2D');
    assert.equal((await f({ hallId: 1, format: '3D', startTime: '12:00' })).status, 201);
    const m2d = await f({ movieId: movie2D.id, hallId: 1, format: '3D', startTime: '16:00' });
    assert.equal(m2d.json.error, 'format_not_in_movie');
    // formatos de la pelicula en la sede
    await admin.call('PUT', `/api/admin/movies/${movie.id}/branches/2`, { formats: ['2D'] });
    const hall7 = await f({ hallId: 7, format: '3D', startTime: '09:00' });   // sala 3D de la sede 2
    assert.equal(hall7.json.error, 'format_not_in_branch');
    assert.equal((await f({ hallId: 7, format: '2D', startTime: '09:00' })).status, 201);
  });
});

describe('solapamiento en la misma sala', () => {
  const day = '2026-12-20';
  const at = (startTime, over = {}) => post(admin, base({ date: day, hallId: 2, startTime, ...over }));   // sala 2: 3D, 180 butacas
  test('limpieza de 15 minutos: borde, contenida, antes, canceladas y otra sala', async () => {
    assert.equal(CLEANING_MINUTES, 15);
    const a = await at('15:00');                       // dura 100 min: 15:00-16:40, sala ocupada hasta 16:55
    assert.equal(a.status, 201); assert.equal(a.json.screening.endTime, '16:40');
    const err = await at('16:40');                    // tocandose sin limpieza
    assert.equal(err.status, 409); assert.equal(err.json.error, 'hall_overlap'); assert.equal(err.json.field, 'startTime');
    assert.deepEqual(err.json.conflict, { id: a.json.screening.id, movieTitle: 'Peli de programacion', date: day, startTime: '15:00', endTime: '16:40', hallName: 'Sala 2' });
    assert.equal((await at('16:50')).json.error, 'hall_overlap', 'faltan 5 minutos de limpieza');
    assert.equal((await at('16:55')).status, 201, 'justo con la limpieza completa');
    assert.equal((await at('15:30')).json.error, 'hall_overlap', 'contenida en otra');
    assert.equal((await at('14:00')).json.error, 'hall_overlap', 'contiene a otra');
    assert.equal((await at('13:10')).json.error, 'hall_overlap', 'termina 14:50 + 15 > 15:00');
    assert.equal((await at('13:05')).status, 201, 'termina 14:45 + 15 = 15:00 exacto');
    // otra sala si
    assert.equal((await at('15:00', { hallId: 1 })).status, 201);
    // una cancelada no bloquea
    const c = await at('19:00'); assert.equal(c.status, 201);
    assert.equal((await at('19:30')).json.error, 'hall_overlap');
    assert.equal((await cancel(admin, c.json.screening.id, { version: 1, confirm: true, reason: 'prueba' })).status, 200);
    assert.equal((await at('19:30')).status, 201);
  });
  test('cruce de medianoche, hacia delante y hacia atras', async () => {
    const d1 = '2026-12-22'; const d2 = '2026-12-23';
    const late = await post(admin, base({ date: d1, hallId: 2, startTime: '22:30' }));      // termina 00:10 del dia siguiente
    assert.equal(late.status, 201); assert.equal(late.json.screening.endTime, '00:10');
    const early = await post(admin, base({ date: d2, hallId: 2, startTime: '00:20' }));      // dia siguiente, antes de las 00:25
    assert.equal(early.json.error, 'hall_overlap');
    assert.equal(early.json.conflict.date, d1);
    assert.equal((await post(admin, base({ date: d2, hallId: 2, startTime: '00:25' }))).status, 201);
    // hacia atras: una nueva que cruza medianoche y choca con una del dia siguiente
    const next = await post(admin, base({ date: '2026-12-25', hallId: 2, startTime: '00:10' }));
    assert.equal(next.status, 201);
    assert.equal((await post(admin, base({ date: '2026-12-24', hallId: 2, startTime: '22:40' }))).json.error, 'hall_overlap');
    assert.equal((await post(admin, base({ date: '2026-12-24', hallId: 2, startTime: '22:15' }))).status, 201);
  });
  test('la propia funcion al editar no cuenta como choque; moverla a un choque si', async () => {
    const day2 = '2026-12-27';
    const a = (await post(admin, base({ date: day2, hallId: 2, startTime: '10:00' }))).json.screening;
    const b = (await post(admin, base({ date: day2, hallId: 2, startTime: '14:00' }))).json.screening;
    const shift = await patch(admin, a.id, { version: 1, startTime: '10:15' });
    assert.equal(shift.status, 200); assert.equal(shift.json.screening.endTime, '11:55');
    const clash = await patch(admin, b.id, { version: 1, startTime: '12:00' });
    assert.equal(clash.status, 409); assert.equal(clash.json.error, 'hall_overlap'); assert.equal(clash.json.conflict.id, a.id);
    assert.equal((await patch(admin, b.id, { version: 1, startTime: '12:10' })).status, 200);
  });
  test('dos creaciones simultaneas en la misma sala: una gana, la otra recibe el choque', async () => {
    const rs = await Promise.all([post(admin, base({ date: '2026-12-28', hallId: 2, startTime: '18:00' })), post(manager, base({ date: '2026-12-28', hallId: 2, startTime: '18:30' }))]);
    assert.deepEqual(rs.map((r) => r.status).sort(), [201, 409]);
    assert.equal(rs.find((r) => r.status === 409).json.error, 'hall_overlap');
    assert.equal(env.db.prepare(`SELECT COUNT(*) c FROM screenings WHERE hall_id = 2 AND starts_on = '2026-12-28'`).get().c, 1);
  });
});

describe('editar, ventas y cancelar', () => {
  test('stale: version vieja -> 409 con la funcion actual; sin version -> 400', async () => {
    const s = await make({ date: '2027-01-05' });
    assert.equal((await patch(admin, s.id, { price: 30 })).json.errors.version, 'required');
    const a = await patch(admin, s.id, { version: 1, price: 30 });
    assert.equal(a.status, 200); assert.equal(a.json.screening.version, 2);
    const b = await patch(admin, s.id, { version: 1, price: 40 });
    assert.equal(b.status, 409); assert.equal(b.json.error, 'stale'); assert.equal(b.json.current.price, 30);
    assert.equal((await cancel(admin, s.id, { version: 1, confirm: true, reason: 'x' })).json.error, 'stale');
    assert.equal((await patch(admin, 99999, { version: 1 })).status, 404);
    const [x, y] = await Promise.all([patch(admin, s.id, { version: 2, price: 31 }), patch(admin, s.id, { version: 2, price: 32 })]);
    assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  });

  test('con entradas vendidas solo se cambian precio y estado: cada campo bloqueado responde has_sales', async () => {
    const s = await make({ date: '2027-01-06', startTime: '12:00' });
    sell(s.id, 5);
    const full = (over) => ({ version: 1, movieId: s.movieId, hallId: s.hallId, date: s.date, startTime: s.startTime, language: s.language, format: s.format, price: s.price, status: 'scheduled', ...over });
    const attempts = { movieId: movie2D.id, hallId: 3, date: '2027-01-07', startTime: '13:00', language: 'EN', format: '2D' };
    for (const [k, v] of Object.entries(attempts)) {
      const r = await patch(admin, s.id, full({ [k]: v }));
      assert.equal(r.status, 409, k); assert.equal(r.json.error, 'has_sales'); assert.deepEqual(r.json.fields, [k]);
    }
    assert.equal((await patch(admin, s.id, full({ status: 'draft' }))).json.error, 'has_sales');
    // reenviar el formulario completo con lo mismo + precio nuevo: permitido
    const ok = await patch(admin, s.id, full({ price: 39.9 }));
    assert.equal(ok.status, 200); assert.equal(ok.json.screening.price, 39.9); assert.equal(ok.json.screening.hasSales, true);
  });

  test('butacas activas en order_seats tambien cuentan como venta', async () => {
    const s = await make({ date: '2027-01-08', startTime: '12:00' });
    env.db.prepare(`INSERT INTO orders (id,screening_id,branch_id,customer_name,email,amount,method,status,created_at) VALUES ('T-1',?,?,'x','x@x.com',10,'cash','approved','2026-11-12 10:00')`).run(s.id, s.branchId);
    env.db.prepare(`INSERT INTO order_seats (order_id,screening_id,seat,active) VALUES ('T-1',?,'A1',1)`).run(s.id);
    assert.equal(s.bookedSeats, 0);
    const r = await patch(admin, s.id, { version: 1, startTime: '13:00' });
    assert.equal(r.json.error, 'has_sales');
    env.db.prepare(`UPDATE order_seats SET active = 0 WHERE order_id = 'T-1'`).run();
    assert.equal((await patch(admin, s.id, { version: 1, startTime: '13:00' })).status, 200);
  });

  test('una funcion de datos viejos que ya incumple se muestra y solo se valida lo que se cambia', async () => {
    const a = await make({ date: '2027-01-09', hallId: 2, startTime: '10:00' });
    const b = await make({ date: '2027-01-09', hallId: 2, startTime: '14:00' });
    env.db.prepare('UPDATE screenings SET start_time = ? WHERE id = ?').run('10:30', b.id);   // fuerza un solape (como en una base antigua)
    env.db.prepare('UPDATE screenings SET start_time = ?, end_time = ? WHERE id = ?').run('14:00', '14:00', b.id);
    env.db.prepare('UPDATE screenings SET start_time = ? WHERE id = ?').run('10:30', b.id);
    const seen = (await admin.get(`/api/admin/screenings/${b.id}`)).json.screening;
    assert.equal(seen.startTime, '10:30');
    assert.equal((await patch(admin, b.id, { version: 1, price: 21 })).status, 200, 'solo precio: no revalida');
    const t = await patch(admin, b.id, { version: 2, startTime: '10:35' });
    assert.equal(t.json.error, 'hall_overlap');
    assert.ok(a.id);
  });

  test('cancelar: exige confirmacion y motivo; nunca borra; con ventas avisa de reembolsos; dos veces -> 409', async () => {
    const s = await make({ date: '2027-01-10', startTime: '12:00' });
    assert.deepEqual((await cancel(admin, s.id, { version: 1 })).json.errors, { confirm: 'required', reason: 'required' });
    assert.equal((await cancel(admin, s.id, { version: 1, confirm: true, reason: '   ' })).json.errors.reason, 'required');
    assert.equal((await cancel(admin, s.id, { version: 1, confirm: 'yes', reason: 'x' })).json.errors.confirm, 'required');
    assert.equal((await cancel(admin, s.id, { version: 1, confirm: true, reason: 'x'.repeat(301) })).json.errors.reason, 'too_long');
    const ok = await cancel(admin, s.id, { version: 1, confirm: true, reason: 'Falla del proyector' });
    assert.equal(ok.status, 200); assert.equal(ok.json.screening.status, 'cancelled'); assert.equal(ok.json.refundsPending, false);
    assert.equal(env.db.prepare('SELECT status, cancel_reason FROM screenings WHERE id = ?').get(s.id).cancel_reason, 'Falla del proyector');
    const again = await cancel(admin, s.id, { version: 2, confirm: true, reason: 'otra vez' });
    assert.equal(again.status, 409); assert.equal(again.json.error, 'already_cancelled');
    assert.equal((await patch(admin, s.id, { version: 2, price: 10 })).json.error, 'not_editable');
    // con ventas
    const sold = await make({ date: '2027-01-10', startTime: '15:00' });
    sell(sold.id, 12);
    const r = await cancel(manager, sold.id, { version: 1, confirm: true, reason: 'Sala inundada' });
    assert.equal(r.status, 200); assert.equal(r.json.refundsPending, true); assert.equal(r.json.soldSeats, 12);
    assert.equal(env.db.prepare('SELECT COUNT(*) c FROM screenings WHERE id = ?').get(sold.id).c, 1, 'no se borra');
    const audit = env.db.prepare(`SELECT detail_json FROM audit_log WHERE action = 'screening.cancel' AND entity_id = ?`).get(sold.id);
    assert.ok(!/inundada|proyector/i.test(audit.detail_json));
  });

  test('GET con filtros', async () => {
    const all = (await admin.get('/api/admin/screenings')).json.screenings;
    const f = (qs) => admin.get('/api/admin/screenings?' + qs);
    assert.ok((await f('hallId=2')).json.screenings.every((s) => s.hallId === 2));
    assert.ok((await f('branchId=2')).json.screenings.every((s) => s.branchId === 2));
    const rng = (await f('from=2026-12-20&to=2026-12-22')).json.screenings;
    assert.ok(rng.length > 0 && rng.every((s) => s.date >= '2026-12-20' && s.date <= '2026-12-22'));
    assert.ok((await f('status=cancelled')).json.screenings.every((s) => s.status === 'cancelled'));
    assert.ok((await f(`movieId=${movie.id}`)).json.screenings.length < all.length);
    assert.equal((await f('from=hoy')).status, 400);
    assert.equal((await f('status=otro')).status, 400);
    assert.equal((await f('hallId=abc')).status, 400);
  });
});

describe('mantenimiento de salas', () => {
  test('permisos, alcance, funciones futuras y programacion bloqueada', async () => {
    assert.equal((await manager.call('PATCH', '/api/admin/halls/6', { status: 'maintenance' })).status, 404);   // sala de la sede 2
    assert.equal((await manager.call('PATCH', '/api/admin/halls/3', { status: 'raro' })).status, 400);
    // la sala 3 ya tiene funciones futuras (creadas arriba): 409 con la lista
    await make({ hallId: 3, format: '2D', date: '2027-02-01', startTime: '10:00' });
    const blocked = await manager.call('PATCH', '/api/admin/halls/3', { status: 'maintenance' });
    assert.equal(blocked.status, 409); assert.equal(blocked.json.error, 'has_future_screenings'); assert.ok(blocked.json.count >= 1 && blocked.json.screenings[0].date);
    // sala sin funciones futuras (la 4 estaba en mantenimiento): el gerente la pone, la quita y la vuelve a poner
    assert.equal((await admin.call('PATCH', '/api/admin/halls/4', { status: 'active' })).json.hall.status, 'active');
    const ok = await manager.call('PATCH', '/api/admin/halls/4', { status: 'maintenance' });
    assert.equal(ok.status, 200); assert.equal(ok.json.hall.status, 'maintenance');
    const blockedPost = await post(admin, base({ hallId: 4, format: '2D', date: '2027-02-02' }));
    assert.equal(blockedPost.status, 409); assert.equal(blockedPost.json.error, 'hall_in_maintenance');
    assert.equal((await env.client().get('/api/halls')).json.find((h) => h.id === 4).status, 'maintenance');
    assert.equal((await admin.call('PATCH', '/api/admin/halls/4', { status: 'active' })).json.hall.status, 'active');
    assert.equal((await post(admin, base({ hallId: 4, format: '2D', date: '2027-02-02' }))).status, 201);
    assert.equal((await admin.call('PATCH', '/api/admin/halls/4', { status: 'maintenance' })).status, 409, 'ahora tiene una funcion futura');
    const h4s = env.db.prepare(`SELECT id, version FROM screenings WHERE hall_id = 4`).all();
    for (const x of h4s) await cancel(admin, x.id, { version: x.version, confirm: true, reason: 'x' });
    assert.equal((await admin.call('PATCH', '/api/admin/halls/4', { status: 'maintenance' })).status, 200, 'las canceladas no bloquean');
    // el administrador central puede en cualquier sede; las canceladas no bloquean
    const h9 = await admin.call('PATCH', '/api/admin/halls/9', { status: 'active' });   // sede 4, sala en mantenimiento de la semilla
    assert.equal(h9.status, 200);
    assert.ok(env.db.prepare(`SELECT COUNT(*) c FROM audit_log WHERE action LIKE 'hall.maintenance%'`).get().c >= 2);
  });
});

describe('estado efectivo y catalogo publico', () => {
  test('cancelada y borrador no se ofrecen; agotada se ve como agotada; las ya iniciadas desaparecen; terminada en el panel', async () => {
    const today = '2026-11-12';           // 10:00 en Lima
    const pub = async () => (await env.client().get('/api/catalog')).json.screenings;
    const s = await make({ date: today, startTime: '11:00', hallId: 1 });     // 11:00-12:40
    const cancelled = await make({ date: today, startTime: '13:00', hallId: 1 });
    const soldOut = await make({ date: today, startTime: '16:00', hallId: 3, format: '2D' });
    const draft = (await post(admin, base({ date: today, startTime: '19:00', hallId: 1, status: 'draft' }))).json.screening;
    await cancel(admin, cancelled.id, { version: 1, confirm: true, reason: 'x' });
    env.db.prepare('UPDATE screenings SET booked_seats = total_seats WHERE id = ?').run(soldOut.id);
    let list = await pub();
    const ids = list.map((x) => x.id);
    assert.ok(ids.includes(s.id)); assert.ok(!ids.includes(cancelled.id)); assert.ok(!ids.includes(draft.id));
    assert.equal(list.find((x) => x.id === soldOut.id).status, 'sold_out');
    assert.equal(env.db.prepare('SELECT status FROM screenings WHERE id = ?').get(soldOut.id).status, 'scheduled', 'el estado guardado no cambia');
    const adminView = (await admin.get(`/api/admin/screenings/${soldOut.id}`)).json.screening;
    assert.equal(adminView.status, 'sold_out'); assert.equal(adminView.storedStatus, 'scheduled');
    // 11:30: la funcion de las 11:00 ya empezo -> no se ofrece; en el panel esta activa
    env.clock.now = Date.UTC(2026, 10, 12, 16, 30, 0);
    list = await pub();
    assert.ok(!list.some((x) => x.id === s.id), 'ya iniciada: no se ofrece');
    assert.ok(list.some((x) => x.id === soldOut.id));
    const admin2 = await login('admin@cinerama.com');
    assert.equal((await admin2.get(`/api/admin/screenings/${s.id}`)).json.screening.status, 'active');
    // 13:00 (Lima): ya termino (12:40)
    env.clock.now = Date.UTC(2026, 10, 12, 18, 0, 0);
    const admin3 = await login('admin@cinerama.com');
    assert.equal((await admin3.get(`/api/admin/screenings/${s.id}`)).json.screening.status, 'finished');
    assert.equal((await admin3.get(`/api/admin/screenings/${s.id}`)).json.screening.storedStatus, 'scheduled');
    assert.equal((await patch(admin3, s.id, { version: 1, price: 10 })).json.error, 'not_editable');
    assert.equal((await cancel(admin3, s.id, { version: 1, confirm: true, reason: 'x' })).json.error, 'not_cancellable');
    assert.ok(!(await env.client().get('/api/screenings')).json.some((x) => x.id === s.id));
    env.clock.now = Date.UTC(2026, 10, 12, 15, 0, 0);
    admin = await login('admin@cinerama.com');
  });
});

describe('datos de ejemplo', () => {
  test('una base nueva cumple todas las reglas (sin solapes, fin = inicio + duracion, formatos compatibles)', () => {
    const rules = createRules(env.db);
    const rows = env.db.prepare(`SELECT * FROM screenings WHERE id <= 10 ORDER BY id`).all();
    assert.equal(rows.length, 10);
    for (const r of rows) {
      const { err, ctx } = rules.check({ movieId: r.movie_id, hallId: r.hall_id, date: r.starts_on, startTime: r.start_time, format: r.format }, { excludeId: r.id, nowAbs: 0, skipPast: true });
      assert.equal(err, null, `funcion ${r.id}: ${JSON.stringify(err?.body)}`);
      assert.equal(ctx.endTime, r.end_time, `fin de la funcion ${r.id}`);
      assert.equal(ctx.totalSeats, r.total_seats, `butacas de la funcion ${r.id}`);
    }
  });
});
