// Migraciones minimas con PRAGMA user_version. La linea base (version 0) es el
// esquema de schema.js (CREATE TABLE IF NOT EXISTS). Cada migracion corre en una
// transaccion y sube user_version; son idempotentes sobre columnas ya existentes.

import { LEGACY_RATING_MAP } from '../src/shared/catalogOptions.js';
import { ensureSampleHalls } from './sampleHalls.js';

const addColumns = (db, table, cols) => {
  const have = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name));
  for (const [name, def] of cols) if (!have.has(name)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${name} ${def}`);
};

export const MIGRATIONS = [
  // 1: cuentas de usuario (fase 2)
  (db) => {
    addColumns(db, 'users', [
      ['password_hash', 'TEXT'],
      ['dni_hash', 'TEXT'],          // HMAC-SHA256 del DNI con pepper; nunca el DNI en claro
      ['dni_hint', 'TEXT'],          // ultimos 3 digitos
      ['phone', 'TEXT'],
      ['phone_verified_at', 'INTEGER'],
      ['consent_at', 'INTEGER'],
      ['consent_version', 'TEXT'],
      ['created_at', 'INTEGER'],
      ['pending_token_hash', 'TEXT'], // identifica al navegador de un registro pendiente
    ]);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_email_ci ON users(lower(email));
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_dni ON users(dni_hash) WHERE dni_hash IS NOT NULL;
      CREATE UNIQUE INDEX IF NOT EXISTS uq_users_phone ON users(phone) WHERE phone IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_users_pending ON users(status, created_at);

      CREATE TABLE IF NOT EXISTS sessions (
        token_hash   TEXT PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        created_at   INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL,
        expires_at   INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);

      CREATE TABLE IF NOT EXISTS verification_codes (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        code_hash   TEXT NOT NULL,
        salt        TEXT NOT NULL,
        expires_at  INTEGER NOT NULL,
        attempts    INTEGER NOT NULL DEFAULT 0,
        consumed_at INTEGER,
        created_at  INTEGER NOT NULL
      );
      CREATE INDEX IF NOT EXISTS idx_vcodes_user ON verification_codes(user_id, created_at);

      CREATE TABLE IF NOT EXISTS auth_throttle (
        key          TEXT PRIMARY KEY,
        count        INTEGER NOT NULL,
        window_start INTEGER NOT NULL,
        locked_until INTEGER NOT NULL DEFAULT 0
      );
    `);
  },
  // 2: reclamos de DNI usado por otra persona (fase 2b). Solo tablas e indices nuevos: no toca filas existentes.
  (db) => {
    db.exec(`
      CREATE TABLE IF NOT EXISTS claims (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        code_hash       TEXT NOT NULL UNIQUE,      -- HMAC del codigo de reclamo; el codigo no se guarda
        status          TEXT NOT NULL CHECK (status IN ('draft','pending','approved','rejected','superseded','expired')),
        name            TEXT,                      -- name, email, phone y dni_plain se anulan al resolver
        email           TEXT,
        phone           TEXT,
        dni_plain       TEXT,
        dni_hash        TEXT NOT NULL,             -- HMAC del DNI declarado (mismo que users.dni_hash)
        dni_hint        TEXT NOT NULL,
        contact_hash    TEXT,                      -- HMAC del correo; reserva del DNI, se anula al vencer
        consent_at      INTEGER NOT NULL,
        consent_version TEXT NOT NULL,
        created_at      INTEGER NOT NULL,
        submitted_at    INTEGER,
        resolved_at     INTEGER,
        resolved_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reason_code     TEXT,
        reason_note     TEXT,
        target_user_id  INTEGER REFERENCES users(id) ON DELETE SET NULL,
        reserved_until  INTEGER
      );
      CREATE INDEX IF NOT EXISTS idx_claims_dni ON claims(dni_hash, status);
      CREATE INDEX IF NOT EXISTS idx_claims_status ON claims(status, submitted_at);

      CREATE TABLE IF NOT EXISTS claim_files (
        id           INTEGER PRIMARY KEY AUTOINCREMENT,
        claim_id     INTEGER NOT NULL REFERENCES claims(id) ON DELETE CASCADE,
        kind         TEXT NOT NULL CHECK (kind IN ('dni_front','dni_back','letter','selfie')),
        stored_name  TEXT NOT NULL UNIQUE,         -- nombre aleatorio generado por el servidor
        mime         TEXT NOT NULL,
        size         INTEGER NOT NULL,
        created_at   INTEGER NOT NULL,
        delete_state TEXT NOT NULL DEFAULT 'stored' CHECK (delete_state IN ('stored','delete_pending')),
        UNIQUE (claim_id, kind)
      );
    `);
  },
  // 3: panel de administracion real (fase 3). Solo columnas y tablas nuevas, mas dos correcciones de datos de ejemplo
  // (calificaciones a la escala peruana y salas para sedes que declaran salas y no tienen ninguna).
  (db) => {
    addColumns(db, 'movies', [
      ['version', 'INTEGER NOT NULL DEFAULT 1'],   // control optimista: sube en cada cambio
      ['created_at', 'INTEGER'],
      ['updated_at', 'INTEGER'],
      ['updated_by', 'INTEGER'],
    ]);
    addColumns(db, 'screenings', [
      ['version', 'INTEGER NOT NULL DEFAULT 1'],
      ['created_by', 'INTEGER'],
      ['created_at', 'INTEGER'],
      ['updated_at', 'INTEGER'],
      ['cancelled_at', 'INTEGER'],
      ['cancelled_by', 'INTEGER'],
      ['cancel_reason', 'TEXT'],
    ]);
    addColumns(db, 'users', [
      ['must_change_password', 'INTEGER NOT NULL DEFAULT 0'],
      ['created_by', 'INTEGER'],
      ['updated_at', 'INTEGER'],
    ]);
    db.exec(`
      CREATE INDEX IF NOT EXISTS idx_screenings_hall_date ON screenings(hall_id, starts_on);
      CREATE TABLE IF NOT EXISTS audit_log (
        id          INTEGER PRIMARY KEY AUTOINCREMENT,
        at          INTEGER NOT NULL,
        actor_id    INTEGER REFERENCES users(id) ON DELETE SET NULL,
        action      TEXT NOT NULL,
        entity      TEXT NOT NULL,
        entity_id   INTEGER,
        branch_id   INTEGER,
        detail_json TEXT                      -- solo ids y nombres de campos; nunca datos personales
      );
      CREATE INDEX IF NOT EXISTS idx_audit_at ON audit_log(at);
    `);
    // Calificaciones: escala estadounidense -> peruana. Valores desconocidos no se tocan.
    const upd = db.prepare('UPDATE movies SET rating = ? WHERE rating = ?');
    for (const [from, to] of Object.entries(LEGACY_RATING_MAP)) upd.run(to, from);
    ensureSampleHalls(db);
  },
  // 4: compras reales (fase 4a). Columnas e indices nuevos; ademas BORRA las ordenes de ejemplo heredadas (todas las
  // filas de orders existentes en este momento: hasta ahora solo el seed insertaba ordenes, ninguna compra real) con sus
  // butacas, deja screenings.booked_seats en el conteo real de butacas activas y repone a 'scheduled' las funciones
  // guardadas como 'sold_out' (el estado agotada se deriva del conteo; nunca se guarda). No toca nada mas.
  (db) => {
    addColumns(db, 'orders', [
      ['channel', `TEXT NOT NULL DEFAULT 'web'`],  // web | counter (taquilla, fase 4d)
      ['presale', 'INTEGER NOT NULL DEFAULT 0'],   // 1 si se compro con la pelicula en preventa efectiva
      ['idempotency_key', 'TEXT'],
      ['payment_ref', 'TEXT'],                     // referencia simulada (SIM-...); nunca datos de tarjeta
      ['created_ms', 'INTEGER'],                   // instante de la compra (ms); las ordenes heredadas lo tienen NULL
      ['refunded_at', 'INTEGER'],
      ['refund_reason', 'TEXT'],                   // codigo fijo (p. ej. screening_cancelled), nunca texto libre
      ['refunded_by', 'INTEGER'],
    ]);
    addColumns(db, 'order_seats', [
      ['unit_price', 'REAL'],
      ['checked_in_at', 'INTEGER'],                // ingreso a sala (fase 4d)
      ['checked_in_by', 'INTEGER'],
    ]);
    db.exec(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_orders_idem ON orders(user_id, idempotency_key) WHERE idempotency_key IS NOT NULL;
      CREATE INDEX IF NOT EXISTS idx_orders_user ON orders(user_id, created_ms);
      CREATE INDEX IF NOT EXISTS idx_orders_screening ON orders(screening_id, status);
      CREATE INDEX IF NOT EXISTS idx_orders_branch ON orders(branch_id, created_ms);
      CREATE INDEX IF NOT EXISTS idx_order_seats_screening ON order_seats(screening_id, active);
    `);
    db.prepare('DELETE FROM order_seats WHERE order_id IN (SELECT id FROM orders WHERE created_ms IS NULL)').run();
    db.prepare('DELETE FROM orders WHERE created_ms IS NULL').run();
    db.prepare(`UPDATE screenings SET booked_seats = (SELECT COUNT(*) FROM order_seats os WHERE os.screening_id = screenings.id AND os.active = 1)`).run();
    db.prepare(`UPDATE screenings SET status = 'scheduled' WHERE status = 'sold_out'`).run();
  },
];

export function migrate(db) {
  let v = db.pragma('user_version', { simple: true });
  for (; v < MIGRATIONS.length; v++) {
    db.transaction(() => {
      MIGRATIONS[v](db);
      db.pragma(`user_version = ${v + 1}`);
    })();
  }
}
