import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA } from '../schema.js';
import { MIGRATIONS } from '../migrations.js';
import { openDb } from '../db.js';
import { seed } from '../seed.js';
import { seedDemoCredentials } from '../seedAuth.js';
import { orders as legacyOrders, screenings as legacyScreenings } from '../../src/data/store.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cinerama-mig4-'));
const count = (db, t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);

// Una base como la de la fase 3: migraciones 1 a 3, datos de ejemplo CON las ordenes y contadores de ejemplo antiguos.
async function phase3Db(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  MIGRATIONS[0](db); MIGRATIONS[1](db); MIGRATIONS[2](db);
  db.pragma('user_version = 3');
  seed(db); await seedDemoCredentials(db);
  const scr = db.prepare('UPDATE screenings SET booked_seats = ?, status = ? WHERE id = ?');
  for (const s of legacyScreenings) scr.run(s.bookedSeats, s.status, s.id);
  const brOf = Object.fromEntries(legacyScreenings.map((s) => [s.id, s.branchId]));
  const ins = db.prepare(`INSERT INTO orders (id,screening_id,branch_id,customer_name,email,amount,method,status,created_at) VALUES (?,?,?,?,?,?,?,?,?)`);
  const seat = db.prepare('INSERT INTO order_seats (order_id,screening_id,seat,active) VALUES (?,?,?,?)');
  for (const o of legacyOrders) {
    ins.run(o.id, o.screeningId, brOf[o.screeningId], o.customer, o.email, o.amount, o.method, o.status, o.date);
    for (const s of o.seats) seat.run(o.id, o.screeningId, s, o.status === 'approved' ? 1 : 0);
  }
  db.prepare(`INSERT INTO users (name,email,role,status,dni_hash,dni_hint,phone,created_at) VALUES ('Cliente','c4@example.com','customer','active',?,?,?,?)`)
    .run('f'.repeat(64), '123', '933333333', 1);
  return db;
}

test('migracion 4 sobre una base de la fase 3: borra solo las ordenes de ejemplo, cuadra contadores y repone sold_out', async () => {
  const dir = tmp(); const file = path.join(dir, 'fase3.db');
  const old = await phase3Db(file);
  assert.equal(old.pragma('user_version', { simple: true }), 3);
  // Lo que existe antes: 8 ordenes de ejemplo, sus butacas, contadores sembrados y una funcion guardada como agotada.
  assert.equal(count(old, 'orders'), 8); assert.equal(count(old, 'order_seats'), 14);
  assert.equal(old.prepare(`SELECT status FROM screenings WHERE id = 8`).get().status, 'sold_out');
  const tables = old.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
  const dump = (db) => Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
  const before = dump(old);
  old.close();

  const db = openDb(file);
  assert.equal(db.pragma('user_version', { simple: true }), 4);
  const after = dump(db);
  // 1. Se borran todas las ordenes y butacas heredadas y nada mas.
  assert.equal(after.orders.length, 0); assert.equal(after.order_seats.length, 0);
  for (const t of tables) {
    if (['orders', 'order_seats', 'screenings'].includes(t)) continue;
    assert.deepEqual(after[t], before[t], `${t} sin cambios`);
  }
  // 2. Funciones: solo cambian booked_seats (al conteo real = 0) y el estado guardado sold_out -> scheduled.
  const strip = (r) => { const c = { ...r }; delete c.booked_seats; delete c.status; return c; };
  assert.deepEqual(after.screenings.map(strip), before.screenings.map(strip));
  assert.ok(after.screenings.every((s) => s.booked_seats === 0));
  const changedStatus = after.screenings.filter((s, i) => s.status !== before.screenings[i].status).map((s) => [s.id, before.screenings.find((b) => b.id === s.id).status, s.status]);
  assert.deepEqual(changedStatus, [[8, 'sold_out', 'scheduled']]);
  // 3. Columnas e indices nuevos.
  for (const c of ['channel', 'presale', 'idempotency_key', 'payment_ref', 'created_ms', 'refunded_at', 'refund_reason', 'refunded_by']) assert.ok(cols(db, 'orders').includes(c), c);
  for (const c of ['unit_price', 'checked_in_at', 'checked_in_by']) assert.ok(cols(db, 'order_seats').includes(c), c);
  for (const i of ['uq_orders_idem', 'idx_orders_user', 'idx_orders_screening', 'idx_orders_branch', 'idx_order_seats_screening', 'uq_seat_per_screening']) {
    assert.ok(db.prepare(`SELECT name FROM sqlite_master WHERE name = ?`).get(i), i);
  }
  assert.equal(db.pragma('foreign_key_check').length, 0);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  db.close();

  // 4. Idempotente: al reabrir no borra una orden real (created_ms) ni vuelve a tocar nada.
  const mid = openDb(file);
  mid.prepare(`INSERT INTO orders (id,screening_id,branch_id,customer_name,email,amount,method,status,created_at,created_ms,channel) VALUES ('CIN-REALL-22222',1,1,'x','x@x.com',35,'card','approved','2026-11-12 10:00',123,'web')`).run();
  mid.prepare(`INSERT INTO order_seats (order_id,screening_id,seat,active) VALUES ('CIN-REALL-22222',1,'A1',1)`).run();
  mid.prepare('UPDATE screenings SET booked_seats = 1 WHERE id = 1').run();
  mid.close();
  const again = openDb(file);
  assert.equal(again.pragma('user_version', { simple: true }), 4);
  assert.equal(count(again, 'orders'), 1); assert.equal(count(again, 'order_seats'), 1);
  assert.equal(again.prepare('SELECT booked_seats b FROM screenings WHERE id = 1').get().b, 1);
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('migracion 4 sobre base nueva: la semilla no crea ordenes ni contadores y no hay funciones agotadas guardadas', () => {
  const dir = tmp();
  const db = openDb(path.join(dir, 'new.db'));
  assert.equal(db.pragma('user_version', { simple: true }), 4);
  seed(db);
  assert.equal(count(db, 'orders'), 0); assert.equal(count(db, 'order_seats'), 0);
  assert.equal(db.prepare('SELECT COUNT(*) c FROM screenings WHERE booked_seats != 0 OR status = ?').get('sold_out').c, 0);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
