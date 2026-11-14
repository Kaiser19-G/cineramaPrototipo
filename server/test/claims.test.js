// Fase 2b: reclamos de DNI usado por otra persona.
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { startEnv, regBody, PII, DEMO_PASSWORD } from './helpers.js';
import { SCHEMA } from '../schema.js';
import { MIGRATIONS } from '../migrations.js';
import { openDb } from '../db.js';
import { seed } from '../seed.js';
import { seedDemoCredentials } from '../seedAuth.js';
import { setPassword } from '../setPassword.js';
import { normalizeClaimCode, formatClaimCode, newClaimCode } from '../claims/router.js';
import { CLAIMS } from '../claims/config.js';
import { detectImage } from '../claims/files.js';

const ADMIN = 'admin@cinerama.com';
const ADMIN_PASS = 'clave-admin-cambiada-1';
const HOUR = 3600 * 1000, DAY = 24 * HOUR;

// Imagenes sinteticas con las firmas reales (el servidor no las decodifica).
const fill = (n) => Buffer.alloc(n, 0x41);
export const jpeg = (n = 4096) => Buffer.concat([Buffer.from([0xFF, 0xD8, 0xFF, 0xE0]), fill(n), Buffer.from([0xFF, 0xD9])]);
export const png = (n = 4096) => Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0, 0, 0, 13]), Buffer.from('IHDR'), fill(n),
  Buffer.from('IEND'), Buffer.from([0xAE, 0x42, 0x60, 0x82])]);
export const webp = (n = 4096) => {
  const body = Buffer.concat([Buffer.from('WEBP'), fill(n)]);
  const head = Buffer.alloc(8); head.write('RIFF', 0); head.writeUInt32LE(body.length, 4);
  return Buffer.concat([head, body]);
};
const heic = () => Buffer.concat([Buffer.from([0, 0, 0, 24]), Buffer.from('ftypheic'), fill(4096)]);

const claimBody = (over = {}) => ({
  name: 'Titular Real Gomez', dni: PII.dni, email: 'titular@example.com', phone: '912345678', consent: true, ...over,
});
const mode = (f) => fs.statSync(f).mode & 0o777;

// Registra y verifica una cuenta de cliente (queda activa). Devuelve el cliente con sesion.
async function makeCustomer(env, over = {}) {
  const c = env.client();
  const reg = await c.post('/api/auth/register', regBody(over));
  assert.equal(reg.status, 201, JSON.stringify(reg.json));
  const ok = await c.post('/api/auth/verify-phone', { code: reg.json.simulation.code });
  assert.equal(ok.status, 200);
  return c;
}
const upload = (c, code, kind, buf, type = 'image/jpeg') =>
  c.call('PUT', `/api/claims/files/${kind}`, undefined, { rawBody: buf, headers: { 'content-type': type, 'x-claim-code': code } });
const submit = (c, code) => c.post('/api/claims/submit', { code });
const status = (c, code) => c.post('/api/claims/status', { code });

// Crea un reclamo completo (3 archivos + selfie opcional) y lo envia. Devuelve { code, id }.
async function fullClaim(env, over = {}, { selfie = false, client } = {}) {
  const c = client ?? env.client();
  const r = await c.post('/api/claims', claimBody(over));
  assert.equal(r.status, 201, JSON.stringify(r.json));
  const code = r.json.code;
  assert.equal((await upload(c, code, 'dni_front', jpeg())).status, 200);
  assert.equal((await upload(c, code, 'dni_back', png())).status, 200, 'png');
  assert.equal((await upload(c, code, 'letter', webp(), 'image/webp')).status, 200, 'webp');
  if (selfie) assert.equal((await upload(c, code, 'selfie', jpeg(3000))).status, 200);
  const s = await submit(c, code);
  assert.equal(s.status, 200, JSON.stringify(s.json));
  const id = env.db.prepare('SELECT id FROM claims WHERE code_hash = ?').get(
    env.db.prepare('SELECT code_hash FROM claims ORDER BY id DESC LIMIT 1').get().code_hash).id;
  return { code, id, c };
}

async function adminClient(env) {
  const a = env.client();
  const r = await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return a;
}

let env, admin;
before(async () => {
  env = await startEnv();
  assert.deepEqual(await setPassword(env.db, ADMIN, ADMIN_PASS), { ok: true });
  admin = await adminClient(env);
});
after(async () => { await env.stop(); });

const closeOpen = () => env.db.prepare(`UPDATE claims SET status='expired' WHERE status IN ('draft','pending')`).run();
const claimsDir = () => path.join(path.dirname(env.dbFile), 'claims');
const filesOnDisk = () => fs.readdirSync(claimsDir());

describe('migracion 2', () => {
  test('una base de la fase 2 (user_version 1) conserva todos sus datos y gana las tablas nuevas', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinerama-mig2-'));
    const file = path.join(dir, 'fase2.db');
    const old = new Database(file);
    old.pragma('journal_mode = WAL'); old.pragma('foreign_keys = ON');
    old.exec(SCHEMA);
    MIGRATIONS[0](old); old.pragma('user_version = 1');
    seed(old); await seedDemoCredentials(old);
    old.prepare(`INSERT INTO users (name,email,role,status,dni_hash,dni_hint,phone,created_at) VALUES ('Cliente','cli@example.com','customer','active',?,?,?,?)`)
      .run('f'.repeat(64), '678', '911111111', 1);
    old.prepare(`INSERT INTO sessions (token_hash,user_id,created_at,last_seen_at,expires_at) VALUES ('t',1,1,1,9999999999999)`).run();
    const tables = old.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
    const dump = (db) => Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
    const before = dump(old);
    old.close();

    const db = openDb(file);
    assert.equal(db.pragma('user_version', { simple: true }), 2);
    assert.deepEqual(dump(db), before, 'las filas existentes no cambian');
    for (const t of ['claims', 'claim_files']) assert.equal(db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c, 0);
    assert.equal(db.pragma('foreign_key_check').length, 0);
    assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
    db.close();
    const again = openDb(file);
    assert.equal(again.pragma('user_version', { simple: true }), 2);
    assert.deepEqual(dump(again), before);
    again.close();
    fs.rmSync(dir, { recursive: true, force: true });
  });
});

describe('codigo de reclamo', () => {
  test('12 caracteres Crockford (60 bits), formato XXXX-XXXX-XXXX, tolerante a minusculas y a I/L/O', () => {
    const c = newClaimCode();
    assert.match(c, /^[0-9ABCDEFGHJKMNPQRSTVWXYZ]{12}$/);
    assert.match(formatClaimCode(c), /^\w{4}-\w{4}-\w{4}$/);
    assert.equal(new Set(Array.from({ length: 200 }, newClaimCode)).size, 200);
    assert.equal(normalizeClaimCode('abcd-efgh-jkmn'), 'ABCDEFGHJKMN');
    assert.equal(normalizeClaimCode('ABCD EFGH JKMN'), 'ABCDEFGHJKMN');
    assert.equal(normalizeClaimCode('0123-4567-89AB'), '0123456789AB');
    assert.equal(normalizeClaimCode('oiLo-0000-0000'), '0110' + '00000000');
    for (const bad of ['', 'ABC', 'ABCD-EFGH-JKMU', 'ABCD-EFGH-JKMN-X', 12345, null, undefined, 'x'.repeat(100)]) assert.equal(normalizeClaimCode(bad), null, String(bad));
  });
});

describe('deteccion de tipo por bytes', () => {
  test('JPEG, PNG y WebP; HEIC y desconocidos rechazados; truncados corruptos', () => {
    assert.equal(detectImage(jpeg()).mime, 'image/jpeg');
    assert.equal(detectImage(png()).mime, 'image/png');
    assert.equal(detectImage(webp()).mime, 'image/webp');
    assert.equal(detectImage(heic()).error, 'heic');
    assert.equal(detectImage(Buffer.from('%PDF-1.7 ' + 'x'.repeat(4000))).error, 'unsupported');
    assert.equal(detectImage(Buffer.from('MZ' + 'x'.repeat(4000))).error, 'unsupported');
    assert.equal(detectImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg">' + ' '.repeat(3000))).error, 'unsupported');
    assert.equal(detectImage(jpeg().subarray(0, 3000)).error, 'corrupt');
    assert.equal(detectImage(png().subarray(0, 3000)).error, 'corrupt');
    assert.equal(detectImage(webp().subarray(0, 3000)).error, 'corrupt');
  });
});

describe('crear reclamo', () => {
  test('sin cuenta con ese DNI no se crea (P9); con cuenta se crea un borrador con codigo', async () => {
    const c = env.client();
    const none = await c.post('/api/claims', claimBody());
    assert.equal(none.status, 409);
    assert.equal(none.json.error, 'no_account_for_dni');
    assert.equal(env.db.prepare('SELECT COUNT(*) c FROM claims').get().c, 0);

    await makeCustomer(env); // cuenta con DNI 12345678
    const r = await env.client().post('/api/claims', claimBody());
    assert.equal(r.status, 201);
    assert.match(r.json.code, /^\w{4}-\w{4}-\w{4}$/);
    assert.deepEqual(r.json.limits.required, ['dni_front', 'dni_back', 'letter']);
    assert.equal(r.json.limits.maxBytes, 5 * 1024 * 1024);
    const row = env.db.prepare('SELECT * FROM claims ORDER BY id DESC LIMIT 1').get();
    assert.equal(row.status, 'draft');
    assert.equal(row.dni_plain, PII.dni);
    assert.equal(row.dni_hint, '678');
    assert.ok(!JSON.stringify(row).includes(r.json.code.replace(/-/g, '')), 'el codigo no se guarda');
    assert.match(row.code_hash, /^[0-9a-f]{64}$/);
  });

  test('validacion por campo y consentimiento obligatorio', async () => {
    const r = await env.client().post('/api/claims', { name: '', dni: '123', email: 'x', phone: '1', consent: false });
    assert.equal(r.status, 400);
    assert.deepEqual(Object.keys(r.json.errors).sort(), ['consent', 'dni', 'email', 'name', 'phone']);
    assert.ok(!('password' in r.json.errors));
  });
});

describe('subida de archivos', () => {
  let c, code;
  before(async () => {
    c = env.client();
    code = (await c.post('/api/claims', claimBody())).json.code;
  });

  test('guarda con nombre aleatorio, modo 0600, en un directorio 0700 fuera del repo', async () => {
    const r = await upload(c, code, 'dni_front', jpeg());
    assert.equal(r.status, 200);
    assert.deepEqual(r.json, { kind: 'dni_front', size: jpeg().length, mime: 'image/jpeg' });
    const row = env.db.prepare('SELECT * FROM claim_files').get();
    assert.match(row.stored_name, /^[0-9a-f]{32}$/);
    assert.equal(mode(claimsDir()), 0o700);
    assert.equal(mode(path.join(claimsDir(), row.stored_name)), 0o600);
    assert.ok(!claimsDir().startsWith(process.cwd()), 'fuera del repositorio');
  });

  test('el tipo real manda: bytes PNG con cabecera image/jpeg se guardan como image/png', async () => {
    const r = await upload(c, code, 'dni_back', png(), 'image/jpeg');
    assert.equal(r.status, 200);
    assert.equal(r.json.mime, 'image/png');
  });

  test('rechazos: no imagen, HEIC, truncado, vacio, demasiado grande, kind invalido, codigo desconocido', async () => {
    const txt = await upload(c, code, 'letter', Buffer.from('MZ' + 'x'.repeat(4000)), 'image/png');
    assert.equal(txt.status, 415); assert.equal(txt.json.error, 'unsupported_type');
    const h = await upload(c, code, 'letter', heic());
    assert.equal(h.status, 415); assert.equal(h.json.error, 'heic_not_supported');
    const t = await upload(c, code, 'letter', jpeg().subarray(0, 3000));
    assert.equal(t.status, 415); assert.equal(t.json.error, 'corrupt_file');
    const e = await upload(c, code, 'letter', Buffer.alloc(0));
    assert.equal(e.status, 400);
    const tiny = await upload(c, code, 'letter', Buffer.from([0xFF, 0xD8, 0xFF, 0xD9]));
    assert.equal(tiny.status, 415);
    const big = await upload(c, code, 'letter', jpeg(CLAIMS.MAX_FILE));
    assert.equal(big.status, 413); assert.equal(big.json.error, 'too_large');
    const exact = await upload(c, code, 'letter', Buffer.concat([jpeg(100).subarray(0, 100), fill(CLAIMS.MAX_FILE - 100 - 2), Buffer.from([0xFF, 0xD9])]));
    assert.equal(exact.status, 200, 'justo 5 MB entra');
    const k = await upload(c, code, 'otra', jpeg());
    assert.equal(k.status, 400); assert.equal(k.json.error, 'bad_kind');
    const u = await upload(env.client(), 'ZZZZ-ZZZZ-ZZZZ', 'letter', jpeg());
    assert.equal(u.status, 404); assert.equal(u.json.error, 'not_found');
    // Los rechazos no dejan archivos ni filas de mas.
    assert.equal(env.db.prepare('SELECT COUNT(*) c FROM claim_files').get().c, 3);
    assert.equal(filesOnDisk().length, 3);
  });

  test('volver a subir el mismo tipo reemplaza el archivo anterior (y lo borra del disco)', async () => {
    const before = env.db.prepare(`SELECT stored_name FROM claim_files WHERE kind='dni_front'`).get().stored_name;
    assert.equal((await upload(c, code, 'dni_front', jpeg(5000))).status, 200);
    const after = env.db.prepare(`SELECT stored_name FROM claim_files WHERE kind='dni_front'`).get().stored_name;
    assert.notEqual(before, after);
    assert.ok(!filesOnDisk().includes(before));
    assert.equal(filesOnDisk().length, 3);
  });

  test('la selfie es opcional y se puede quitar; el resto no', async () => {
    assert.equal((await upload(c, code, 'selfie', jpeg())).status, 200);
    const rm = await c.call('DELETE', '/api/claims/files/selfie', {}, { headers: { 'x-claim-code': code } });
    assert.equal(rm.status, 200); assert.equal(rm.json.removed, true);
    const bad = await c.call('DELETE', '/api/claims/files/dni_front', {}, { headers: { 'x-claim-code': code } });
    assert.equal(bad.status, 400);
  });

  test('no se puede enviar sin los 3 obligatorios (422) y luego se envia; ya enviado no admite cambios', async () => {
    const c2 = env.client();
    const code2 = (await c2.post('/api/claims', claimBody())).json.code;
    await upload(c2, code2, 'dni_front', jpeg());
    const s = await submit(c2, code2);
    assert.equal(s.status, 422);
    assert.deepEqual(s.json.missing, ['dni_back', 'letter']);
    await upload(c2, code2, 'dni_back', jpeg()); await upload(c2, code2, 'letter', jpeg());
    assert.equal((await submit(c2, code2)).status, 200);
    assert.equal((await upload(c2, code2, 'letter', jpeg())).status, 409);
    assert.equal((await submit(c2, code2)).status, 409);
  });
});

describe('CSRF de la subida', () => {
  let c, code;
  before(async () => { closeOpen(); c = env.client(); code = (await c.post('/api/claims', claimBody())).json.code; });
  const put = (extra, type = 'image/jpeg', ccode = code) =>
    c.call('PUT', '/api/claims/files/dni_front', undefined, { rawBody: jpeg(), headers: { 'content-type': type, 'x-claim-code': ccode, ...extra } });

  test('Origin ajeno o cross-site -> 403 aunque el tipo sea imagen', async () => {
    assert.equal((await put({ origin: 'http://evil.example' })).status, 403);
    assert.equal((await put({ 'sec-fetch-site': 'cross-site' })).status, 403);
    assert.equal((await put({ origin: env.base })).status, 200, 'Origin propio pasa');
  });
  test('la excepcion es solo para PUT /claims/files/:kind con imagen', async () => {
    assert.equal((await put({}, 'application/octet-stream')).status, 415);
    assert.equal((await put({}, 'text/plain')).status, 415);
    assert.equal((await put({}, 'multipart/form-data; boundary=x')).status, 415);
    const login = await c.call('PUT', '/api/auth/login', undefined, { rawBody: jpeg(), headers: { 'content-type': 'image/jpeg' } });
    assert.equal(login.status, 415);
    const post = await c.call('POST', '/api/claims/files/dni_front', undefined, { rawBody: jpeg(), headers: { 'content-type': 'image/jpeg', 'x-claim-code': code } });
    assert.equal(post.status, 415);
    const reject = await c.call('POST', '/api/admin/central/claims/1/reject', undefined, { rawBody: jpeg(), headers: { 'content-type': 'image/png' } });
    assert.equal(reject.status, 415);
  });
  test('el resto de la API sigue exigiendo JSON', async () => {
    const r = await c.call('POST', '/api/claims', undefined, { rawBody: 'a=1', headers: { 'content-type': 'application/x-www-form-urlencoded' } });
    assert.equal(r.status, 415);
  });
});

describe('estado por codigo', () => {
  test('muestra solo el estado, sin nombre, DNI, contacto ni cuenta; acepta minusculas y sin guiones', async () => {
    closeOpen();
    const f = await fullClaim(env);
    const c = env.client();
    for (const form of [f.code, f.code.toLowerCase(), f.code.replace(/-/g, '').toLowerCase()]) {
      const r = await status(c, form);
      assert.equal(r.status, 200);
      assert.equal(r.json.status, 'pending');
      assert.deepEqual(Object.keys(r.json).sort(), ['expiresAt', 'resolvedAt', 'status', 'submittedAt']);
      assert.equal(r.headers.get('cache-control'), 'no-store');
      const txt = JSON.stringify(r.json);
      for (const secret of [PII.dni, PII.name, 'titular@example.com', '912345678', 'Titular']) assert.ok(!txt.includes(secret));
    }
  });
  test('codigo inexistente o mal formado: la misma respuesta 404; bloqueo tras 10 fallos por IP', async () => {
    closeOpen();
    const c = env.client();
    const a = await status(c, 'ZZZZ-ZZZZ-ZZZZ'); const b = await status(c, 'xx');
    assert.equal(a.status, 404); assert.deepEqual(a.json, b.json); assert.deepEqual(a.json, { error: 'not_found' });
    for (let i = 0; i < 8; i++) await status(c, 'ZZZZ-ZZZZ-ZZZY');
    const locked = await status(c, 'ZZZZ-ZZZZ-ZZZY');
    assert.equal(locked.status, 429);
    assert.ok(locked.json.retryAfter > 0);
    // Bloqueado incluso con un codigo bueno (no sirve para adivinar).
    const f = await fullClaim(env);
    assert.equal((await status(c, f.code)).status, 429);
    assert.equal((await status(env.client(), f.code)).status, 200, 'otra IP no se ve afectada');
  });
});

describe('limites', () => {
  test('3 reclamos nuevos por IP cada 24 h', async () => {
    closeOpen();
    const c = env.client();
    for (let i = 0; i < 3; i++) assert.equal((await c.post('/api/claims', claimBody())).status, 201, `n${i}`);
    const r = await c.post('/api/claims', claimBody());
    assert.equal(r.status, 429); assert.ok(r.json.retryAfter > 23 * 3600);
    closeOpen();
    env.clock.now += 25 * HOUR;
    assert.equal((await c.post('/api/claims', claimBody())).status, 201);
    env.clock.now -= 25 * HOUR;
  });
  test('3 abiertos por DNI', async () => {
    env.db.prepare(`UPDATE claims SET status='expired' WHERE status IN ('draft','pending')`).run();
    for (let i = 0; i < 3; i++) assert.equal((await env.client().post('/api/claims', claimBody())).status, 201);
    const r = await env.client().post('/api/claims', claimBody());
    assert.equal(r.status, 409); assert.equal(r.json.error, 'too_many_open');
  });
  test('200 abiertos en total', async () => {
    env.db.prepare(`UPDATE claims SET status='expired' WHERE status IN ('draft','pending')`).run();
    const ins = env.db.prepare(`INSERT INTO claims (code_hash,status,dni_hash,dni_hint,consent_at,consent_version,created_at) VALUES (?, 'pending', ?, '000', 1, 'x', ?)`);
    env.db.transaction(() => { for (let i = 0; i < CLAIMS.MAX_OPEN_TOTAL; i++) ins.run(`h${i}`, `d${i}`, env.clock.now); })();
    const r = await env.client().post('/api/claims', claimBody());
    assert.equal(r.status, 503); assert.equal(r.json.error, 'claims_full');
    env.db.prepare(`DELETE FROM claims WHERE code_hash LIKE 'h%'`).run();
  });
  test('10 intentos de crear por IP en 15 min (el DNI no se puede sondear)', async () => {
    const c = env.client();
    for (let i = 0; i < 10; i++) await c.post('/api/claims', claimBody({ dni: '99999999' }));
    const r = await c.post('/api/claims', claimBody({ dni: '99999999' }));
    assert.equal(r.status, 429);
  });
});

describe('acceso del admin', () => {
  let claim;
  before(async () => { closeOpen(); claim = await fullClaim(env, {}, { selfie: true }); });
  const urls = () => [
    '/api/admin/central/claims', `/api/admin/central/claims/${claim.id}`, `/api/admin/central/claims/${claim.id}/files/dni_front`,
  ];
  test('sin sesion 401; cliente 403; personal de sede 403; admin central 200', async () => {
    for (const u of urls()) assert.equal((await env.client().get(u)).status, 401, u);
    const cust = await makeCustomer(env, { dni: '20000001', email: 'v1@example.com', phone: '911111111' });
    for (const u of urls()) assert.equal((await cust.get(u)).status, 403, u);
    const mgr = env.client();
    assert.equal((await mgr.post('/api/auth/login', { email: 'sarah.mitchell@cinerama.com', password: DEMO_PASSWORD })).status, 200);
    for (const u of urls()) assert.equal((await mgr.get(u)).status, 403, u);
    for (const m of ['approve', 'reject']) assert.equal((await mgr.post(`/api/admin/central/claims/${claim.id}/${m}`, {})).status, 403);
    for (const u of urls()) assert.equal((await admin.get(u)).status, 200, u);
  });
  test('archivos: cabeceras privadas y tipo real', async () => {
    const r = await admin.get(`/api/admin/central/claims/${claim.id}/files/dni_back`);
    assert.equal(r.headers.get('content-type'), 'image/png');
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
    assert.match(r.headers.get('content-disposition'), /^inline; filename="reclamo-\d+-dni_back\.png"$/);
    assert.equal(r.headers.get('content-security-policy'), "default-src 'none'; sandbox");
    assert.equal(r.headers.get('cross-origin-resource-policy'), 'same-origin');
    const dl = await admin.get(`/api/admin/central/claims/${claim.id}/files/dni_back?download=1`);
    assert.match(dl.headers.get('content-disposition'), /^attachment;/);
    assert.equal((await admin.get(`/api/admin/central/claims/${claim.id}/files/otra`)).status, 404);
    assert.equal((await admin.get(`/api/admin/central/claims/99999/files/dni_back`)).status, 404);
  });
  test('detalle: datos del reclamo, archivos, cuenta objetivo y avisos', async () => {
    const r = await admin.get(`/api/admin/central/claims/${claim.id}`);
    assert.equal(r.json.status, 'pending');
    assert.equal(r.json.dni, PII.dni);
    assert.equal(r.json.name, 'Titular Real Gomez');
    assert.deepEqual(r.json.files.map((f) => f.kind).sort(), ['dni_back', 'dni_front', 'letter', 'selfie']);
    assert.equal(r.json.target.name, PII.name);
    assert.equal(r.json.target.emailMasked, 'a***@example.com');
    assert.ok(r.json.warnings.includes('target_active'));
    assert.equal(r.json.requiresAck, true);
    assert.ok(!JSON.stringify(r.json).includes(PII.email), 'el correo de la cuenta va enmascarado');
    const list = await admin.get('/api/admin/central/claims');
    assert.ok(list.json.claims.some((x) => x.id === claim.id));
    assert.ok(!JSON.stringify(list.json).includes(PII.dni), 'la lista no lleva el DNI completo');
  });
  test('un reclamo en borrador no es visible para el admin', async () => {
    const c = env.client();
    await c.post('/api/claims', claimBody());
    const id = env.db.prepare(`SELECT id FROM claims WHERE status='draft' ORDER BY id DESC LIMIT 1`).get().id;
    assert.equal((await admin.get(`/api/admin/central/claims/${id}`)).status, 404);
  });
});

describe('contrasena de demostracion', () => {
  test('con la contrasena de demostracion el admin queda bloqueado (lista, archivos, aprobar, rechazar)', async () => {
    const e2 = await startEnv();
    try {
      const target = e2.client();
      const reg = await target.post('/api/auth/register', regBody());
      await target.post('/api/auth/verify-phone', { code: reg.json.simulation.code });
      const f = await fullClaim(e2);
      const a = e2.client();
      assert.equal((await a.post('/api/auth/login', { email: ADMIN, password: DEMO_PASSWORD })).status, 200);
      for (const [m, u, b] of [
        ['get', '/api/admin/central/claims'], ['get', `/api/admin/central/claims/${f.id}`],
        ['get', `/api/admin/central/claims/${f.id}/files/dni_front`],
        ['post', `/api/admin/central/claims/${f.id}/approve`, { confirm: true, ackActiveAccount: true }],
        ['post', `/api/admin/central/claims/${f.id}/reject`, { reasonCode: 'illegible' }],
      ]) {
        const r = await a[m](u, b);
        assert.equal(r.status, 403, u); assert.equal(r.json.error, 'demo_password', u);
      }
      assert.equal(e2.db.prepare('SELECT status FROM claims WHERE id = ?').get(f.id).status, 'pending');
      assert.equal(fs.readdirSync(path.join(path.dirname(e2.dbFile), 'claims')).length, 3, 'nada se toco');
      // Cambiar la contrasena (las sesiones se cierran) desbloquea.
      assert.deepEqual(await setPassword(e2.db, ADMIN, ADMIN_PASS), { ok: true });
      assert.equal((await a.get('/api/admin/central/claims')).status, 401, 'la sesion anterior se cerro');
      const b = e2.client();
      await b.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      assert.equal((await b.get('/api/admin/central/claims')).status, 200);
    } finally { await e2.stop(); }
  });
});

describe('set-password', () => {
  test('funcion: valida, no acepta la clave de demostracion y cierra sesiones', async () => {
    const e2 = await startEnv();
    try {
      assert.equal((await setPassword(e2.db, 'nadie@x.com', 'abcdefgh1')).error, 'not_found');
      assert.equal((await setPassword(e2.db, ADMIN, 'corta')).error, 'password_short');
      assert.equal((await setPassword(e2.db, ADMIN, 'x'.repeat(129))).error, 'password_long');
      assert.equal((await setPassword(e2.db, ADMIN, DEMO_PASSWORD)).error, 'password_demo');
      const a = e2.client();
      await a.post('/api/auth/login', { email: ADMIN, password: DEMO_PASSWORD });
      assert.equal((await a.get('/api/auth/me')).json.user.role, 'admin');
      assert.deepEqual(await setPassword(e2.db, 'ADMIN@cinerama.com', 'nueva-clave-segura-9'), { ok: true });
      assert.equal((await a.get('/api/auth/me')).json.user, null);
      assert.equal((await e2.client().post('/api/auth/login', { email: ADMIN, password: DEMO_PASSWORD })).status, 401);
      assert.equal((await e2.client().post('/api/auth/login', { email: ADMIN, password: 'nueva-clave-segura-9' })).status, 200);
    } finally { await e2.stop(); }
  });
  test('comando: pide la clave por la entrada (sin argumento), no la imprime y cambia la base', async () => {
    const e2 = await startEnv();
    try {
      const secret = 'clave-por-tuberia-77';
      const run = (input, email = ADMIN) => spawnSync(process.execPath, ['server/setPassword.js', email], {
        input, encoding: 'utf8', env: { ...process.env, CINERAMA_DB: e2.dbFile },
      });
      const bad = run(`${secret}\notra-distinta\n`);
      assert.equal(bad.status, 1);
      assert.match(bad.stderr, /no coinciden/);
      const demo = run(`${DEMO_PASSWORD}\n${DEMO_PASSWORD}\n`);
      assert.equal(demo.status, 1);
      const ok = run(`${secret}\n${secret}\n`);
      assert.equal(ok.status, 0, ok.stderr);
      assert.ok(!(ok.stdout + ok.stderr).includes(secret), 'la contrasena no aparece en la salida');
      assert.equal((await e2.client().post('/api/auth/login', { email: ADMIN, password: secret })).status, 200);
      assert.equal(spawnSync(process.execPath, ['server/setPassword.js'], { encoding: 'utf8' }).status, 2);
      assert.equal(run('a\na\n', 'nadie@x.com').status, 1);
    } finally { await e2.stop(); }
  });
});

describe('aprobar', () => {
  test('exige confirmacion, y reconocimiento si la cuenta esta activa', async () => {
    const e2 = await startEnv();
    try {
      const a = e2.client(); await setPassword(e2.db, ADMIN, ADMIN_PASS); await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      await makeCustomer(e2);
      const f = await fullClaim(e2);
      const base = `/api/admin/central/claims/${f.id}`;
      assert.equal((await a.post(`${base}/approve`, {})).json.error, 'confirm_required');
      assert.equal((await a.post(`${base}/approve`, { confirm: true })).json.error, 'ack_required');
      assert.equal(e2.db.prepare('SELECT status FROM claims WHERE id=?').get(f.id).status, 'pending');
    } finally { await e2.stop(); }
  });

  test('suspende la cuenta, libera el DNI, cierra sesiones, tombstone solo si coincide, y reserva 7 dias', async () => {
    const e2 = await startEnv();
    try {
      const a = e2.client(); await setPassword(e2.db, ADMIN, ADMIN_PASS); await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      // Cuenta del "ocupante": mismo DNI, su propio correo y celular.
      const squatter = await makeCustomer(e2);
      assert.equal((await squatter.get('/api/auth/me')).json.user.email, PII.email);
      // Reclamo de la titular con OTRO correo y celular (no coinciden: no se toca el de la cuenta).
      const f = await fullClaim(e2, { email: 'titular@example.com', phone: '912345678' });
      const g = await fullClaim(e2, { email: 'otro@example.com', phone: '923456789' }); // segundo reclamo, mismo DNI
      const ap = await a.post(`/api/admin/central/claims/${f.id}/approve`, { confirm: true, ackActiveAccount: true });
      assert.equal(ap.status, 200, JSON.stringify(ap.json));
      assert.equal(ap.json.targetSuspended, true);
      assert.deepEqual(ap.json.tombstoned, []);
      assert.equal(ap.json.superseded, 1);
      assert.equal(ap.json.filesPurged, true);

      const u = e2.db.prepare('SELECT * FROM users WHERE email = ?').get(PII.email);
      assert.equal(u.status, 'suspended');
      assert.equal(u.dni_hash, null, 'el DNI queda libre (indice unico parcial)');
      assert.equal(u.phone, '987654321', 'correo y celular de la cuenta se conservan si no coinciden');
      assert.equal(e2.db.prepare('SELECT COUNT(*) c FROM sessions WHERE user_id = ?').get(u.id).c, 0);
      assert.equal((await squatter.get('/api/auth/me')).json.user, null, 'su sesion ya no sirve');
      const login = await e2.client().post('/api/auth/login', { email: PII.email, password: PII.password });
      assert.equal(login.status, 403); assert.equal(login.json.error, 'account_suspended');
      const wrong = await e2.client().post('/api/auth/login', { email: PII.email, password: 'incorrecta-1234' });
      assert.equal(wrong.status, 401, 'sin la contrasena correcta no se revela el motivo');

      const cl = e2.db.prepare('SELECT * FROM claims WHERE id = ?').get(f.id);
      assert.equal(cl.status, 'approved'); assert.equal(cl.target_user_id, u.id); assert.ok(cl.resolved_by);
      assert.equal(cl.reserved_until, e2.clock.now + 7 * DAY);
      assert.equal(e2.db.prepare('SELECT status, reason_code FROM claims WHERE id = ?').get(g.id).status, 'superseded');
      assert.equal(fs.readdirSync(path.join(path.dirname(e2.dbFile), 'claims')).length, 0);

      // Reserva: otra persona (otro correo) no puede registrar ese DNI; la del reclamo si.
      const other = await e2.client().post('/api/auth/register', regBody({ email: 'intruso@example.com', phone: '955555555' }));
      assert.equal(other.status, 409); assert.deepEqual(other.json.errors, { dni: 'dni_reserved' });
      const owner = e2.client();
      const reg = await owner.post('/api/auth/register', regBody({ name: 'Titular Real Gomez', email: 'Titular@Example.com', phone: '912345678' }));
      assert.equal(reg.status, 201, JSON.stringify(reg.json));
      assert.equal((await owner.post('/api/auth/verify-phone', { code: reg.json.simulation.code })).status, 200);
      assert.equal(e2.db.prepare(`SELECT COUNT(*) c FROM users WHERE status='active' AND dni_hash IS NOT NULL AND email = 'titular@example.com'`).get().c, 1);
    } finally { await e2.stop(); }
  });

  test('tras 7 dias la reserva vence para todos y se borra la huella del correo', async () => {
    const e2 = await startEnv();
    try {
      const a = e2.client(); await setPassword(e2.db, ADMIN, ADMIN_PASS); await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      await makeCustomer(e2);
      const f = await fullClaim(e2);
      await a.post(`/api/admin/central/claims/${f.id}/approve`, { confirm: true, ackActiveAccount: true });
      assert.equal((await e2.client().post('/api/auth/register', regBody({ email: 'intruso@example.com', phone: '955555555' }))).status, 409);
      e2.clock.now += 7 * DAY + 1000;
      const reg = await e2.client().post('/api/auth/register', regBody({ email: 'intruso@example.com', phone: '955555555' }));
      assert.equal(reg.status, 201, 'ya no esta reservado');
      const adminRe = e2.client(); await adminRe.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      await adminRe.get('/api/admin/central/claims'); // dispara el barrido
      assert.equal(e2.db.prepare('SELECT contact_hash FROM claims WHERE id=?').get(f.id).contact_hash, null);
    } finally { await e2.stop(); }
  });

  test('la titular que reclamo SU PROPIA cuenta (mismo correo y celular) puede volver a registrarse: tombstone', async () => {
    const e2 = await startEnv();
    try {
      const a = e2.client(); await setPassword(e2.db, ADMIN, ADMIN_PASS); await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      await makeCustomer(e2);
      const f = await fullClaim(e2, { email: PII.email.toUpperCase(), phone: '+51 987 654 321', name: PII.name });
      const ap = await a.post(`/api/admin/central/claims/${f.id}/approve`, { confirm: true, ackActiveAccount: true });
      assert.deepEqual(ap.json.tombstoned.sort(), ['email', 'phone']);
      const u = e2.db.prepare('SELECT * FROM users WHERE status = ?').get('suspended');
      assert.equal(u.email, `suspendida-${u.id}@cinerama.invalid`);
      assert.equal(u.phone, null);
      const reg = await e2.client().post('/api/auth/register', regBody());
      assert.equal(reg.status, 201, JSON.stringify(reg.json));
    } finally { await e2.stop(); }
  });

  test('personal: bloqueado; sin cuenta: se aprueba igual; segunda aprobacion: not_pending', async () => {
    const e2 = await startEnv();
    try {
      const a = e2.client(); await setPassword(e2.db, ADMIN, ADMIN_PASS); await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      const c = await makeCustomer(e2);
      const f = await fullClaim(e2);
      const user = e2.db.prepare('SELECT id FROM users WHERE email = ?').get(PII.email);
      e2.db.prepare(`UPDATE users SET role = 'cashier' WHERE id = ?`).run(user.id);
      const staff = await a.post(`/api/admin/central/claims/${f.id}/approve`, { confirm: true, ackActiveAccount: true });
      assert.equal(staff.status, 409); assert.equal(staff.json.error, 'target_is_staff');
      assert.ok((await a.get(`/api/admin/central/claims/${f.id}`)).json.warnings.includes('target_is_staff'));
      assert.equal(e2.db.prepare('SELECT status FROM users WHERE id=?').get(user.id).status, 'active', 'no se toco la cuenta');
      assert.equal(fs.readdirSync(path.join(path.dirname(e2.dbFile), 'claims')).length, 3, 'ni los archivos');
      e2.db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
      e2.db.prepare('DELETE FROM users WHERE id = ?').run(user.id);
      void c;
      const ok = await a.post(`/api/admin/central/claims/${f.id}/approve`, { confirm: true });
      assert.equal(ok.status, 200); assert.equal(ok.json.targetSuspended, false);
      assert.equal((await a.post(`/api/admin/central/claims/${f.id}/approve`, { confirm: true })).json.error, 'not_pending');
      assert.equal((await a.post(`/api/admin/central/claims/${f.id}/reject`, { reasonCode: 'illegible' })).json.error, 'not_pending');
    } finally { await e2.stop(); }
  });

  test('aprobaciones simultaneas: solo una gana', async () => {
    const e2 = await startEnv();
    try {
      const a = e2.client(); await setPassword(e2.db, ADMIN, ADMIN_PASS); await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      await makeCustomer(e2);
      const f = await fullClaim(e2);
      const rs = await Promise.all([1, 2, 3].map(() => a.post(`/api/admin/central/claims/${f.id}/approve`, { confirm: true, ackActiveAccount: true })));
      assert.deepEqual(rs.map((r) => r.status).sort(), [200, 409, 409]);
    } finally { await e2.stop(); }
  });

  test('avisos: correo o celular del reclamo ya usados por otra cuenta', async () => {
    const e2 = await startEnv();
    try {
      const a = e2.client(); await setPassword(e2.db, ADMIN, ADMIN_PASS); await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      await makeCustomer(e2);
      await makeCustomer(e2, { dni: '20000001', email: 'v1@example.com', phone: '911111111' });
      const f = await fullClaim(e2, { email: 'v1@example.com', phone: '911111111' });
      const w = (await a.get(`/api/admin/central/claims/${f.id}`)).json.warnings;
      assert.ok(w.includes('email_in_use') && w.includes('phone_in_use'));
    } finally { await e2.stop(); }
  });
});

describe('rechazar', () => {
  test('motivo obligatorio (otro exige nota); el motivo lo ve quien reclamo; se borran archivos y datos', async () => {
    const e2 = await startEnv();
    try {
      const a = e2.client(); await setPassword(e2.db, ADMIN, ADMIN_PASS); await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      await makeCustomer(e2);
      const f = await fullClaim(e2, {}, { selfie: true });
      const dir = path.join(path.dirname(e2.dbFile), 'claims');
      const names = fs.readdirSync(dir);
      assert.equal(names.length, 4);
      for (const n of names) assert.equal(mode(path.join(dir, n)), 0o600);
      assert.equal(mode(dir), 0o700);

      const u = `/api/admin/central/claims/${f.id}/reject`;
      assert.equal((await a.post(u, {})).json.error, 'reason_required');
      assert.equal((await a.post(u, { reasonCode: 'inventado' })).json.error, 'reason_required');
      assert.equal((await a.post(u, { reasonCode: 'other' })).json.error, 'note_required');
      assert.equal(fs.readdirSync(dir).length, 4, 'los rechazos invalidos no borran nada');

      const r = await a.post(u, { reasonCode: 'other', note: '  La carta no   tiene firma.  '.padEnd(400, 'x') });
      assert.equal(r.status, 200); assert.equal(r.json.filesPurged, true);
      assert.deepEqual(fs.readdirSync(dir), [], 'directorio vacio');
      assert.equal(e2.db.prepare('SELECT COUNT(*) c FROM claim_files').get().c, 0);

      const row = e2.db.prepare('SELECT * FROM claims WHERE id=?').get(f.id);
      assert.equal(row.status, 'rejected');
      assert.equal(row.reason_note.length, CLAIMS.NOTE_MAX);
      for (const k of ['name', 'email', 'phone', 'dni_plain', 'target_user_id', 'contact_hash']) assert.equal(row[k], null, k);
      assert.equal(row.dni_hint, '678');
      const st = await status(e2.client(), f.code);
      assert.equal(st.json.status, 'rejected');
      assert.match(st.json.reason.note, /^La carta no tiene firma\./);
      assert.equal(st.json.reason.code, 'other');
      assert.equal(e2.db.prepare('SELECT status FROM users WHERE email=?').get(PII.email).status, 'active', 'rechazar no toca la cuenta');
      assert.equal((await a.get(`/api/admin/central/claims/${f.id}/files/dni_front`)).status, 404);
      const d = (await a.get(`/api/admin/central/claims/${f.id}`)).json;
      assert.equal(d.dni, null); assert.deepEqual(d.files, []);
    } finally { await e2.stop(); }
  });
});

describe('borrado y su fallo', () => {
  test('tras aprobar no queda ningun dato personal en la base ni archivos; si falla el borrado queda delete_pending y se reintenta', async () => {
    const e2 = await startEnv();
    const dir = path.join(path.dirname(e2.dbFile), 'claims');
    try {
      const a = e2.client(); await setPassword(e2.db, ADMIN, ADMIN_PASS); await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      await makeCustomer(e2);
      const f = await fullClaim(e2, {}, { selfie: true });
      fs.chmodSync(dir, 0o500); // sin permiso de escritura: unlink falla con EACCES
      const ap = await a.post(`/api/admin/central/claims/${f.id}/approve`, { confirm: true, ackActiveAccount: true });
      assert.equal(ap.status, 200);
      assert.equal(ap.json.filesPurged, false, 'se informa que el borrado quedo pendiente');
      assert.equal(e2.db.prepare('SELECT status FROM claims WHERE id=?').get(f.id).status, 'approved', 'la decision se mantiene');
      assert.equal(fs.readdirSync(dir).length, 4);
      assert.equal(e2.db.prepare(`SELECT COUNT(*) c FROM claim_files WHERE delete_state='delete_pending'`).get().c, 4);
      // Mientras tanto nadie puede descargarlos.
      assert.equal((await a.get(`/api/admin/central/claims/${f.id}/files/dni_front`)).status, 404);
      const d = (await a.get(`/api/admin/central/claims/${f.id}`)).json;
      assert.equal(d.deletePending, true);
      assert.ok(e2.logs.some((l) => l.includes('EACCES')), 'el fallo se registra solo con su codigo');
      assert.ok(e2.logs.every((l) => !l.includes(PII.dni) && !l.includes(PII.name) && !l.includes(PII.email)));
      // Se restablece el permiso: el barrido automatico termina el trabajo.
      fs.chmodSync(dir, 0o700);
      const list = await a.get('/api/admin/central/claims'); // el listado dispara el barrido
      assert.equal(list.json.pendingDeletes, 0);
      assert.deepEqual(fs.readdirSync(dir), []);
      assert.equal(e2.db.prepare('SELECT COUNT(*) c FROM claim_files').get().c, 0);

      // La base no conserva nombre, correo, celular ni DNI del reclamo.
      const row = e2.db.prepare('SELECT * FROM claims WHERE id=?').get(f.id);
      const dump = JSON.stringify(row);
      for (const s of [PII.dni, 'Titular', 'titular@example.com', '912345678', f.code, f.code.replace(/-/g, '')]) assert.ok(!dump.includes(s), s);
      assert.equal(row.dni_hint, '678');
    } finally { fs.chmodSync(dir, 0o700); await e2.stop(); }
  });
});

describe('caducidades con reloj controlable', () => {
  test('un borrador caduca a 1 h: sube con 410, el barrido lo cierra y borra sus archivos', async () => {
    const e2 = await startEnv();
    const dir = path.join(path.dirname(e2.dbFile), 'claims');
    try {
      await makeCustomer(e2);
      const c = e2.client();
      const code = (await c.post('/api/claims', claimBody())).json.code;
      await upload(c, code, 'dni_front', jpeg());
      e2.clock.now += HOUR - 1000;
      assert.equal((await upload(c, code, 'dni_back', jpeg())).status, 200, 'a 59 min sigue vigente');
      e2.clock.now += 2000;
      const late = await upload(c, code, 'letter', jpeg());
      assert.equal(late.status, 410); assert.equal(late.json.error, 'draft_expired');
      assert.deepEqual(fs.readdirSync(dir), []);
      const row = e2.db.prepare('SELECT * FROM claims').get();
      assert.equal(row.status, 'expired'); assert.equal(row.name, null); assert.equal(row.dni_plain, null);
      const st = await status(e2.client(), code);
      assert.equal(st.json.status, 'expired');
      assert.equal((await submit(c, code)).status, 409);
    } finally { await e2.stop(); }
  });
  test('un reclamo pendiente caduca a los 30 dias con borrado de archivos', async () => {
    const e2 = await startEnv();
    const dir = path.join(path.dirname(e2.dbFile), 'claims');
    try {
      const a = e2.client(); await setPassword(e2.db, ADMIN, ADMIN_PASS); await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      await makeCustomer(e2);
      const f = await fullClaim(e2);
      e2.clock.now += 30 * DAY - 1000;
      const a2 = e2.client(); await a2.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      assert.equal((await a2.get('/api/admin/central/claims')).json.claims.length, 1);
      assert.equal(fs.readdirSync(dir).length, 3);
      e2.clock.now += 2000;
      const list = await a2.get('/api/admin/central/claims');
      assert.equal(list.json.claims.length, 0);
      assert.deepEqual(fs.readdirSync(dir), []);
      const st = await status(e2.client(), f.code);
      assert.equal(st.json.status, 'expired');
      assert.equal(st.json.reason.code, 'expired');
      assert.equal(e2.db.prepare('SELECT dni_plain FROM claims WHERE id=?').get(f.id).dni_plain, null);
    } finally { await e2.stop(); }
  });
  test('archivos huerfanos (sin fila) se borran pasada 1 h; los recientes no', async () => {
    const e2 = await startEnv();
    const dir = path.join(path.dirname(e2.dbFile), 'claims');
    try {
      const a = e2.client(); await setPassword(e2.db, ADMIN, ADMIN_PASS); await a.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      fs.writeFileSync(path.join(dir, 'a'.repeat(32)), 'x');
      fs.writeFileSync(path.join(dir, 'b'.repeat(32) + '.part'), 'x');
      fs.writeFileSync(path.join(dir, 'no-es-nuestro.txt'), 'x');
      e2.clock.now = Date.now();
      await a.get('/api/admin/central/claims').catch(() => {});
      const a2 = e2.client(); await a2.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      await a2.get('/api/admin/central/claims');
      assert.equal(fs.readdirSync(dir).length, 3, 'recientes: se conservan');
      e2.clock.now = Date.now() + 2 * HOUR;
      const a3 = e2.client(); await a3.post('/api/auth/login', { email: ADMIN, password: ADMIN_PASS });
      await a3.get('/api/admin/central/claims');
      assert.deepEqual(fs.readdirSync(dir), ['no-es-nuestro.txt'], 'solo se tocan nombres generados por el servidor');
    } finally { await e2.stop(); }
  });
});

describe('consola sin datos personales', () => {
  test('ningun DNI, nombre, correo, celular ni codigo de reclamo en lo que escribe el servidor', () => {
    const all = env.logs.join('\n');
    const codes = env.db.prepare('SELECT 1').all(); void codes;
    for (const s of [PII.dni, 'Titular', 'titular@example.com', '912345678', PII.email, PII.name, 'x-claim-code']) assert.ok(!all.includes(s), s);
    for (const line of all.split('\n').filter(Boolean)) assert.match(line, /^\[SMS simulado\] usuario #\d+: codigo \d{6}$/, line);
  });
});
