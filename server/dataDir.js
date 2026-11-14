// Ubicacion de los datos PRIVADOS del servidor (base SQLite, sus -wal/-shm y auth-secret.key).
// Deben vivir FUERA de la raiz del proyecto: el servidor de desarrollo de Vite entrega
// cualquier archivo bajo la raiz. Todo calculo de rutas de datos pasa por este modulo.
import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const LEGACY_DIR = path.join(REPO_ROOT, 'server', 'data');
export const DB_NAME = 'cinerama.db';
export const KEY_NAME = 'auth-secret.key';

// CINERAMA_DB (ruta explicita de la base, usada por las pruebas) > CINERAMA_DATA_DIR > ~/.cinerama-data.
export function resolveDataPaths(env = process.env, home = os.homedir()) {
  if (env.CINERAMA_DB) {
    const dbFile = path.resolve(env.CINERAMA_DB);
    return { dataDir: path.dirname(dbFile), dbFile, explicitDb: true };
  }
  const dataDir = path.resolve(env.CINERAMA_DATA_DIR || path.join(home, '.cinerama-data'));
  return { dataDir, dbFile: path.join(dataDir, DB_NAME), explicitDb: false };
}

export const keyFileFor = (dbFile) => path.join(path.dirname(dbFile), KEY_NAME);
export const sidecars = (file) => [file, file + '-wal', file + '-shm'];

// realpath del directorio aunque aun no exista (ancestro existente + resto).
function realpathLoose(p) {
  const rest = [];
  let cur = path.resolve(p);
  for (;;) {
    try { return path.join(fs.realpathSync(cur), ...rest.reverse()); } catch (e) {
      const parent = path.dirname(cur);
      if (parent === cur || e.code !== 'ENOENT') throw e;
      rest.push(path.basename(cur));
      cur = parent;
    }
  }
}

export function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

// Salvaguarda: el directorio de datos efectivo (con symlinks resueltos) no puede estar dentro del repositorio.
export function assertOutsideRepo(dir, repoRoot = REPO_ROOT) {
  const real = realpathLoose(dir);
  const root = realpathLoose(repoRoot);
  if (isInside(real, root)) {
    throw new Error(
      `Directorio de datos inseguro: ${real} esta dentro del proyecto (${root}), y el servidor de desarrollo ` +
      `podria entregar esos archivos por HTTP. Define CINERAMA_DATA_DIR con un directorio fuera del proyecto ` +
      `(por defecto: ~/.cinerama-data).`);
  }
  return real;
}

const tableCounts = (db) => {
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all();
  return Object.fromEntries(tables.map(({ name }) => [name, db.prepare(`SELECT COUNT(*) c FROM "${name}"`).get().c]));
};
const sameCounts = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// Traslada la base antigua (server/data) y su clave al directorio nuevo y borra los originales
// SOLO tras verificar la copia. Si algo falla lanza un Error y no borra nada.
export function migrateLegacyData({ legacyDir = LEGACY_DIR, dbFile, log = console } = {}) {
  const oldDb = path.join(legacyDir, DB_NAME);
  const oldKey = path.join(legacyDir, KEY_NAME);
  const newKey = keyFileFor(dbFile);
  if (!fs.existsSync(oldDb) || fs.existsSync(dbFile)) return false;

  const fail = (msg, cause) => { throw new Error(`Migracion de datos abortada (no se borro nada de ${legacyDir}): ${msg}`, { cause }); };
  const tmpDb = dbFile + '.migrating';
  const tmpKey = newKey + '.migrating';
  const cleanTmp = () => [...sidecars(tmpDb), tmpKey].forEach((f) => fs.rmSync(f, { force: true }));
  log.log(`[datos] Migrando ${oldDb} -> ${dbFile}`);
  cleanTmp();
  try {
    // 1. Base antigua: checkpoint del WAL para que el .db contenga todo, y conteos de referencia.
    let before;
    const src = new Database(oldDb, { fileMustExist: true });
    try {
      const cp = src.pragma('wal_checkpoint(TRUNCATE)')[0];
      if (cp && cp.busy) fail('la base antigua esta en uso (checkpoint ocupado). Deten la API y reintenta.');
      before = tableCounts(src);
    } finally { src.close(); }

    // 2. Copia y verificacion.
    fs.copyFileSync(oldDb, tmpDb);
    fs.chmodSync(tmpDb, 0o600);
    const copy = new Database(tmpDb);
    try {
      const ic = copy.pragma('integrity_check', { simple: true });
      if (ic !== 'ok') fail(`la copia no pasa integrity_check (${ic}).`);
      const after = tableCounts(copy);
      if (!sameCounts(before, after)) fail('los conteos de filas de la copia no coinciden con la base antigua.');
      copy.pragma('wal_checkpoint(TRUNCATE)');
    } finally { copy.close(); }
    [tmpDb + '-wal', tmpDb + '-shm'].forEach((f) => fs.rmSync(f, { force: true }));

    // 3. Clave (la base nueva depende de ella): se copia antes de publicar la base.
    const keyMoves = fs.existsSync(oldKey);
    if (keyMoves) {
      const content = fs.readFileSync(oldKey);
      if (fs.existsSync(newKey)) {
        if (!fs.readFileSync(newKey).equals(content)) fail(`ya existe ${newKey} con una clave distinta a la de la base antigua.`);
      } else {
        fs.writeFileSync(tmpKey, content, { mode: 0o600 });
        if (!fs.readFileSync(tmpKey).equals(content)) fail('la copia de la clave no coincide.');
        fs.renameSync(tmpKey, newKey);
      }
      fs.chmodSync(newKey, 0o600);
    }

    // 4. Publicar (la existencia de la base nueva marca la migracion como completa) y borrar lo antiguo.
    fs.renameSync(tmpDb, dbFile);
    const removed = [...sidecars(oldDb), ...(keyMoves ? [oldKey] : [])];
    removed.forEach((f) => fs.rmSync(f, { force: true }));
    log.log(`[datos] Migracion completa: ${Object.keys(before).length} tablas, ` +
      `${Object.values(before).reduce((a, b) => a + b, 0)} filas verificadas. Archivos antiguos eliminados de ${legacyDir}.`);
    return true;
  } catch (e) {
    cleanTmp();
    if (e.message.startsWith('Migracion de datos abortada')) throw e;
    return fail(e.message, e);
  }
}

// Prepara el directorio de datos: salvaguarda, creacion 0o700, migracion y permisos 0o600.
export function prepareDataFiles(dbFile, { repoRoot = REPO_ROOT, legacyDir = LEGACY_DIR, migrate = false, log = console } = {}) {
  const dir = path.dirname(dbFile);
  assertOutsideRepo(dir, repoRoot);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  if (migrate) migrateLegacyData({ legacyDir, dbFile, log });
  [...sidecars(dbFile), keyFileFor(dbFile)].forEach((f) => { if (fs.existsSync(f)) fs.chmodSync(f, 0o600); });
  if (migrate) {
    const left = [DB_NAME, DB_NAME + '-wal', DB_NAME + '-shm', KEY_NAME].map((n) => path.join(legacyDir, n)).filter((f) => fs.existsSync(f));
    if (left.length) log.warn(`[AVISO] Quedan archivos de datos dentro del proyecto, expuestos al servidor de desarrollo: ${left.join(', ')}. ` +
      `Ya existe una base en ${dir}; revisa y borra esos archivos.`);
  }
}
