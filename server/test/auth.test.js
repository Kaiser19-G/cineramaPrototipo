import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, regBody, PII, DEMO_PASSWORD } from './helpers.js';

let env;
const origConsole = {};
const consoleLines = [];

before(async () => {
  // Captura todo lo que el servidor escriba en consola durante las pruebas.
  for (const m of ['log', 'warn', 'error', 'info']) {
    origConsole[m] = console[m];
    console[m] = (...a) => consoleLines.push(a.map(String).join(' '));
  }
  env = await startEnv();
});
after(async () => {
  for (const m of Object.keys(origConsole)) console[m] = origConsole[m];
  await env.stop();
});

const codeFrom = (r) => r.json.simulation.code;
const wrongCode = (c) => (c === '000000' ? '111111' : '000000');

describe('registro y verificacion', () => {
  test('registro feliz: cuenta pendiente, sin sesion, codigo simulado, cookies', async () => {
    const c = env.client();
    const r = await c.post('/api/auth/register', regBody());
    assert.equal(r.status, 201);
    assert.equal(r.json.status, 'pending_verification');
    assert.equal(r.json.simulated, true);
    assert.match(r.json.simulation.code, /^\d{6}$/);
    assert.equal(r.json.phoneMasked, '9** *** 321');
    assert.ok(r.setCookies.some((s) => s.startsWith('cinerama_verify=')));
    assert.ok(!r.setCookies.some((s) => s.startsWith('cinerama_sid=')), 'no hay sesion hasta verificar');
    const me = await c.get('/api/auth/me');
    assert.equal(me.json.user, null);
    // La respuesta no devuelve DNI ni hash.
    assert.ok(!JSON.stringify(r.json).includes(PII.dni));
  });

  test('el DNI no queda en claro en la base (solo hash y 3 digitos)', () => {
    const row = env.db.prepare('SELECT * FROM users WHERE email = ?').get(PII.email);
    assert.equal(row.status, 'pending_verification');
    assert.equal(row.dni_hint, '678');
    assert.match(row.dni_hash, /^[0-9a-f]{64}$/);
    assert.ok(!JSON.stringify(row).includes(PII.dni));
    assert.match(row.password_hash, /^scrypt\$32768\$8\$1\$/);
    assert.equal(row.role, 'customer');
    assert.equal(row.consent_version, 'borrador-2026-11b');
  });

  test('verificacion correcta crea sesion; /me devuelve el usuario', async () => {
    const c = env.client();
    const reg = await c.post('/api/auth/register', regBody({ dni: '20000001', email: 'v1@example.com', phone: '911111111' }));
    const bad = await c.post('/api/auth/verify-phone', { code: wrongCode(codeFrom(reg)) });
    assert.equal(bad.status, 400);
    assert.equal(bad.json.error, 'code_invalid');
    assert.equal(bad.json.attemptsLeft, 4);
    const ok = await c.post('/api/auth/verify-phone', { code: codeFrom(reg) });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.user.role, 'customer');
    assert.equal(ok.json.user.tier, 'customer');
    assert.equal(ok.json.user.branchId, null);
    assert.deepEqual(ok.json.user.perms, []);
    const sid = ok.setCookies.find((s) => s.startsWith('cinerama_sid='));
    assert.ok(sid);
    assert.match(sid, /HttpOnly/i);
    assert.match(sid, /SameSite=Lax/i);
    assert.match(sid, /Path=\//);
    assert.match(sid, /Max-Age=604800/);
    assert.doesNotMatch(sid, /Secure/i, 'HTTP en LAN: sin Secure por defecto');
    const me = await c.get('/api/auth/me');
    assert.equal(me.json.user.name, 'Ana Prueba Quispe');
    const row = env.db.prepare(`SELECT status, phone_verified_at, pending_token_hash FROM users WHERE email='v1@example.com'`).get();
    assert.equal(row.status, 'active');
    assert.ok(row.phone_verified_at);
    assert.equal(row.pending_token_hash, null);
    // El token de sesion no se guarda en claro.
    const token = c.jar.get('cinerama_sid');
    assert.equal(env.db.prepare('SELECT COUNT(*) c FROM sessions WHERE token_hash = ?').get(token).c, 0);
  });

  test('la cookie lleva Secure con COOKIE_SECURE', async () => {
    const e2 = await startEnv({ cookieSecure: true });
    try {
      const c = e2.client();
      const reg = await c.post('/api/auth/register', regBody());
      const ok = await c.post('/api/auth/verify-phone', { code: reg.json.simulation.code });
      assert.match(ok.setCookies.find((s) => s.startsWith('cinerama_sid=')), /; Secure/i);
    } finally { await e2.stop(); }
  });

  test('sin SMS simulado no se devuelve el codigo', async () => {
    const e2 = await startEnv({ simulateSms: false });
    try {
      const r = await e2.client().post('/api/auth/register', regBody());
      assert.equal(r.status, 201);
      assert.equal(r.json.simulated, false);
      assert.equal(r.json.simulation, undefined);
    } finally { await e2.stop(); }
  });

  test('validacion del servidor: codigos por campo', async () => {
    const c = env.client();
    const r = await c.post('/api/auth/register', regBody({
      name: '', dni: '1234567', email: 'x', phone: '812345678', password: 'corta', consent: false }));
    assert.equal(r.status, 400);
    assert.deepEqual(r.json.errors, {
      name: 'name_required', dni: 'dni_invalid', email: 'email_invalid', phone: 'phone_invalid',
      password: 'password_short', consent: 'consent_required',
    });
    const long = await c.post('/api/auth/register', regBody({ password: 'x'.repeat(129) }));
    assert.equal(long.json.errors.password, 'password_long');
    const noConsent = await c.post('/api/auth/register', regBody({ consent: 'true' }));
    assert.equal(noConsent.json.errors.consent, 'consent_required');
  });

  test('celular: se normaliza +51, espacios y guiones', async () => {
    const c = env.client();
    const r = await c.post('/api/auth/register', regBody({ dni: '20000002', email: 'v2@example.com', phone: '+51 922-222-222' }));
    assert.equal(r.status, 201);
    assert.equal(env.db.prepare(`SELECT phone FROM users WHERE email='v2@example.com'`).get().phone, '922222222');
  });
});

describe('duplicados', () => {
  test('DNI, correo (otra capitalizacion) y celular duplicados -> 409 con codigos por campo', async () => {
    const a = env.client();
    const reg = await a.post('/api/auth/register', regBody({ dni: '30000001', email: 'dup@example.com', phone: '933333331' }));
    await a.post('/api/auth/verify-phone', { code: codeFrom(reg) });

    const b = env.client();
    let r = await b.post('/api/auth/register', regBody({ dni: '30000001', email: 'otro1@example.com', phone: '933333332' }));
    assert.equal(r.status, 409);
    assert.deepEqual(r.json.errors, { dni: 'dni_taken' });

    r = await b.post('/api/auth/register', regBody({ dni: '30000002', email: 'DUP@Example.COM', phone: '933333333' }));
    assert.equal(r.status, 409);
    assert.deepEqual(r.json.errors, { email: 'email_taken' });

    r = await b.post('/api/auth/register', regBody({ dni: '30000003', email: 'otro3@example.com', phone: '933333331' }));
    assert.equal(r.status, 409);
    assert.deepEqual(r.json.errors, { phone: 'phone_taken' });

    r = await b.post('/api/auth/register', regBody({ dni: '30000001', email: 'dup@example.com', phone: '933333331' }));
    assert.deepEqual(r.json.errors, { dni: 'dni_taken', email: 'email_taken', phone: 'phone_taken' });
    // No se filtra nada de la cuenta existente.
    assert.deepEqual(Object.keys(r.json).sort(), ['error', 'errors']);
  });

  test('el correo del personal tambien cuenta como existente', async () => {
    const r = await env.client().post('/api/auth/register', regBody({ dni: '30000004', email: 'ADMIN@cinerama.com', phone: '933333334' }));
    assert.equal(r.status, 409);
    assert.equal(r.json.errors.email, 'email_taken');
  });

  test('un registro pendiente reserva los datos; el mismo navegador puede reenviar el formulario', async () => {
    const a = env.client();
    await a.post('/api/auth/register', regBody({ dni: '30000010', email: 'p1@example.com', phone: '944444441' }));
    const other = await env.client().post('/api/auth/register', regBody({ dni: '30000010', email: 'p2@example.com', phone: '944444442' }));
    assert.equal(other.status, 409);
    const again = await a.post('/api/auth/register', regBody({ dni: '30000010', email: 'p1@example.com', phone: '944444441' }));
    assert.equal(again.status, 201);
    assert.equal(env.db.prepare(`SELECT COUNT(*) c FROM users WHERE email='p1@example.com'`).get().c, 1);
  });

  test('el registro pendiente caduca a los 30 min y libera los datos', async () => {
    const a = env.client();
    await a.post('/api/auth/register', regBody({ dni: '30000020', email: 'exp@example.com', phone: '955555551' }));
    env.clock.now += 30 * 60 * 1000 + 1000;
    const r = await env.client().post('/api/auth/register', regBody({ dni: '30000020', email: 'exp@example.com', phone: '955555551' }));
    assert.equal(r.status, 201);
    const stale = await a.post('/api/auth/verify-phone', { code: '123456' });
    assert.equal(stale.status, 410);
    assert.equal(stale.json.error, 'registration_expired');
  });

  test('limite de intentos de registro por IP', async () => {
    const c = env.client('10.9.9.9');
    for (let i = 0; i < 10; i++) {
      await c.post('/api/auth/register', regBody({ dni: '31000000', email: `lim${i}@example.com`, phone: '966666666' }));
    }
    // 10 intentos validos (los primeros crean/rechazan); el siguiente ya esta bloqueado.
    const last = await c.post('/api/auth/register', regBody({ dni: '31000000', email: 'lim99@example.com', phone: '966666666' }));
    assert.equal(last.status, 429);
    assert.ok(last.json.retryAfter > 0);
    // Otra IP no se ve afectada.
    const ok = await env.client('10.9.9.10').post('/api/auth/register', regBody({ dni: '31000001', email: 'lim-ok@example.com', phone: '966666667' }));
    assert.equal(ok.status, 201);
  });
});

describe('codigo: vencimiento, intentos, reenvio', () => {
  const fresh = async (n) => {
    const c = env.client();
    const reg = await c.post('/api/auth/register', regBody({ dni: `4000000${n}`, email: `c${n}@example.com`, phone: `97000000${n}` }));
    return { c, reg };
  };

  test('codigo vencido a los 10 min -> 410; reenviar da uno nuevo', async () => {
    const { c, reg } = await fresh(1);
    env.clock.now += 10 * 60 * 1000 + 1;
    const r = await c.post('/api/auth/verify-phone', { code: codeFrom(reg) });
    assert.equal(r.status, 410);
    assert.equal(r.json.error, 'code_expired');
    const re = await c.post('/api/auth/resend-code');
    assert.equal(re.status, 200);
    const ok = await c.post('/api/auth/verify-phone', { code: codeFrom(re) });
    assert.equal(ok.status, 200);
  });

  test('5 intentos fallidos bloquean el codigo (ni el correcto sirve); reenviar lo restablece', async () => {
    const { c, reg } = await fresh(2);
    const bad = wrongCode(codeFrom(reg));
    for (let i = 4; i >= 1; i--) {
      const r = await c.post('/api/auth/verify-phone', { code: bad });
      assert.equal(r.status, 400);
      assert.equal(r.json.attemptsLeft, i);
    }
    const fifth = await c.post('/api/auth/verify-phone', { code: bad });
    assert.equal(fifth.status, 429);
    assert.equal(fifth.json.error, 'too_many_attempts');
    const right = await c.post('/api/auth/verify-phone', { code: codeFrom(reg) });
    assert.equal(right.status, 429, 'el codigo correcto ya no sirve tras agotar los intentos');
    env.clock.now += 61 * 1000;
    const re = await c.post('/api/auth/resend-code');
    assert.equal(re.status, 200);
    const ok = await c.post('/api/auth/verify-phone', { code: codeFrom(re) });
    assert.equal(ok.status, 200);
  });

  test('formato de codigo invalido no gasta intentos', async () => {
    const { c } = await fresh(3);
    const r = await c.post('/api/auth/verify-phone', { code: '12ab' });
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'code_format');
  });

  test('reenvio: espera de 60 s y maximo 3 por hora', async () => {
    const { c } = await fresh(4);
    let r = await c.post('/api/auth/resend-code');
    assert.equal(r.status, 429);
    assert.equal(r.json.error, 'resend_too_soon');
    assert.ok(r.json.retryAfter > 0 && r.json.retryAfter <= 60);
    for (let i = 0; i < 3; i++) {
      env.clock.now += 61 * 1000;
      r = await c.post('/api/auth/resend-code');
      assert.equal(r.status, 200, `reenvio ${i + 1}`);
    }
    env.clock.now += 61 * 1000;
    r = await c.post('/api/auth/resend-code');
    assert.equal(r.status, 429);
    assert.equal(r.json.error, 'resend_limit');
    env.clock.now += 61 * 60 * 1000;
    // pasada la hora el registro pendiente (30 min) ya caduco
    r = await c.post('/api/auth/resend-code');
    assert.equal(r.status, 410);
  });

  test('un codigo nuevo invalida el anterior', async () => {
    const { c, reg } = await fresh(5);
    env.clock.now += 61 * 1000;
    const re = await c.post('/api/auth/resend-code');
    const old = await c.post('/api/auth/verify-phone', { code: codeFrom(reg) });
    assert.equal(old.status, 400);
    const ok = await c.post('/api/auth/verify-phone', { code: codeFrom(re) });
    assert.equal(ok.status, 200);
  });

  test('verificar sin registro pendiente -> 410', async () => {
    const r = await env.client().post('/api/auth/verify-phone', { code: '123456' });
    assert.equal(r.status, 410);
  });
});

describe('login y sesion', () => {
  test('personal: login correcto con la contrasena de demostracion', async () => {
    const c = env.client();
    const r = await c.post('/api/auth/login', { email: 'Admin@Cinerama.com', password: DEMO_PASSWORD });
    assert.equal(r.status, 200);
    assert.equal(r.json.user.role, 'admin');
    assert.equal(r.json.user.tier, 'central');
    assert.equal(r.json.user.branchId, null);
    assert.ok(r.json.user.perms.includes('manage_users'));
    const m = await env.client().post('/api/auth/login', { email: 'sarah.mitchell@cinerama.com', password: DEMO_PASSWORD });
    assert.equal(m.json.user.role, 'manager');
    assert.equal(m.json.user.tier, 'branch');
    assert.equal(m.json.user.branchId, 1);
    const me = await c.get('/api/auth/me');
    assert.equal(me.json.user.id, 1);
    assert.equal(me.headers.get('cache-control'), 'no-store');
  });

  test('los 8 usuarios del personal pueden iniciar sesion salvo el inactivo', async () => {
    const rows = env.db.prepare(`SELECT email, status FROM users WHERE role != 'customer' ORDER BY id`).all();
    assert.equal(rows.length, 8);
    for (const u of rows) {
      const r = await env.client().post('/api/auth/login', { email: u.email, password: DEMO_PASSWORD });
      assert.equal(r.status, u.status === 'active' ? 200 : 403, u.email);
    }
  });

  test('contrasena incorrecta e inexistente devuelven la misma respuesta', async () => {
    const wrong = await env.client().post('/api/auth/login', { email: 'admin@cinerama.com', password: 'mala-clave-1' });
    const none = await env.client().post('/api/auth/login', { email: 'nadie@example.com', password: 'mala-clave-1' });
    assert.equal(wrong.status, 401);
    assert.equal(none.status, 401);
    assert.deepEqual(wrong.json, none.json);
    assert.deepEqual(wrong.json, { error: 'invalid_credentials' });
  });

  test('bloqueo tras 5 fallos en 15 min; el bloqueo aplica igual a correos inexistentes; se libera a los 15 min', async () => {
    const ip = '10.8.8.8';
    for (const email of ['lisa.brown@cinerama.com', 'fantasma@example.com']) {
      const c = env.client(ip);
      for (let i = 0; i < 5; i++) {
        const r = await c.post('/api/auth/login', { email, password: 'incorrecta-1' });
        assert.equal(r.status, 401);
      }
      const locked = await c.post('/api/auth/login', { email, password: 'incorrecta-1' });
      assert.equal(locked.status, 429);
      assert.equal(locked.json.error, 'locked');
      assert.ok(locked.json.retryAfter > 0);
    }
    // Con la clave correcta tambien esta bloqueado.
    const still = await env.client('10.8.8.9').post('/api/auth/login', { email: 'lisa.brown@cinerama.com', password: DEMO_PASSWORD });
    assert.equal(still.status, 429);
    env.clock.now += 15 * 60 * 1000 + 1000;
    const after = await env.client('10.8.8.9').post('/api/auth/login', { email: 'lisa.brown@cinerama.com', password: DEMO_PASSWORD });
    assert.equal(after.status, 200);
  });

  test('un login correcto reinicia el contador', async () => {
    const email = 'michael.chen@cinerama.com';
    const c = env.client('10.7.7.7');
    for (let i = 0; i < 4; i++) await c.post('/api/auth/login', { email, password: 'incorrecta-1' });
    assert.equal((await c.post('/api/auth/login', { email, password: DEMO_PASSWORD })).status, 200);
    for (let i = 0; i < 4; i++) assert.equal((await c.post('/api/auth/login', { email, password: 'incorrecta-1' })).status, 401);
  });

  test('usuario inactivo -> 403 account_disabled (con la clave correcta)', async () => {
    const r = await env.client().post('/api/auth/login', { email: 'david.thompson@cinerama.com', password: DEMO_PASSWORD });
    assert.equal(r.status, 403);
    assert.equal(r.json.error, 'account_disabled');
    assert.ok(!r.setCookies.some((s) => s.startsWith('cinerama_sid=')));
  });

  test('usuario pendiente -> 403 phone_not_verified con codigo nuevo y cookie de verificacion', async () => {
    const a = env.client();
    await a.post('/api/auth/register', regBody({ dni: '50000001', email: 'pend@example.com', phone: '981111111' }));
    env.clock.now += 61 * 1000;
    const c = env.client();
    const r = await c.post('/api/auth/login', { email: 'pend@example.com', password: PII.password });
    assert.equal(r.status, 403);
    assert.equal(r.json.error, 'phone_not_verified');
    assert.match(r.json.simulation.code, /^\d{6}$/);
    assert.ok(r.setCookies.some((s) => s.startsWith('cinerama_verify=')));
    assert.ok(!r.setCookies.some((s) => s.startsWith('cinerama_sid=')));
    const ok = await c.post('/api/auth/verify-phone', { code: r.json.simulation.code });
    assert.equal(ok.status, 200);
    // y despues puede iniciar sesion normalmente
    const login = await env.client().post('/api/auth/login', { email: 'pend@example.com', password: PII.password });
    assert.equal(login.status, 200);
    assert.equal(login.json.user.role, 'customer');
  });

  test('logout: borra la fila de sesion y la cookie; /me queda sin usuario', async () => {
    const c = env.client();
    await c.post('/api/auth/login', { email: 'emily.rodriguez@cinerama.com', password: DEMO_PASSWORD });
    assert.equal((await c.get('/api/auth/me')).json.user.id, 4);
    const sessions = () => env.db.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id = 4').get().c;
    const before = sessions();
    assert.ok(before >= 1);
    const out = await c.post('/api/auth/logout');
    assert.equal(out.status, 204);
    assert.match(out.setCookies.find((s) => s.startsWith('cinerama_sid=')), /Max-Age=0/);
    assert.equal(sessions(), before - 1);
    assert.equal((await c.get('/api/auth/me')).json.user, null);
    assert.equal((await c.post('/api/auth/logout')).status, 204, 'idempotente');
  });

  test('sesion: 12 h de inactividad y 7 dias maximo', async () => {
    const idle = env.client();
    await idle.post('/api/auth/login', { email: 'james.wilson@cinerama.com', password: DEMO_PASSWORD });
    env.clock.now += 11 * 3600 * 1000;
    assert.ok((await idle.get('/api/auth/me')).json.user, 'sigue activa a las 11 h');
    env.clock.now += 11 * 3600 * 1000; // 11 h mas desde el ultimo uso
    assert.ok((await idle.get('/api/auth/me')).json.user, 'la actividad renueva la inactividad');
    env.clock.now += 12 * 3600 * 1000 + 1;
    assert.equal((await idle.get('/api/auth/me')).json.user, null, 'cae tras 12 h sin uso');

    const abs = env.client();
    await abs.post('/api/auth/login', { email: 'anna.martinez@cinerama.com', password: DEMO_PASSWORD });
    for (let i = 0; i < 15; i++) { // 15 x 11 h = 165 h (< 7 dias), siempre con actividad
      env.clock.now += 11 * 3600 * 1000;
      assert.ok((await abs.get('/api/auth/me')).json.user, `paso ${i}`);
    }
    env.clock.now += 4 * 3600 * 1000; // 169 h desde el login (> 168 h)
    assert.equal((await abs.get('/api/auth/me')).json.user, null, 'cae a los 7 dias aunque haya actividad');
  });

  test('cuenta desactivada en la BD invalida la sesion existente', async () => {
    const c = env.client();
    await c.post('/api/auth/login', { email: 'lisa.brown@cinerama.com', password: DEMO_PASSWORD });
    env.db.prepare(`UPDATE users SET status='inactive' WHERE email='lisa.brown@cinerama.com'`).run();
    assert.equal((await c.get('/api/auth/me')).json.user, null);
    env.db.prepare(`UPDATE users SET status='active' WHERE email='lisa.brown@cinerama.com'`).run();
  });
});

describe('/api/admin', () => {
  test('401 sin sesion, 403 cliente, 200 personal, 403 sede en ruta central', async () => {
    assert.equal((await env.client().get('/api/admin/ping')).status, 401);

    const cust = env.client();
    const reg = await cust.post('/api/auth/register', regBody({ dni: '60000001', email: 'adm1@example.com', phone: '991111111' }));
    await cust.post('/api/auth/verify-phone', { code: codeFrom(reg) });
    const forb = await cust.get('/api/admin/ping');
    assert.equal(forb.status, 403);
    assert.deepEqual(forb.json, { error: 'forbidden' });

    const staff = env.client();
    await staff.post('/api/auth/login', { email: 'michael.chen@cinerama.com', password: DEMO_PASSWORD });
    const ok = await staff.get('/api/admin/ping');
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json, { ok: true, role: 'cashier', tier: 'branch', branchId: 1 });
    assert.equal((await staff.get('/api/admin/central/ping')).status, 403);

    const central = env.client();
    await central.post('/api/auth/login', { email: 'admin@cinerama.com', password: DEMO_PASSWORD });
    assert.equal((await central.get('/api/admin/central/ping')).status, 200);
  });
});

describe('CSRF y cuerpo', () => {
  test('Origin ajeno rechazado (403) y Origin propio aceptado', async () => {
    const c = env.client();
    const bad = await c.post('/api/auth/login', { email: 'admin@cinerama.com', password: DEMO_PASSWORD },
      { headers: { origin: 'http://evil.example' } });
    assert.equal(bad.status, 403);
    assert.equal(bad.json.error, 'bad_origin');
    // otro puerto del mismo host tambien se rechaza
    const port = new URL(env.base).port;
    const otherPort = await c.post('/api/auth/login', { email: 'admin@cinerama.com', password: DEMO_PASSWORD },
      { headers: { origin: `http://127.0.0.1:${Number(port) + 1}` } });
    assert.equal(otherPort.status, 403);
    const good = await c.post('/api/auth/login', { email: 'admin@cinerama.com', password: DEMO_PASSWORD },
      { headers: { origin: env.base } });
    assert.equal(good.status, 200);
  });

  test('Origin ajeno no puede cerrar la sesion de otro', async () => {
    const c = env.client();
    await c.post('/api/auth/login', { email: 'admin@cinerama.com', password: DEMO_PASSWORD });
    const r = await c.post('/api/auth/logout', {}, { headers: { origin: 'http://evil.example' } });
    assert.equal(r.status, 403);
    assert.ok((await c.get('/api/auth/me')).json.user);
  });

  test('cuerpo no JSON -> 415', async () => {
    const c = env.client();
    const r = await c.call('POST', '/api/auth/login', 'email=a&password=b', {
      rawBody: 'email=a&password=b', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(r.status, 415);
    assert.equal(r.json.error, 'json_required');
    const t = await c.call('POST', '/api/auth/login', 'x', { rawBody: '{}', headers: { 'content-type': 'text/plain' } });
    assert.equal(t.status, 415);
    const none = await c.call('POST', '/api/auth/logout', undefined, {});
    assert.equal(none.status, 415);
  });

  test('JSON mal formado -> 400 sin eco del cuerpo', async () => {
    const r = await env.client().call('POST', '/api/auth/login', '{"email": "x@y.com", "password": oops', {
      rawBody: '{"email": "x@y.com", "password": oops', headers: { 'content-type': 'application/json' } });
    assert.equal(r.status, 400);
    assert.deepEqual(r.json, { error: 'invalid_json' });
  });

  test('las rutas publicas de lectura siguen funcionando', async () => {
    const c = env.client();
    assert.equal((await c.get('/api/health')).status, 200);
    const cat = await c.get('/api/catalog');
    assert.equal(cat.status, 200);
    assert.ok(cat.json.movies.length > 0);
    assert.equal((await c.get('/api/noexiste')).status, 404);
  });
});

describe('consola sin datos personales', () => {
  test('ningun DNI, correo, telefono, nombre ni contrasena de prueba aparece en la consola', () => {
    const all = [...consoleLines, ...env.logs].join('\n');
    const emails = env.db.prepare(`SELECT email FROM users WHERE role='customer'`).all().map((r) => r.email);
    const dnis = ['12345678', '20000001', '30000001', '40000001', '50000001', '60000001'];
    for (const needle of [...emails, ...dnis, PII.phone, '911111111', '922222222', PII.name, PII.password, 'Cinerama#2026', 'scrypt$']) {
      assert.ok(!all.includes(needle), `aparece "${needle}" en la consola`);
    }
    // Solo hay lineas de SMS simulado con id y codigo.
    assert.ok(all.includes('[SMS simulado] usuario #'));
    for (const line of all.split('\n').filter(Boolean)) {
      assert.match(line, /^\[SMS simulado\] usuario #\d+: codigo \d{6}$/, `linea inesperada: ${line}`);
    }
  });
});
