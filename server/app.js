import express from 'express';
import { createAuth } from './auth/router.js';
import { createClaims } from './claims/router.js';
import { createMovies } from './admin/movies.js';
import { createScreenings } from './admin/screenings.js';
import { createHalls } from './admin/halls.js';
import { createUsers } from './admin/users.js';
import { createOrders } from './orders/router.js';
import { createSales } from './admin/sales.js';
import { createCounter } from './admin/counter.js';
import { todayInLima, nowInLima } from '../src/data/limaDate.js';
import { screeningSpan } from '../src/shared/scheduling.js';
import { mapMovie, mapBranch, mapHall, mapScreening, mapMovieBranch } from './mappers.js';


const VISIBLE_MOVIE = `(m.status = 'upcoming' OR (m.status = 'active' AND EXISTS (
  SELECT 1 FROM movie_branch mb JOIN branches b ON b.id = mb.branch_id
  WHERE mb.movie_id = m.id AND mb.active = 1 AND b.status = 'active')))`;

const prepare = (db) => ({
  // Publico: solo peliculas en cartelera habilitadas en alguna sede activa, y las proximas.
  movies: db.prepare(`SELECT m.* FROM movies m WHERE ${VISIBLE_MOVIE} ORDER BY m.id`),
  moviesByBranch: db.prepare(`SELECT m.* FROM movies m JOIN movie_branch mb ON mb.movie_id = m.id
    WHERE m.status IN ('active','upcoming') AND mb.branch_id = ? AND mb.active = 1 ORDER BY m.id`),
  branches: db.prepare('SELECT * FROM branches ORDER BY id'),
  halls: db.prepare('SELECT * FROM halls ORDER BY id'),
  hallsByBranch: db.prepare('SELECT * FROM halls WHERE branch_id = ? ORDER BY id'),
  // Publico: nada de borradores ni funciones canceladas.
  screenings: db.prepare(`SELECT * FROM screenings WHERE status NOT IN ('draft','cancelled') ORDER BY id`),
  screeningsByBranch: db.prepare(`SELECT * FROM screenings WHERE branch_id = ? AND status NOT IN ('draft','cancelled') ORDER BY id`),
  movieBranch: db.prepare(`SELECT mb.* FROM movie_branch mb JOIN movies m ON m.id = mb.movie_id
    WHERE mb.active = 1 AND ${VISIBLE_MOVIE} ORDER BY mb.id`),
});

// Fabrica de la app (sin escuchar en un puerto): index.js la arranca y las
// pruebas (server/test) la montan sobre una base temporal.
export function createApp(db, opts = {}) {
  const q = prepare(db);
  const auth = createAuth(db, opts);
  const claims = createClaims(db, auth, opts);
  const adminMovies = createMovies(db, auth, opts);
  const adminScreenings = createScreenings(db, opts);
  const adminHalls = createHalls(db, opts);
  const adminUsers = createUsers(db, auth, opts);
  const orders = createOrders(db, auth, opts);
  const sales = createSales(db, auth, opts);
  const counter = createCounter(db, auth, opts);
  const clock = opts.clock ?? Date.now;
  const today = () => todayInLima(new Date(clock()));
  const app = express();
  app.disable('x-powered-by');
  // Detras del proxy de Vite (xfwd) la IP real llega en X-Forwarded-For.
  app.set('trust proxy', 'loopback');
  app.use('/api', auth.csrf);
  app.use('/api', express.json({ limit: '16kb' }));

  // ?branchId=N opcional; si viene y no es un entero positivo -> 400.
  const branchParam = (req, res) => {
    if (req.query.branchId === undefined) return null;
    const n = Number(req.query.branchId);
    if (!Number.isInteger(n) || n <= 0) { res.status(400).json({ error: 'branchId invalido' }); return false; }
    return n;
  };
  const listHandler = (all, byBranch, map) => (req, res) => {
    const b = branchParam(req, res);
    if (b === false) return;
    res.json((b === null ? all.all() : byBranch.all(b)).map(map));
  };

  app.get('/api/health', (_req, res) => res.json({ ok: true }));
  app.use('/api/auth', auth.router);
  app.use('/api/claims', claims.router);
  // Con contrasena temporal pendiente, ninguna ruta del panel responde (403 password_change_required).
  app.use('/api/admin', auth.loadSession, auth.passwordChangeGate);
  app.use('/api/admin/central/claims', claims.adminRouter);
  app.use('/api/admin/central/users', adminUsers.router);
  const staffOnly = [auth.loadSession, auth.requireAuth, auth.requireTier('central', 'branch')];
  app.use('/api/admin/movies', ...staffOnly, adminMovies.router);
  app.use('/api/admin/screenings', ...staffOnly, adminScreenings.router);
  app.use('/api/admin/halls', ...staffOnly, adminHalls.router);
  app.use('/api/admin/orders', sales.orders);
  app.use('/api/admin/orders', counter.refunds);
  app.use('/api/admin/counter', counter.router);
  app.use('/api/admin/reports', sales.reports);
  app.use('/api/admin/dashboard', sales.dashboard);
  app.use('/api/admin', auth.adminRouter);
  // Lecturas publicas: se revalidan siempre (ETag) para que un cambio del panel llegue sin esperar.
  app.use(['/api/movies', '/api/branches', '/api/halls', '/api/screenings', '/api/catalog'], (_req, res, next) => {
    res.set('Cache-Control', 'no-cache');
    next();
  });
  app.get('/api/movies', listHandler(q.movies, q.moviesByBranch, (r) => mapMovie(r, today())));
  app.get('/api/branches', (_req, res) => res.json(q.branches.all().map(mapBranch)));
  app.get('/api/halls', listHandler(q.halls, q.hallsByBranch, mapHall));
  // Publico: estado efectivo y sin funciones que ya empezaron (hora de Lima).
  const publicScreenings = (rows) => {
    const t = nowInLima(new Date(clock())).abs;
    return rows
      .filter((r) => screeningSpan(r.starts_on, r.start_time, r.end_time).start > t)
      .map((r) => mapScreening(r, t))
      .filter((s) => s.status !== 'finished');
  };
  // Compras (mapa de butacas publico; comprar exige cuenta de cliente).
  app.use('/api', orders.router);
  app.get('/api/screenings', (req, res) => {
    const b = branchParam(req, res);
    if (b === false) return;
    res.json(publicScreenings(b === null ? q.screenings.all() : q.screeningsByBranch.all(b)));
  });
  app.get('/api/catalog', (_req, res) => {
    const t = today();
    res.json({
    movies: q.movies.all().map((r) => mapMovie(r, t)),
    branches: q.branches.all().map(mapBranch),
    halls: q.halls.all().map(mapHall),
    screenings: publicScreenings(q.screenings.all()),
    movieCinema: q.movieBranch.all().map(mapMovieBranch),
    });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'No encontrado' }));
  // Errores: sin volcar el objeto (los mensajes de JSON invalido incluyen un trozo del cuerpo,
  // que puede contener datos personales). Solo se registra el tipo.
  app.use((err, _req, res, _next) => {
    if (err.type === 'entity.parse.failed' || err.status === 400) return res.status(400).json({ error: 'invalid_json' });
    if (err.type === 'entity.too.large') return res.status(413).json({ error: 'too_large' });
    if (err.type === 'request.aborted' || err.type === 'request.size.invalid') return res.status(400).json({ error: 'bad_request' });
    console.error('[error]', err.code || err.type || err.name || 'desconocido');
    res.status(500).json({ error: 'Error interno' });
  });
  return { app, auth, claims };
}
