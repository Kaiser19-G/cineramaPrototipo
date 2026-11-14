import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA } from '../schema.js';
import { openDb } from '../db.js';
import { seed } from '../seed.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cinerama-mig-'));
const count = (db, t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
const TABLES = ['movies', 'branches', 'halls', 'movie_branch', 'screenings', 'users', 'orders', 'order_seats'];
const NEW_COLS = ['password_hash', 'dni_hash', 'dni_hint', 'phone', 'phone_verified_at', 'consent_at',
  'consent_version', 'created_at', 'pending_token_hash'];

test('migra una base existente (esquema de la fase 1): conserva usuarios y catalogo', () => {
  const dir = tmp();
  const file = path.join(dir, 'old.db');
  // Base "antigua": solo el esquema base (user_version 0) y la semilla.
  const old = new Database(file);
  old.pragma('foreign_keys = ON');
  old.exec(SCHEMA);
  seed(old);
  assert.equal(old.pragma('user_version', { simple: true }), 0);
  const before = Object.fromEntries(TABLES.map((t) => [t, count(old, t)]));
  const usersBefore = old.prepare('SELECT id,name,email,role,branch_id,status,last_login,avatar FROM users ORDER BY id').all();
  const cols0 = old.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  assert.ok(!cols0.includes('password_hash'));
  old.close();

  const db = openDb(file);
  assert.equal(db.pragma('user_version', { simple: true }), 2);
  assert.deepEqual(Object.fromEntries(TABLES.map((t) => [t, count(db, t)])), before);
  assert.equal(before.users, 8);
  assert.deepEqual(db.prepare('SELECT id,name,email,role,branch_id,status,last_login,avatar FROM users ORDER BY id').all(), usersBefore);
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  for (const c of NEW_COLS) assert.ok(cols.includes(c), c);
  for (const t of ['sessions', 'verification_codes', 'auth_throttle']) assert.equal(count(db, t), 0);
  const idx = db.prepare(`SELECT name FROM sqlite_master WHERE type='index'`).all().map((r) => r.name);
  for (const i of ['uq_users_email_ci', 'uq_users_dni', 'uq_users_phone']) assert.ok(idx.includes(i), i);
  // El personal queda con DNI/celular NULL (los indices parciales no chocan).
  assert.equal(db.prepare('SELECT COUNT(*) c FROM users WHERE dni_hash IS NULL AND phone IS NULL').get().c, 8);
  assert.equal(db.pragma('foreign_key_check').length, 0);
  db.close();

  // Idempotente: reabrir no vuelve a migrar ni falla.
  const again = openDb(file);
  assert.equal(again.pragma('user_version', { simple: true }), 2);
  assert.equal(count(again, 'users'), 8);
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('base nueva: llega al mismo esquema', () => {
  const dir = tmp();
  const db = openDb(path.join(dir, 'new.db'));
  assert.equal(db.pragma('user_version', { simple: true }), 2);
  const cols = db.prepare('PRAGMA table_info(users)').all().map((c) => c.name);
  for (const c of NEW_COLS) assert.ok(cols.includes(c), c);
  for (const t of ['sessions', 'verification_codes', 'auth_throttle']) assert.equal(count(db, t), 0);
  seed(db);
  assert.equal(count(db, 'users'), 8);
  // La semilla es repetible sin tocar las columnas de cuentas.
  db.prepare(`UPDATE users SET password_hash = 'x' WHERE id = 1`).run();
  seed(db);
  assert.equal(db.prepare('SELECT password_hash FROM users WHERE id = 1').get().password_hash, 'x');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('unicidad: correo sin distinguir mayusculas; DNI y celular unicos; NULL repetidos permitidos', () => {
  const dir = tmp();
  const db = openDb(path.join(dir, 'u.db'));
  const ins = db.prepare(`INSERT INTO users (name,email,role,status,dni_hash,phone) VALUES (?,?,?,?,?,?)`);
  ins.run('A', 'a@x.com', 'customer', 'active', 'h1', '911111111');
  assert.throws(() => ins.run('B', 'A@X.COM', 'customer', 'active', 'h2', '922222222'), /UNIQUE/);
  assert.throws(() => ins.run('B', 'b@x.com', 'customer', 'active', 'h1', '922222222'), /UNIQUE/);
  assert.throws(() => ins.run('B', 'b@x.com', 'customer', 'active', 'h2', '911111111'), /UNIQUE/);
  ins.run('C', 'c@x.com', 'customer', 'active', null, null);
  ins.run('D', 'd@x.com', 'customer', 'active', null, null);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
