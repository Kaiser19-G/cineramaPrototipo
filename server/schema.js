// Esquema de la base de datos (SQLite). Se crea con IF NOT EXISTS: es seguro
// ejecutarlo en cada arranque.
export const SCHEMA = `
CREATE TABLE IF NOT EXISTS branches (
  id          INTEGER PRIMARY KEY,
  name        TEXT NOT NULL,
  city        TEXT NOT NULL,
  address     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'active',
  halls_count INTEGER NOT NULL DEFAULT 0,   -- contador tal como lo muestra el sitio hoy
  manager     TEXT,
  formats     TEXT NOT NULL,
  img         TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS halls (
  id         INTEGER PRIMARY KEY,
  branch_id  INTEGER NOT NULL REFERENCES branches(id),
  name       TEXT NOT NULL,
  type       TEXT NOT NULL CHECK (type IN ('2D','3D')),
  capacity   INTEGER NOT NULL CHECK (capacity > 0),
  status     TEXT NOT NULL CHECK (status IN ('active','maintenance')),
  price_base REAL NOT NULL,
  UNIQUE (branch_id, name)
);

CREATE TABLE IF NOT EXISTS movies (
  id           INTEGER PRIMARY KEY,
  title        TEXT NOT NULL,
  genre        TEXT,
  duration     INTEGER NOT NULL,
  rating       TEXT,
  status       TEXT NOT NULL DEFAULT 'active',
  formats_json TEXT NOT NULL,
  director     TEXT,
  language     TEXT CHECK (language IN ('ES','EN')),
  poster       TEXT,
  synopsis     TEXT NOT NULL DEFAULT '',
  featured     INTEGER NOT NULL DEFAULT 0,
  release_date TEXT,
  end_date     TEXT,
  backdrop     TEXT,
  presale      INTEGER NOT NULL DEFAULT 0   -- fase 3/4: preventa (tope de entradas); no se expone aun
);

CREATE TABLE IF NOT EXISTS movie_branch (
  id           INTEGER PRIMARY KEY,
  movie_id     INTEGER NOT NULL REFERENCES movies(id),
  branch_id    INTEGER NOT NULL REFERENCES branches(id),
  active       INTEGER NOT NULL DEFAULT 1,
  start_date   TEXT,
  end_date     TEXT,
  formats_json TEXT NOT NULL,
  base_price   REAL NOT NULL,
  UNIQUE (movie_id, branch_id)
);

CREATE TABLE IF NOT EXISTS screenings (
  id           INTEGER PRIMARY KEY,
  movie_id     INTEGER NOT NULL REFERENCES movies(id),
  hall_id      INTEGER NOT NULL REFERENCES halls(id),
  branch_id    INTEGER NOT NULL REFERENCES branches(id),
  starts_on    TEXT NOT NULL CHECK (starts_on GLOB '[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]'),
  start_time   TEXT NOT NULL,
  end_time     TEXT NOT NULL,
  language     TEXT NOT NULL CHECK (language IN ('ES','EN')),
  format       TEXT NOT NULL,
  price        REAL NOT NULL,
  status       TEXT NOT NULL CHECK (status IN ('draft','scheduled','active','sold_out','finished','cancelled')),
  booked_seats INTEGER NOT NULL DEFAULT 0,
  total_seats  INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_screenings_branch_date ON screenings(branch_id, starts_on);
CREATE INDEX IF NOT EXISTS idx_screenings_movie ON screenings(movie_id);

CREATE TABLE IF NOT EXISTS users (
  id         INTEGER PRIMARY KEY,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL UNIQUE,
  role       TEXT NOT NULL,                 -- sin CHECK: los roles cambian en la fase 2
  branch_id  INTEGER REFERENCES branches(id),
  status     TEXT NOT NULL DEFAULT 'active',
  last_login TEXT,
  avatar     TEXT
);

CREATE TABLE IF NOT EXISTS orders (
  id            TEXT PRIMARY KEY,
  screening_id  INTEGER NOT NULL REFERENCES screenings(id),
  branch_id     INTEGER NOT NULL REFERENCES branches(id),
  user_id       INTEGER REFERENCES users(id),   -- fase 2/4: cuenta compradora
  customer_name TEXT NOT NULL,
  email         TEXT NOT NULL,
  amount        REAL NOT NULL,
  method        TEXT NOT NULL,
  status        TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','refunded','cancelled')),
  created_at    TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS order_seats (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  order_id     TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  screening_id INTEGER NOT NULL REFERENCES screenings(id),
  seat         TEXT NOT NULL,
  active       INTEGER NOT NULL DEFAULT 1 CHECK (active IN (0,1)),
  UNIQUE (order_id, seat)
);
-- Una butaca no puede venderse dos veces en la misma funcion. Parcial: las
-- butacas de ordenes rechazadas/reembolsadas/canceladas (active = 0) se liberan.
-- La capa de servicio mantiene "active" (sin trigger).
CREATE UNIQUE INDEX IF NOT EXISTS uq_seat_per_screening
  ON order_seats(screening_id, seat) WHERE active = 1;
`;
