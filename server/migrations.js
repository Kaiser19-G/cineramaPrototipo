// Migraciones minimas con PRAGMA user_version. La linea base (version 0) es el
// esquema de schema.js (CREATE TABLE IF NOT EXISTS). Cada migracion corre en una
// transaccion y sube user_version; son idempotentes sobre columnas ya existentes.

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
