import Database from 'better-sqlite3';
import fs from 'node:fs';
import { resolveDataPaths, prepareDataFiles, sidecars } from './dataDir.js';
import { SCHEMA } from './schema.js';
import { migrate } from './migrations.js';

export const { dataDir: DATA_DIR, dbFile: DB_FILE, explicitDb: EXPLICIT_DB } = resolveDataPaths();

// Salvaguarda + directorio 0o700 + migracion desde server/data (solo para la ruta por defecto).
export function prepareData(file = DB_FILE, opts = {}) {
  prepareDataFiles(file, { migrate: file === DB_FILE && !EXPLICIT_DB, ...opts });
}

export function openDb(file = DB_FILE, opts = {}) {
  prepareData(file, opts);
  const db = new Database(file);
  fs.chmodSync(file, 0o600); // antes de activar WAL: -wal y -shm heredan este modo
  sidecars(file).forEach((f) => { if (fs.existsSync(f)) fs.chmodSync(f, 0o600); });
  db.pragma('journal_mode = WAL');
  db.pragma('foreign_keys = ON');
  db.exec(SCHEMA);
  migrate(db);
  return db;
}
