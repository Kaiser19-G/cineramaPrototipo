import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import Database from 'better-sqlite3';
import { SCHEMA } from '../schema.js';
import { MIGRATIONS } from '../migrations.js';
import { openDb } from '../db.js';
import { seed } from '../seed.js';
import { seedDemoCredentials } from '../seedAuth.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cinerama-mig3-'));
const count = (db, t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

// Una base como la que deja la fase 2b: esquema + migraciones 1 y 2, salas solo en las sedes 1 a 4 y calificaciones antiguas.
async function phase2bDb(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  MIGRATIONS[0](db); MIGRATIONS[1](db);
  db.pragma('user_version = 2');
  seed(db); await seedDemoCredentials(db);
  db.prepare('DELETE FROM halls WHERE id > 9').run();
  db.prepare(`UPDATE movies SET rating = 'PG' WHERE id = 1`).run();
  db.prepare(`UPDATE movies SET rating = 'PG-14' WHERE id = 5`).run();
  db.prepare(`UPDATE movies SET rating = 'R' WHERE id = 7`).run();
  db.prepare(`UPDATE movies SET rating = 'PG-13' WHERE id = 2`).run();
  db.prepare(`UPDATE movies SET rating = 'NC-17' WHERE id = 3`).run();
  db.prepare(`UPDATE movies SET rating = 'G' WHERE id = 4`).run();
  db.prepare(`UPDATE movies SET rating = 'TE' WHERE id = 6`).run();   // desconocido: no se toca
  db.prepare(`UPDATE users SET status = 'inactive', role = 'cashier' WHERE id = 2`).run(); // cambios hechos a mano
  db.prepare(`INSERT INTO users (name,email,role,status,dni_hash,dni_hint,phone,created_at) VALUES ('Cliente','c3@example.com','customer','active',?,?,?,?)`)
    .run('e'.repeat(64), '123', '922222222', 1);
  return db;
}

test('migracion 3 sobre una base de la fase 2b: conserva todo y solo cambia calificaciones y salas faltantes', async () => {
  const dir = tmp();
  const file = path.join(dir, 'fase2b.db');
  const old = await phase2bDb(file);
  assert.equal(old.pragma('user_version', { simple: true }), 2);
  assert.equal(count(old, 'halls'), 9);
  const tables = old.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
  const dump = (db) => Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
  const before = dump(old);
  old.close();

  const db = openDb(file);
  assert.equal(db.pragma('user_version', { simple: true }), MIGRATIONS.length);
  const after = dump(db);
  const project = (t, rows) => rows.map((r) => Object.fromEntries(Object.keys(before[t][0] ?? r).filter((k) => k in r).map((k) => [k, r[k]])));

  // 1. Ninguna tabla cambia salvo movies (calificacion) y halls (filas nuevas).
  for (const t of tables) {
    if (t === 'movies' || t === 'halls') continue;
    assert.deepEqual(project(t, after[t]), before[t], `${t} sin cambios`);
  }
  // 2. Peliculas: solo cambia rating, con la conversion acordada.
  const strip = (rows) => rows.map((r) => { const c = { ...r }; delete c.rating; return c; });
  assert.deepEqual(strip(project('movies', after.movies)), strip(before.movies));
  const rating = Object.fromEntries(after.movies.map((m) => [m.id, m.rating]));
  assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((i) => rating[i]), ['APT', '+14', '+18', 'APT', '+14', 'TE', '+18']);
  assert.equal(rating[8], 'APT'); // 'PG' del ejemplo, ya convertida por la semilla nueva
  // 3. Salas: las 9 existentes intactas y 25 nuevas, solo en sedes sin salas, coherentes con halls_count.
  assert.deepEqual(after.halls.slice(0, 9), before.halls);
  assert.equal(after.halls.length, 9 + 25);
  const perBranch = Object.fromEntries(db.prepare('SELECT branch_id b, COUNT(*) c FROM halls GROUP BY branch_id').all().map((r) => [r.b, r.c]));
  for (const b of db.prepare('SELECT id, halls_count FROM branches').all()) assert.equal(perBranch[b.id], b.halls_count, `sede ${b.id}`);
  assert.ok(after.halls.slice(9).every((h) => h.branch_id >= 5 && h.status === 'active' && h.capacity > 0 && h.price_base > 0));
  // 4. Columnas y tablas nuevas.
  for (const c of ['version', 'created_at', 'updated_at', 'updated_by']) assert.ok(cols(db, 'movies').includes(c), c);
  for (const c of ['version', 'created_by', 'created_at', 'updated_at', 'cancelled_at', 'cancelled_by', 'cancel_reason']) assert.ok(cols(db, 'screenings').includes(c), c);
  for (const c of ['must_change_password', 'created_by', 'updated_at']) assert.ok(cols(db, 'users').includes(c), c);
  assert.equal(count(db, 'audit_log'), 0);
  assert.ok(db.prepare(`SELECT name FROM sqlite_master WHERE name = 'idx_screenings_hall_date'`).get());
  assert.ok(after.movies.every((m) => m.version === 1));
  assert.ok(after.screenings.every((s) => s.version === 1));
  assert.ok(after.users.every((u) => u.must_change_password === 0));
  assert.equal(db.pragma('foreign_key_check').length, 0);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  db.close();

  // Idempotente
  const again = openDb(file);
  assert.equal(again.pragma('user_version', { simple: true }), MIGRATIONS.length);
  assert.equal(count(again, 'halls'), 34);
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('migracion 3 sobre base nueva: sin salas hasta sembrar; la semilla deja las salas coherentes', () => {
  const dir = tmp();
  const db = openDb(path.join(dir, 'new.db'));
  assert.equal(db.pragma('user_version', { simple: true }), MIGRATIONS.length);
  assert.equal(count(db, 'halls'), 0);
  seed(db);
  assert.equal(count(db, 'halls'), 34);
  const perBranch = Object.fromEntries(db.prepare('SELECT branch_id b, COUNT(*) c FROM halls GROUP BY branch_id').all().map((r) => [r.b, r.c]));
  for (const b of db.prepare('SELECT id, halls_count FROM branches').all()) assert.equal(perBranch[b.id], b.halls_count);
  // calificaciones peruanas y fechas relativas (ningun estreno en el pasado lejano ni cierre vencido)
  assert.ok(db.prepare('SELECT rating FROM movies').all().every((m) => ['APT', '+14', '+18'].includes(m.rating)));
  const today = new Date().toISOString().slice(0, 10);
  assert.ok(db.prepare('SELECT end_date FROM movies').all().every((m) => m.end_date > today));
  assert.ok(db.prepare('SELECT end_date FROM movie_branch').all().every((m) => m.end_date > today));
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('la semilla no pisa datos existentes', async () => {
  const dir = tmp();
  const db = openDb(path.join(dir, 'seed.db'));
  seed(db); await seedDemoCredentials(db);
  db.prepare(`UPDATE movies SET title = 'Editada en el panel', status = 'archived', featured = 1 WHERE id = 2`).run();
  db.prepare(`UPDATE users SET role = 'support', status = 'inactive', branch_id = 3 WHERE id = 3`).run();
  db.prepare(`UPDATE screenings SET price = 99, status = 'cancelled' WHERE id = 1`).run();
  db.prepare(`UPDATE halls SET status = 'maintenance' WHERE id = 1`).run();
  db.prepare(`UPDATE movie_branch SET active = 0 WHERE id = 1`).run();
  db.prepare(`INSERT INTO movies (title,duration,formats_json) VALUES ('Nueva',90,'["2D"]')`).run();
  const snapshot = () => JSON.stringify(['movies', 'users', 'screenings', 'halls', 'movie_branch', 'branches', 'orders', 'order_seats']
    .map((t) => db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()));
  const before = snapshot();
  seed(db);
  assert.equal(snapshot(), before);
  assert.equal(db.prepare('SELECT title FROM movies WHERE id = 2').get().title, 'Editada en el panel');
  // --refresh-screenings: solo las funciones de ejemplo vuelven a sus datos; lo demas sigue igual
  seed(db, { refreshScreenings: true });
  assert.equal(db.prepare('SELECT price FROM screenings WHERE id = 1').get().price, 35);
  assert.equal(db.prepare('SELECT title FROM movies WHERE id = 2').get().title, 'Editada en el panel');
  assert.equal(db.prepare('SELECT role FROM users WHERE id = 3').get().role, 'support');
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('npm run seed: sin banderas no toca una base con datos; --reset la recrea', () => {
  const dir = tmp();
  const file = path.join(dir, 'cli.db');
  const run = (...args) => spawnSync(process.execPath, ['server/seed.js', ...args], {
    cwd: path.resolve(import.meta.dirname, '../..'), env: { ...process.env, CINERAMA_DB: file }, encoding: 'utf8',
  });
  let r = run();
  assert.equal(r.status, 0, r.stderr);
  const db = new Database(file);
  db.prepare(`UPDATE movies SET title = 'Hecha a mano' WHERE id = 1`).run();
  db.prepare(`UPDATE users SET status = 'inactive' WHERE id = 5 OR id = 2`).run();
  db.close();
  r = run();
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /ya tiene datos/);
  const d2 = new Database(file);
  assert.equal(d2.prepare('SELECT title FROM movies WHERE id = 1').get().title, 'Hecha a mano');
  assert.equal(d2.prepare('SELECT status FROM users WHERE id = 2').get().status, 'inactive');
  d2.close();
  r = run('--reset');
  assert.equal(r.status, 0, r.stderr);
  const d3 = new Database(file);
  assert.equal(d3.prepare('SELECT title FROM movies WHERE id = 1').get().title, 'El Mago del Kremlin');
  assert.equal(d3.prepare('SELECT status FROM users WHERE id = 2').get().status, 'active');
  d3.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
