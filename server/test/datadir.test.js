// Ubicacion de los datos privados: resolucion de rutas, salvaguarda dentro del repo y migracion desde server/data.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import Database from 'better-sqlite3';
import { SCHEMA } from '../schema.js';
import { seed } from '../seed.js';
import { openDb } from '../db.js';
import { loadPepper } from '../auth/crypto.js';
import {
  resolveDataPaths, assertOutsideRepo, prepareDataFiles, migrateLegacyData, REPO_ROOT, LEGACY_DIR, keyFileFor,
} from '../dataDir.js';

const tmp = (p = 'cinerama-dd-') => fs.mkdtempSync(path.join(os.tmpdir(), p));
const quiet = { log: () => {}, warn: () => {}, error: () => {} };
const mode = (f) => fs.statSync(f).mode & 0o777;
const count = (db, t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
const SECRET = 'a'.repeat(64) + '\n';

// Crea una "base antigua" en modo WAL con parte de los datos solo en el -wal (sin checkpoint).
function makeLegacy(dir) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'cinerama.db');
  const db = openDb(file, { repoRoot: '/nonexistent-repo' });
  seed(db);
  db.prepare(`INSERT INTO users (name,email,role,status) VALUES ('Cliente Prueba','c@example.com','customer','active')`).run();
  db.pragma('wal_autocheckpoint = 0');
  fs.writeFileSync(path.join(dir, 'auth-secret.key'), SECRET, { mode: 0o600 });
  const counts = Object.fromEntries(['movies', 'users', 'orders', 'screenings'].map((t) => [t, count(db, t)]));
  return { file, db, counts };
}

test('resolucion de rutas: defecto, CINERAMA_DATA_DIR y CINERAMA_DB', () => {
  assert.deepEqual(resolveDataPaths({}, '/home/x'),
    { dataDir: '/home/x/.cinerama-data', dbFile: '/home/x/.cinerama-data/cinerama.db', explicitDb: false });
  assert.equal(resolveDataPaths({ CINERAMA_DATA_DIR: '/srv/datos' }, '/home/x').dbFile, '/srv/datos/cinerama.db');
  const r = resolveDataPaths({ CINERAMA_DB: '/t/otra/test.db', CINERAMA_DATA_DIR: '/srv/datos' }, '/home/x');
  assert.deepEqual(r, { dataDir: '/t/otra', dbFile: '/t/otra/test.db', explicitDb: true });
  assert.equal(keyFileFor('/t/otra/test.db'), '/t/otra/auth-secret.key');
  assert.ok(!resolveDataPaths({}, os.homedir()).dataDir.startsWith(REPO_ROOT));
});

test('salvaguarda: se niega a usar un directorio dentro del repositorio (tambien via symlink)', () => {
  const repo = tmp('cinerama-repo-');
  fs.mkdirSync(path.join(repo, 'server', 'data'), { recursive: true });
  for (const d of [repo, path.join(repo, 'server', 'data'), path.join(repo, 'nuevo', 'sub')]) {
    assert.throws(() => assertOutsideRepo(d, repo), /dentro del proyecto/);
  }
  const outside = tmp('cinerama-out-');
  fs.symlinkSync(path.join(repo, 'server'), path.join(outside, 'enlace'));
  assert.throws(() => assertOutsideRepo(path.join(outside, 'enlace', 'data'), repo), /dentro del proyecto/);
  assert.throws(() => prepareDataFiles(path.join(repo, 'server', 'data', 'cinerama.db'), { repoRoot: repo }), /CINERAMA_DATA_DIR/);
  assert.equal(fs.readdirSync(path.join(repo, 'server', 'data')).length, 0);
  // Los temporales del sistema (usados por las pruebas) no estan dentro del repo real: no hace falta excepcion.
  assert.doesNotThrow(() => assertOutsideRepo(os.tmpdir()));
  assert.doesNotThrow(() => assertOutsideRepo(path.join(outside, 'no-existe-aun')));
  assert.throws(() => assertOutsideRepo(path.join(REPO_ROOT, 'server', 'data')), /dentro del proyecto/);
  assert.throws(() => openDb(path.join(REPO_ROOT, 'server', 'data', 'x.db')), /dentro del proyecto/);
});

test('openDb crea el directorio 0o700 y la base con 0o600; el pepper queda junto a la base con 0o600', () => {
  const dir = path.join(tmp(), 'datos');
  const file = path.join(dir, 'cinerama.db');
  const db = openDb(file);
  db.exec(`INSERT INTO users (name,email,role,status) VALUES ('x','x@example.com','customer','active')`);
  assert.equal(mode(dir), 0o700);
  for (const f of [file, file + '-wal', file + '-shm']) assert.equal(mode(f), 0o600, f);
  const pepper = loadPepper(file);
  assert.equal(fs.readFileSync(path.join(dir, 'auth-secret.key'), 'utf8').trim(), pepper);
  assert.equal(mode(path.join(dir, 'auth-secret.key')), 0o600);
  db.close();
});

test('migracion: conserva datos (incluido el WAL), traslada la clave y elimina lo antiguo', () => {
  const live = path.join(tmp(), 'live');
  const { db, counts } = makeLegacy(live);
  // Foto de la base mientras esta abierta: parte de los datos solo existe en el -wal (como con la API corriendo).
  const legacy = path.join(tmp(), 'server', 'data');
  fs.cpSync(live, legacy, { recursive: true });
  db.close();
  assert.ok(fs.statSync(path.join(legacy, 'cinerama.db-wal')).size > 0);
  const dest = path.join(tmp(), 'nuevo');
  fs.mkdirSync(dest, { mode: 0o700 });
  const dbFile = path.join(dest, 'cinerama.db');
  const logs = [];
  const log = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')) };
  assert.equal(migrateLegacyData({ legacyDir: legacy, dbFile, log }), true);
  assert.deepEqual(fs.readdirSync(dest).sort(), ['auth-secret.key', 'cinerama.db']);
  assert.deepEqual(fs.readdirSync(legacy), []);
  const moved = new Database(dbFile, { readonly: true });
  for (const [t, n] of Object.entries(counts)) assert.equal(count(moved, t), n, t);
  assert.equal(moved.prepare(`SELECT COUNT(*) c FROM users WHERE email='c@example.com'`).get().c, 1);
  moved.close();
  assert.equal(fs.readFileSync(path.join(dest, 'auth-secret.key'), 'utf8'), SECRET);
  assert.equal(mode(dbFile), 0o600);
  assert.equal(mode(path.join(dest, 'auth-secret.key')), 0o600);
  const out = logs.join('\n');
  assert.ok(!out.includes('c@example.com') && !out.includes('Cliente Prueba'));
  // Repetir no hace nada.
  assert.equal(migrateLegacyData({ legacyDir: legacy, dbFile, log: quiet }), false);
});

test('migracion via prepareDataFiles/openDb: la base abierta contiene los datos y los permisos son correctos', () => {
  const legacy = path.join(tmp(), 'server', 'data');
  const { db, counts } = makeLegacy(legacy);
  db.close();
  const dest = path.join(tmp(), 'nuevo');
  const file = path.join(dest, 'cinerama.db');
  const opened = openDb(file, { migrate: true, legacyDir: legacy, log: quiet });
  assert.equal(count(opened, 'movies'), counts.movies);
  assert.equal(mode(dest), 0o700);
  assert.equal(mode(file), 0o600);
  assert.equal(mode(file + '-wal'), 0o600);
  assert.deepEqual(fs.readdirSync(legacy), []);
  opened.close();
});

test('migracion: si falla la verificacion no se borra nada y no queda base a medias', () => {
  const legacy = path.join(tmp(), 'server', 'data');
  const { db } = makeLegacy(legacy);
  db.close();
  // Corrompe la base antigua (el encabezado queda legible, las paginas no): integrity_check/lectura falla.
  const oldDb = path.join(legacy, 'cinerama.db');
  const snapshot = new Map(fs.readdirSync(legacy).map((n) => [n, fs.readFileSync(path.join(legacy, n))]));
  const dest = path.join(tmp(), 'nuevo');
  fs.mkdirSync(dest, { mode: 0o700 });
  const dbFile = path.join(dest, 'cinerama.db');
  // Fallo 1: clave distinta ya presente en el destino.
  fs.writeFileSync(path.join(dest, 'auth-secret.key'), 'otra-clave\n');
  assert.throws(() => migrateLegacyData({ legacyDir: legacy, dbFile, log: quiet }), /Migracion de datos abortada.*clave distinta/);
  // Fallo 2: base antigua que no es SQLite.
  fs.rmSync(path.join(dest, 'auth-secret.key'));
  fs.rmSync(oldDb + '-wal', { force: true }); fs.rmSync(oldDb + '-shm', { force: true });
  fs.writeFileSync(oldDb, Buffer.alloc(4096, 7));
  snapshot.set('cinerama.db', fs.readFileSync(oldDb));
  snapshot.delete('cinerama.db-wal'); snapshot.delete('cinerama.db-shm');
  assert.throws(() => migrateLegacyData({ legacyDir: legacy, dbFile, log: quiet }), /Migracion de datos abortada/);
  assert.deepEqual(fs.readdirSync(legacy).sort(), [...snapshot.keys()].sort());
  for (const [n, buf] of snapshot) assert.ok(fs.readFileSync(path.join(legacy, n)).equals(buf), n);
  assert.deepEqual(fs.readdirSync(dest), []);
});

test('migracion: no actua si el destino ya tiene base; avisa de los restos expuestos', () => {
  const legacy = path.join(tmp(), 'server', 'data');
  const { db } = makeLegacy(legacy);
  db.close();
  const dest = path.join(tmp(), 'nuevo');
  fs.mkdirSync(dest);
  const dbFile = path.join(dest, 'cinerama.db');
  new Database(dbFile).close();
  const warns = [];
  prepareDataFiles(dbFile, { migrate: true, legacyDir: legacy, log: { log() {}, warn: (m) => warns.push(m) } });
  assert.ok(fs.existsSync(path.join(legacy, 'cinerama.db')));
  assert.match(warns.join('\n'), /expuestos/);
});

test('la ruta antigua por defecto es server/data del repo', () => {
  assert.equal(LEGACY_DIR, path.join(REPO_ROOT, 'server', 'data'));
  assert.ok(SCHEMA.length > 0);
});
