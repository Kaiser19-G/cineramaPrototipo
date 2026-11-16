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
import { MENU_SEED, MENU_SOLD_OUT_SEED } from '../menuSeed.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cinerama-mig5-'));
const count = (db, t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
const cols = (db, t) => db.prepare(`PRAGMA table_info(${t})`).all().map((c) => c.name);
const NEW_TABLES = ['products', 'product_variants', 'combo_items', 'branch_variants'];

// Una base como la de la fase 4: migraciones 1 a 4, con datos de ejemplo, un cliente y una compra real.
async function phase4Db(file) {
  const db = new Database(file);
  db.pragma('journal_mode = WAL'); db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  for (let i = 0; i < 4; i++) MIGRATIONS[i](db);
  db.pragma('user_version = 4');
  seed(db); await seedDemoCredentials(db);   // sin tablas de confiteria: la semilla las omite
  db.prepare(`INSERT INTO orders (id,screening_id,branch_id,customer_name,email,amount,method,status,created_at,created_ms,channel) VALUES ('CIN-REALL-33333',1,1,'x','x@x.com',35,'card','approved','2026-11-12 10:00',123,'web')`).run();
  db.prepare(`INSERT INTO order_seats (order_id,screening_id,seat,active) VALUES ('CIN-REALL-33333',1,'A1',1)`).run();
  return db;
}

test('migracion 5 sobre una base de la fase 4: solo agrega tablas, no cambia ninguna fila, y es idempotente', async () => {
  const dir = tmp(); const file = path.join(dir, 'fase4.db');
  const old = await phase4Db(file);
  assert.equal(old.pragma('user_version', { simple: true }), 4);
  for (const t of NEW_TABLES) assert.equal(old.prepare(`SELECT 1 FROM sqlite_master WHERE name = ?`).get(t), undefined, `${t} no existe aun`);
  const tables = old.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all().map((r) => r.name);
  const dump = (db) => Object.fromEntries(tables.map((t) => [t, db.prepare(`SELECT * FROM ${t} ORDER BY rowid`).all()]));
  const before = dump(old);
  const colsBefore = Object.fromEntries(tables.map((t) => [t, cols(old, t)]));
  old.close();

  const db = openDb(file);
  assert.equal(db.pragma('user_version', { simple: true }), MIGRATIONS.length);
  assert.equal(MIGRATIONS.length >= 5, true);
  // Ninguna fila ni columna de las tablas existentes cambia.
  assert.deepEqual(dump(db), before);
  for (const t of tables) assert.deepEqual(cols(db, t), colsBefore[t], `${t}: mismas columnas`);
  // Tablas nuevas, vacias, con sus columnas.
  for (const t of NEW_TABLES) assert.equal(count(db, t), 0, t);
  for (const c of ['name', 'category', 'description', 'art_key', 'active', 'sort', 'version', 'created_at', 'updated_at', 'updated_by']) assert.ok(cols(db, 'products').includes(c), c);
  for (const c of ['product_id', 'label', 'price', 'volume_ml', 'height_cm', 'top_diam_cm', 'bottom_diam_cm', 'serves', 'active', 'sort']) assert.ok(cols(db, 'product_variants').includes(c), c);
  assert.deepEqual(cols(db, 'combo_items'), ['combo_variant_id', 'item_variant_id', 'qty']);
  assert.deepEqual(cols(db, 'branch_variants'), ['branch_id', 'variant_id', 'status', 'updated_at', 'updated_by']);
  assert.ok(db.prepare(`SELECT name FROM sqlite_master WHERE name = 'idx_variants_product'`).get());
  // Restricciones: categoria, estado de disponibilidad, precio positivo y una etiqueta por producto.
  assert.throws(() => db.prepare(`INSERT INTO products (name,category,art_key) VALUES ('x','otra','popcorn')`).run(), /CHECK/);
  db.prepare(`INSERT INTO products (name,category,art_key) VALUES ('x','snack','candy')`).run();
  assert.throws(() => db.prepare(`INSERT INTO product_variants (product_id,label,price) VALUES (1,'Único',0)`).run(), /CHECK/);
  db.prepare(`INSERT INTO product_variants (product_id,label,price) VALUES (1,'Único',5)`).run();
  assert.throws(() => db.prepare(`INSERT INTO product_variants (product_id,label,price) VALUES (1,'Único',6)`).run(), /UNIQUE/);
  assert.throws(() => db.prepare(`INSERT INTO branch_variants (branch_id,variant_id,status) VALUES (1,1,'roto')`).run(), /CHECK/);
  db.prepare('DELETE FROM products').run();
  assert.equal(db.pragma('foreign_key_check').length, 0);
  assert.equal(db.pragma('integrity_check', { simple: true }), 'ok');

  // La semilla de confiteria se carga al ejecutar seed() y no se repite ni pisa lo editado.
  seed(db);
  assert.equal(count(db, 'products'), MENU_SEED.length);
  db.prepare(`UPDATE products SET name = 'Editado por el personal' WHERE id = (SELECT MIN(id) FROM products)`).run();
  seed(db);
  assert.equal(count(db, 'products'), MENU_SEED.length);
  assert.equal(db.prepare('SELECT name FROM products ORDER BY id LIMIT 1').get().name, 'Editado por el personal');
  db.close();

  // Idempotente: al reabrir no vuelve a migrar ni toca los datos.
  const again = openDb(file);
  assert.equal(again.pragma('user_version', { simple: true }), MIGRATIONS.length);
  assert.equal(count(again, 'products'), MENU_SEED.length);
  assert.equal(count(again, 'orders'), 1);
  // Correr la migracion 5 sobre una base que ya tiene las tablas no falla ni borra nada.
  MIGRATIONS[4](again);
  assert.equal(count(again, 'products'), MENU_SEED.length);
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('semilla de confiteria: productos, tamanos con medidas, combos validos y agotados de ejemplo', () => {
  const dir = tmp();
  const db = openDb(path.join(dir, 'new.db'));
  seed(db);
  assert.equal(db.pragma('user_version', { simple: true }), MIGRATIONS.length);
  assert.equal(count(db, 'products'), MENU_SEED.length);
  assert.ok(MENU_SEED.length >= 10 && MENU_SEED.length <= 12);
  const cats = db.prepare('SELECT category, COUNT(*) c FROM products GROUP BY category').all();
  assert.deepEqual(new Set(cats.map((c) => c.category)), new Set(['combo', 'popcorn', 'drink', 'snack']));
  // Canchita en tres tamanos con todas las medidas.
  const pop = db.prepare(`SELECT v.* FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.name = 'Canchita salada' ORDER BY v.sort`).all();
  assert.deepEqual(pop.map((v) => v.label), ['Pequeño', 'Mediano', 'Grande']);
  for (const v of pop) for (const k of ['volume_ml', 'height_cm', 'top_diam_cm', 'bottom_diam_cm', 'serves']) assert.ok(v[k] > 0, k);
  assert.ok(pop[0].volume_ml < pop[1].volume_ml && pop[1].volume_ml < pop[2].volume_ml);
  assert.ok(db.prepare('SELECT COUNT(*) c FROM product_variants WHERE price <= 0 OR price > 200').get().c === 0);
  // Los combos solo incluyen variantes sueltas (no combos).
  const bad = db.prepare(`SELECT COUNT(*) c FROM combo_items ci JOIN product_variants v ON v.id = ci.item_variant_id JOIN products p ON p.id = v.product_id WHERE p.category = 'combo'`).get().c;
  assert.equal(bad, 0);
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM products p WHERE category = 'combo' AND (SELECT COUNT(*) FROM product_variants WHERE product_id = p.id) != 1`).get().c, 0);
  assert.ok(count(db, 'combo_items') >= 6);
  // Agotados de ejemplo por sede; el resto no tiene fila (= disponible).
  assert.equal(count(db, 'branch_variants'), MENU_SOLD_OUT_SEED.length);
  assert.equal(db.prepare(`SELECT COUNT(*) c FROM branch_variants WHERE status != 'sold_out'`).get().c, 0);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});
