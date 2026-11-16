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

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cinerama-mig6-'));
const count = (db, t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const NEW_TABLES = ['order_items', 'fulfillments'];

// Una base como la de la fase 5a: migraciones 1 a 5, con catalogo de confiteria, un cliente y ordenes reales
// (una aprobada con butacas y una reembolsada), de modo que se compruebe que nada existente cambia.
async function phase5aDb(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  for (let i = 0; i < 5; i++) MIGRATIONS[i](db);
  db.pragma('user_version = 5');
  seed(db); await seedDemoCredentials(db);
  const ins = db.prepare(`INSERT INTO orders (id,screening_id,branch_id,customer_name,email,amount,method,status,created_at,created_ms,channel) VALUES (?,1,1,'x','x@x.com',?,'card',?,'2026-11-12 10:00',?,'web')`);
  ins.run('CIN-AAAAA-33333', 35, 'approved', 123); ins.run('CIN-BBBBB-44444', 20, 'refunded', 456);
  const seat = db.prepare('INSERT INTO order_seats (order_id,screening_id,seat,active,unit_price) VALUES (?,?,?,?,?)');
  seat.run('CIN-AAAAA-33333', 1, 'A1', 1, 17.5); seat.run('CIN-AAAAA-33333', 1, 'A2', 1, 17.5); seat.run('CIN-BBBBB-44444', 1, 'B1', 0, 20);
  return db;
}

test('migracion 6 sobre una base de la fase 5a con ordenes: agrega columnas con DEFAULT y tablas, sin tocar datos; idempotente', async () => {
  const dir = tmp(); const file = path.join(dir, 'fase5a.db');
  const old = await phase5aDb(file);
  assert.equal(old.pragma('user_version', { simple: true }), 5);
  for (const t of NEW_TABLES) assert.equal(old.prepare(`SELECT 1 FROM sqlite_master WHERE name = ?`).get(t), undefined, `${t} no existe aun`);
  const tables = old.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
  const dump = (db) => Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
  const before = dump(old);
  const colsBefore = Object.fromEntries(tables.map((t) => [t, cols(old, t)]));
  old.close();

  const db = openDb(file);
  assert.equal(db.pragma('user_version', { simple: true }), MIGRATIONS.length);
  assert.ok(MIGRATIONS.length >= 6);
  // Las ordenes existentes quedan con confiteria = 0 y el total anterior intacto; las butacas siguen ahi (la tabla orders no se reconstruyo).
  assert.deepEqual(cols(db, 'orders'), [...colsBefore.orders, 'food_amount', 'pickup_timing']);
  const after = dump(db);
  for (const t of tables) {
    const rows = t === 'orders' ? after[t].map(({ food_amount: f, pickup_timing: p, ...r }) => { assert.equal(f, 0); assert.equal(p, null); return r; }) : after[t];
    assert.deepEqual(rows, before[t], `${t}: mismas filas`);
    if (t !== 'orders') assert.deepEqual(cols(db, t), colsBefore[t], `${t}: mismas columnas`);
  }
  assert.deepEqual(db.prepare('SELECT id, amount, food_amount FROM orders ORDER BY id').all(),
    [{ id: 'CIN-AAAAA-33333', amount: 35, food_amount: 0 }, { id: 'CIN-BBBBB-44444', amount: 20, food_amount: 0 }]);
  assert.equal(count(db, 'order_seats'), 3);
  // Tablas nuevas, vacias, con sus columnas y restricciones.
  for (const t of NEW_TABLES) assert.equal(count(db, t), 0, t);
  assert.deepEqual(cols(db, 'order_items'), ['id', 'order_id', 'variant_id', 'product_name', 'variant_label', 'includes_text', 'qty', 'unit_price', 'line_total']);
  assert.deepEqual(cols(db, 'fulfillments'), ['order_id', 'branch_id', 'timing', 'prepare_from_ms', 'status', 'ready_at', 'ready_by', 'delivered_at', 'delivered_by', 'arrived_at', 'created_ms']);
  const vId = db.prepare('SELECT id FROM product_variants ORDER BY id LIMIT 1').get().id;
  const item = (o, q = 1) => db.prepare(`INSERT INTO order_items (order_id,variant_id,product_name,variant_label,qty,unit_price,line_total) VALUES (?,?,'P','Único',?,5,5)`).run(o, vId, q);
  assert.throws(() => item('CIN-AAAAA-33333', 11), /CHECK/);
  assert.throws(() => item('CIN-NOEXISTE-1', 1), /FOREIGN KEY/);
  item('CIN-AAAAA-33333');
  assert.throws(() => item('CIN-AAAAA-33333'), /UNIQUE/);
  const ful = (st, tm = 'on_arrival') => db.prepare(`INSERT INTO fulfillments (order_id,branch_id,timing,status,created_ms) VALUES ('CIN-AAAAA-33333',1,?,?,1)`).run(tm, st);
  assert.throws(() => ful('roto'), /CHECK/); assert.throws(() => ful('ordered', 'luego'), /CHECK/);
  ful('ordered');
  assert.equal(db.prepare('SELECT status FROM fulfillments').get().status, 'ordered');
  // Borrar la orden borra sus items y su fila de preparacion (ON DELETE CASCADE) y sus butacas.
  db.prepare(`DELETE FROM orders WHERE id = 'CIN-AAAAA-33333'`).run();
  assert.equal(count(db, 'order_items'), 0); assert.equal(count(db, 'fulfillments'), 0); assert.equal(count(db, 'order_seats'), 1);
  assert.equal(db.pragma('foreign_key_check').length, 0);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');
  db.close();

  // Idempotente: al reabrir no migra de nuevo; y correr la migracion 6 sobre una base ya migrada no falla ni borra.
  const again = openDb(file);
  assert.equal(again.pragma('user_version', { simple: true }), MIGRATIONS.length);
  assert.equal(count(again, 'orders'), 1);
  MIGRATIONS[5](again);
  assert.equal(count(again, 'orders'), 1); assert.equal(count(again, 'order_seats'), 1);
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
