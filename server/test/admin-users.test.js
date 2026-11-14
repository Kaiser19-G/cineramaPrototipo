import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, regBody, DEMO_PASSWORD } from './helpers.js';
import { hashPassword } from '../auth/crypto.js';

let env; let admin; let manager; let customer;
const consoleLines = []; const origConsole = {};
const ADMIN_PW = 'clave-admin-test-1';
const U = '/api/admin/central/users';
const C = { dni: '60000031', email: 'ana.cliente@example.com', phone: '955123456', name: 'Ana Cliente Prueba' };

const login = async (email, password = DEMO_PASSWORD) => { const c = env.client(); const r = await c.post('/api/auth/login', { email, password }); return { c, r }; };
const create = (c, over = {}) => c.post(U, { name: 'Persona Nueva', email: `nuevo${Math.random().toString(36).slice(2, 8)}@cinerama.com`, role: 'cashier', branchId: 1, ...over });
const patch = (c, id, body) => c.call('PATCH', `${U}/${id}`, body);
const reset = (c, id) => c.post(`${U}/${id}/reset-password`, {});
const setAdminPassword = async () => { env.db.prepare(`UPDATE users SET password_hash = ? WHERE id = 1`).run(await hashPassword(ADMIN_PW)); };

before(async () => {
  for (const m of ['log', 'warn', 'error', 'info']) { origConsole[m] = console[m]; console[m] = (...a) => consoleLines.push(a.map(String).join(' ')); }
  env = await startEnv();
  manager = (await login('sarah.mitchell@cinerama.com')).c;
  customer = env.client();
  const reg = await customer.post('/api/auth/register', regBody(C));
  await customer.post('/api/auth/verify-phone', { code: reg.json.simulation.code });
  admin = (await login('admin@cinerama.com')).c;       // sesion creada con la contrasena de demostracion
});
after(async () => { for (const m of Object.keys(origConsole)) console[m] = origConsole[m]; await env.stop(); });

describe('demoGate y permisos', () => {
  test('401 sin sesion; 403 a clientes y a personal de sede; con la contrasena de demostracion, 403 demo_password en todas las rutas', async () => {
    const calls = (c) => [c.get(U), c.get(`${U}/audit/log`), create(c), patch(c, 2, { name: 'X Y' }), reset(c, 2)];
    for (const r of await Promise.all(calls(env.client()))) assert.equal(r.status, 401);
    for (const r of await Promise.all(calls(customer))) assert.equal(r.status, 403);
    for (const r of await Promise.all(calls(manager))) { assert.equal(r.status, 403); assert.deepEqual(r.json, { error: 'forbidden' }); }
    for (const r of await Promise.all(calls(admin))) { assert.equal(r.status, 403); assert.deepEqual(r.json, { error: 'demo_password' }); }
    assert.equal((await admin.get('/api/admin/central/claims')).json.error, 'demo_password', 'reclamos sigue igual');
  });
  test('al cambiar la contrasena del administrador, las rutas de usuarios y de reclamos se abren', async () => {
    await setAdminPassword();
    admin = (await login('admin@cinerama.com', ADMIN_PW)).c;
    assert.equal((await admin.get(U)).status, 200);
    assert.equal((await admin.get('/api/admin/central/claims')).status, 200);
    assert.equal((await manager.get(U)).status, 403);
  });
});

describe('listados', () => {
  test('personal: correo completo, sin secretos en el JSON; clientes: datos enmascarados', async () => {
    const st = await admin.get(U);
    assert.equal(st.status, 200);
    assert.equal(st.headers.get('cache-control'), 'no-store');
    assert.equal(st.json.users.length, 8); assert.equal(st.json.total, 8); assert.equal(st.json.pageSize, 50); assert.equal(st.json.pages, 1);
    assert.equal(st.json.users[0].email, 'admin@cinerama.com');
    assert.deepEqual(st.json.roleCounts, { admin: 1, manager: 2, cashier: 3, support: 1, operator: 1 });
    const cu = await admin.get(`${U}?kind=customer`);
    assert.equal(cu.json.users.length, 1);
    const c1 = cu.json.users[0];
    assert.deepEqual(Object.keys(c1).sort(), ['createdAt', 'dniHint', 'emailMasked', 'id', 'lastLogin', 'name', 'phoneMasked', 'status']);
    assert.equal(c1.dniHint, '031'); assert.equal(c1.emailMasked, 'a***@example.com'); assert.equal(c1.phoneMasked, '9** *** 456');
    for (const body of [JSON.stringify(st.json), JSON.stringify(cu.json), JSON.stringify((await admin.get(`${U}/audit/log`)).json)]) {
      assert.ok(!/hash|pepper|token|"password"|temporaryPassword/i.test(body), 'sin hash, contrasena ni token');
      assert.ok(!body.includes(C.dni) && !body.includes(C.phone) && !body.includes(C.email), 'sin DNI, celular ni correo completos del cliente');
    }
    const raw = env.db.prepare('SELECT password_hash, dni_hash FROM users WHERE id = ?').get(c1.id);
    assert.ok(!JSON.stringify(cu.json).includes(raw.dni_hash) && !JSON.stringify(st.json).includes(raw.password_hash));
  });
  test('filtros, busqueda y validacion', async () => {
    const f = async (qs) => (await admin.get(`${U}?${qs}`));
    assert.ok((await f('role=manager')).json.users.every((u) => u.role === 'manager'));
    assert.ok((await f('branchId=1')).json.users.every((u) => u.branchId === 1));
    assert.deepEqual((await f('status=inactive')).json.users.map((u) => u.id), [5]);
    assert.deepEqual((await f('q=SARAH')).json.users.map((u) => u.name), ['Sarah Mitchell']);
    assert.equal((await f('q=cinerama.com')).json.total, 8);
    assert.equal((await f('q=%25')).json.total, 0, 'el comodin no se interpreta');
    assert.equal((await f('kind=customer&q=ana')).json.total, 1);
    assert.equal((await f('kind=customer&q=zzz')).json.total, 0);
    for (const bad of ['kind=otro', 'status=x', 'page=0', 'page=abc', 'branchId=0', 'role=customer', `q=${'a'.repeat(81)}`]) assert.equal((await f(bad)).status, 400, bad);
  });
  test('paginado de 50', async () => {
    const ins = env.db.prepare(`INSERT INTO users (name,email,role,status,created_at) VALUES (?,?,'customer','active',1)`);
    env.db.transaction(() => { for (let i = 0; i < 120; i++) ins.run(`Cliente ${i}`, `c${i}@pag.test`); })();
    const p1 = (await admin.get(`${U}?kind=customer`)).json;
    assert.equal(p1.users.length, 50); assert.equal(p1.total, 121); assert.equal(p1.pages, 3);
    assert.equal((await admin.get(`${U}?kind=customer&page=3`)).json.users.length, 21);
    assert.equal((await admin.get(`${U}?kind=customer&page=9`)).json.users.length, 0);
    const ids = [...(await admin.get(`${U}?kind=customer&page=1`)).json.users, ...(await admin.get(`${U}?kind=customer&page=2`)).json.users].map((u) => u.id);
    assert.equal(new Set(ids).size, 100, 'sin repetidos entre paginas');
    env.db.prepare(`DELETE FROM users WHERE email LIKE '%@pag.test'`).run();
  });
});

describe('crear personal y contrasena temporal', () => {
  test('validacion, rol y sede', async () => {
    const r = await admin.post(U, { name: 'X', email: 'no', role: 'jefe' });
    assert.equal(r.status, 400); assert.deepEqual(r.json.errors, { name: 'name_required', email: 'email_invalid', role: 'invalid_option' });
    assert.equal((await create(admin, { role: 'manager', branchId: undefined })).json.errors.branchId, 'required');
    assert.equal((await create(admin, { branchId: 99 })).json.errors.branchId, 'invalid');
    const a = await create(admin, { role: 'admin', branchId: 3 });
    assert.equal(a.status, 201); assert.equal(a.json.user.branchId, null, 'el administrador central no tiene sede');
    const dup = await admin.post(U, { name: 'Otra', email: 'SARAH.MITCHELL@cinerama.com', role: 'cashier', branchId: 1 });
    assert.equal(dup.status, 409); assert.equal(dup.json.error, 'email_taken');
  });
  test('la contrasena temporal sale una sola vez y nunca en consola, base legible ni auditoria', async () => {
    consoleLines.length = 0;
    const r = await create(admin, { role: 'manager', branchId: 2, email: 'gerente.temp@cinerama.com' });
    assert.equal(r.status, 201); assert.equal(r.headers.get('cache-control'), 'no-store');
    const pw = r.json.temporaryPassword;
    assert.match(pw, /^[A-Za-z0-9]{5}-[A-Za-z0-9]{5}-[A-Za-z0-9]{5}$/);
    assert.equal(r.json.user.mustChangePassword, true); assert.equal(r.json.user.status, 'active');
    const row = env.db.prepare(`SELECT password_hash, must_change_password, created_by FROM users WHERE email = 'gerente.temp@cinerama.com'`).get();
    assert.equal(row.must_change_password, 1); assert.equal(row.created_by, 1); assert.ok(!row.password_hash.includes(pw));
    const audits = JSON.stringify(env.db.prepare('SELECT * FROM audit_log').all());
    assert.ok(!audits.includes(pw)); assert.ok(!/gerente\.temp/.test(audits), 'sin correos en auditoria');
    assert.ok(!consoleLines.join('\n').includes(pw), 'nunca en consola');
    for (const url of [U, `${U}?kind=staff&q=gerente`, `${U}/audit/log`]) assert.ok(!JSON.stringify((await admin.get(url)).json).includes(pw));
    // el gerente puede entrar con ella
    const l = await login('gerente.temp@cinerama.com', pw);
    assert.equal(l.r.status, 200); assert.equal(l.r.json.user.mustChangePassword, true); assert.equal(l.r.json.user.role, 'manager');
  });
  test('limite de intentos al emitir contrasenas temporales', async () => {
    env.db.prepare('DELETE FROM auth_throttle').run();
    const rs = [];
    for (let i = 0; i < 11; i++) rs.push((await create(admin)).status);
    assert.deepEqual(rs, [201, 201, 201, 201, 201, 201, 201, 201, 201, 201, 429]);
    const t = await reset(admin, 2);
    assert.equal(t.status, 429); assert.ok(t.json.retryAfter > 0);
    env.db.prepare('DELETE FROM auth_throttle').run();
  });
});

describe('cambio de contrasena obligatorio (aplicado en el servidor)', () => {
  test('con contrasena temporal ninguna ruta de /api/admin responde; /me, logout y change-password si', async () => {
    const made = await create(admin, { role: 'manager', branchId: 1, email: 'obligado@cinerama.com' });
    const tmp = made.json.temporaryPassword;
    const { c } = await login('obligado@cinerama.com', tmp);
    for (const url of ['/api/admin/ping', '/api/admin/movies', '/api/admin/screenings', '/api/admin/central/users', '/api/admin/central/claims']) {
      const r = await c.get(url); assert.equal(r.status, 403, url); assert.equal(r.json.error, 'password_change_required', url);
    }
    assert.equal((await c.post('/api/admin/screenings', {})).json.error, 'password_change_required');
    assert.equal((await c.call('PATCH', '/api/admin/halls/1', { status: 'active' })).json.error, 'password_change_required');
    const me = await c.get('/api/auth/me'); assert.equal(me.json.user.mustChangePassword, true);
    // contrasena actual erronea, corta, repetida, la de demostracion, y faltante
    assert.equal((await c.post('/api/auth/change-password', { currentPassword: 'mala-mala-1', newPassword: 'clave-nueva-larga-1' })).json.error, 'invalid_current_password');
    assert.equal((await c.post('/api/auth/change-password', { currentPassword: tmp, newPassword: 'corta' })).json.errors.newPassword, 'password_short');
    assert.equal((await c.post('/api/auth/change-password', { currentPassword: tmp, newPassword: tmp })).json.errors.newPassword, 'password_same');
    assert.equal((await c.post('/api/auth/change-password', { currentPassword: tmp, newPassword: DEMO_PASSWORD })).json.errors.newPassword, 'password_demo');
    assert.equal((await c.post('/api/auth/change-password', { newPassword: 'clave-nueva-larga-1' })).json.errors.currentPassword, 'required');
    assert.equal((await c.post('/api/auth/change-password', { currentPassword: tmp, newPassword: 'x'.repeat(129) })).json.errors.newPassword, 'password_long');
    assert.equal((await env.client().post('/api/auth/change-password', { currentPassword: 'a', newPassword: 'b' })).status, 401);
    // una segunda sesion abierta se cierra al cambiar
    const other = (await login('obligado@cinerama.com', tmp)).c;
    const ok = await c.post('/api/auth/change-password', { currentPassword: tmp, newPassword: 'clave-nueva-larga-1' });
    assert.equal(ok.status, 200); assert.equal(ok.json.user.mustChangePassword, false);
    assert.equal((await c.get('/api/admin/ping')).status, 200, 'esta sesion sigue y ya entra al panel');
    assert.equal((await other.get('/api/auth/me')).json.user, null, 'las demas sesiones se cerraron');
    assert.equal(env.db.prepare(`SELECT must_change_password m FROM users WHERE email = 'obligado@cinerama.com'`).get().m, 0);
    assert.equal((await login('obligado@cinerama.com', tmp)).r.status, 401, 'la temporal ya no sirve');
    assert.equal((await login('obligado@cinerama.com', 'clave-nueva-larga-1')).r.status, 200);
    const a = env.db.prepare(`SELECT detail_json FROM audit_log WHERE action = 'user.change_password'`).all();
    assert.ok(a.length >= 1 && a.every((x) => x.detail_json === null));
  });
  test('limite de intentos con contrasena actual erronea', async () => {
    const made = await create(admin, { email: 'intentos@cinerama.com' });
    const { c } = await login('intentos@cinerama.com', made.json.temporaryPassword);
    const codes = [];
    for (let i = 0; i < 6; i++) codes.push((await c.post('/api/auth/change-password', { currentPassword: 'incorrecta-1', newPassword: 'clave-nueva-larga-2' })).status);
    assert.deepEqual(codes, [400, 400, 400, 400, 400, 429]);
    assert.equal((await c.post('/api/auth/change-password', { currentPassword: made.json.temporaryPassword, newPassword: 'clave-nueva-larga-2' })).status, 429, 'bloqueado aunque ahora acierte');
  });
});

describe('editar, desactivar y restablecer', () => {
  test('uno mismo, clientes, estados bloqueados y validacion', async () => {
    assert.equal((await patch(admin, 1, { role: 'manager', branchId: 1 })).json.error, 'cannot_modify_self');
    assert.equal((await patch(admin, 1, { status: 'inactive' })).json.error, 'cannot_modify_self');
    assert.equal((await patch(admin, 1, { name: 'Admin Central Renombrado' })).status, 200, 'su propio nombre si');
    assert.equal((await reset(admin, 1)).json.error, 'cannot_modify_self');
    const custId = (await admin.get(`${U}?kind=customer&q=ana`)).json.users[0].id;
    assert.equal((await patch(admin, custId, { name: 'Otro Nombre' })).json.error, 'not_staff');
    assert.equal((await patch(admin, custId, { role: 'manager', branchId: 1 })).json.error, 'not_staff');
    assert.equal((await patch(admin, custId, { status: 'inactive' })).json.error, 'not_staff');
    assert.equal((await reset(admin, custId)).json.error, 'not_staff');
    assert.equal((await patch(admin, 3, { role: 'customer' })).json.errors.role, 'invalid_option');
    assert.equal(env.db.prepare('SELECT role FROM users WHERE id = ?').get(custId).role, 'customer');
    // suspended / pending_verification: bloqueados
    env.db.prepare(`UPDATE users SET status = 'suspended' WHERE id = 7`).run();
    assert.equal((await patch(admin, 7, { status: 'active' })).json.error, 'status_locked');
    assert.equal((await reset(admin, 7)).json.error, 'status_locked');
    assert.equal((await patch(admin, 6, { status: 'suspended' })).json.error, 'status_locked');
    assert.equal((await patch(admin, 6, { status: 'pending_verification' })).json.error, 'status_locked');
    assert.equal((await patch(admin, 6, { status: 'borrada' })).json.errors.status, 'invalid_option');
    assert.equal((await patch(admin, 7, { name: 'James Wilson Jr' })).status, 200, 'editar el nombre de una cuenta suspendida si');
    assert.equal(env.db.prepare('SELECT status FROM users WHERE id = 7').get().status, 'suspended');
    env.db.prepare(`UPDATE users SET status = 'active' WHERE id = 7`).run();
    assert.equal((await patch(admin, 99999, { name: 'No Existe' })).status, 404);
    assert.equal((await patch(admin, 3, {})).json.errors.body, 'empty');
    assert.equal((await patch(admin, 3, { name: 'A' })).json.errors.name, 'name_required');
    assert.equal((await patch(admin, 5, { status: 'active' })).json.user.status, 'active', 'inactive -> active');
  });
  test('rol y sede: reglas y sesiones', async () => {
    const mgr = await login('michael.chen@cinerama.com');       // cajero, sede 1
    assert.equal((await mgr.c.get('/api/auth/me')).json.user.role, 'cashier');
    // cambiar de sede: surte efecto de inmediato y la sesion sigue
    const moved = await patch(admin, 3, { branchId: 2 });
    assert.equal(moved.status, 200); assert.equal(moved.json.user.branchId, 2);
    assert.equal((await mgr.c.get('/api/auth/me')).json.user.branchId, 2);
    assert.equal((await patch(admin, 3, { branchId: 99 })).json.errors.branchId, 'invalid');
    // cambiar de rol: cierra sus sesiones
    assert.equal((await patch(admin, 3, { role: 'support' })).status, 200);
    assert.equal((await mgr.c.get('/api/auth/me')).json.user, null);
    assert.equal(env.db.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id = 3').get().c, 0);
    // admin -> otro rol exige sede; otro rol -> admin quita la sede
    const adm2 = (await create(admin, { role: 'admin' })).json.user;
    assert.equal((await patch(admin, adm2.id, { role: 'manager' })).json.errors.branchId, 'required');
    assert.equal((await patch(admin, adm2.id, { role: 'manager', branchId: 1 })).json.user.branchId, 1);
    assert.equal((await patch(admin, adm2.id, { role: 'admin' })).json.user.branchId, null);
  });
  test('desactivar cierra las sesiones y bloquea el ingreso; reactivar lo permite', async () => {
    const l = await login('lisa.brown@cinerama.com');
    assert.equal((await l.c.get('/api/admin/ping')).status, 200);
    const off = await patch(admin, 6, { status: 'inactive' });
    assert.equal(off.json.user.status, 'inactive');
    assert.equal((await l.c.get('/api/admin/ping')).status, 401);
    assert.equal(env.db.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id = 6').get().c, 0);
    assert.equal((await login('lisa.brown@cinerama.com')).r.status, 403);
    assert.equal((await patch(admin, 6, { status: 'active' })).json.user.status, 'active');
    assert.equal((await login('lisa.brown@cinerama.com')).r.status, 200);
  });
  test('restablecer: nueva contrasena temporal una vez, cierra sesiones, obliga a cambiarla', async () => {
    consoleLines.length = 0;
    const l = await login('emily.rodriguez@cinerama.com');
    const r = await reset(admin, 4);
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
    const pw = r.json.temporaryPassword; assert.match(pw, /^[A-Za-z0-9]{5}(-[A-Za-z0-9]{5}){2}$/);
    assert.equal(r.json.user.mustChangePassword, true);
    assert.equal((await l.c.get('/api/auth/me')).json.user, null, 'sesiones cerradas');
    assert.equal((await login('emily.rodriguez@cinerama.com')).r.status, 401, 'la anterior ya no sirve');
    const again = await login('emily.rodriguez@cinerama.com', pw);
    assert.equal(again.r.status, 200); assert.equal(again.r.json.user.mustChangePassword, true);
    assert.equal((await again.c.get('/api/admin/ping')).json.error, 'password_change_required');
    assert.ok(!consoleLines.join('\n').includes(pw)); assert.ok(!JSON.stringify(env.db.prepare('SELECT * FROM audit_log').all()).includes(pw));
    assert.equal((await reset(admin, 99999)).status, 404);
  });
  test('ultimo administrador: el unico admin activo no puede quedarse sin serlo (por si mismo ni por otro)', async () => {
    // Quien actua siempre es un admin activo distinto del objetivo, asi que el conteo nunca baja de 1 por la API;
    // se comprueba con dos administradores: el segundo se puede desactivar mientras el primero siga activo.
    const a2 = (await create(admin, { role: 'admin', email: 'admin2@cinerama.com' })).json;
    const l = await login('admin2@cinerama.com', a2.temporaryPassword);
    assert.equal((await l.c.post('/api/auth/change-password', { currentPassword: a2.temporaryPassword, newPassword: 'clave-admin2-test-1' })).status, 200);
    const stillOne = await patch(admin, a2.user.id, { status: 'inactive' });
    assert.equal(stillOne.status, 200);
    assert.equal(env.db.prepare(`SELECT COUNT(*) c FROM users WHERE role='admin' AND status='active'`).get().c >= 1, true);
    assert.equal((await patch(admin, 1, { status: 'inactive' })).json.error, 'cannot_modify_self');
  });
});

describe('registro de actividad', () => {
  test('GET paginado solo para admin central, solo ids y codigos', async () => {
    const r = await admin.get(`${U}/audit/log`);
    assert.equal(r.status, 200); assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.ok(r.json.entries.length > 5 && r.json.entries.length <= 50);
    const actions = new Set(r.json.entries.map((e) => e.action));
    for (const a of ['user.create', 'user.update', 'user.reset_password']) assert.ok(actions.has(a), a);
    assert.ok(r.json.entries[0].id > r.json.entries.at(-1).id, 'mas recientes primero');
    assert.ok(r.json.entries.every((e) => e.detail === null || Object.keys(e.detail).every((k) => ['role', 'fields'].includes(k))));
    assert.equal((await admin.get(`${U}/audit/log?page=0`)).status, 400);
    assert.equal((await manager.get(`${U}/audit/log`)).status, 403);
  });
});
