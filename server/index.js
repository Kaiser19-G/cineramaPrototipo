import express from 'express';
import { openDb, DB_FILE } from './db.js';
import { todayInLima } from '../src/data/limaDate.js';

const PORT = Number(process.env.PORT) || 3001;
const HOST = '127.0.0.1';

const db = openDb();

// Mismas formas que src/data/store.js (claves en camelCase, orden por id).
const mapMovie = (r) => {
  const m = {
    id: r.id, title: r.title, genre: r.genre, duration: r.duration, rating: r.rating, status: r.status,
    format: JSON.parse(r.formats_json), director: r.director, language: r.language, poster: r.poster,
    synopsis: r.synopsis, featured: !!r.featured, releaseDate: r.release_date, endDate: r.end_date,
  };
  if (r.backdrop) m.backdrop = r.backdrop;
  return m;
};
const mapBranch = (r) => ({
  id: r.id, name: r.name, city: r.city, address: r.address, status: r.status, halls: r.halls_count,
  manager: r.manager, formats: r.formats, img: r.img,
});
const mapHall = (r) => ({
  id: r.id, branchId: r.branch_id, name: r.name, type: r.type, capacity: r.capacity, status: r.status,
  priceBase: r.price_base,
});
const mapScreening = (r) => ({
  id: r.id, movieId: r.movie_id, hallId: r.hall_id, branchId: r.branch_id, date: r.starts_on,
  startTime: r.start_time, endTime: r.end_time, language: r.language, format: r.format, price: r.price,
  status: r.status, bookedSeats: r.booked_seats, totalSeats: r.total_seats,
});
const mapMovieBranch = (r) => ({
  id: r.id, movieId: r.movie_id, branchId: r.branch_id, activa: !!r.active, fechaInicio: r.start_date,
  fechaFin: r.end_date, formatos: JSON.parse(r.formats_json), precioBase: r.base_price,
});

const q = {
  movies: db.prepare(`SELECT * FROM movies WHERE status = 'active' ORDER BY id`),
  moviesByBranch: db.prepare(`SELECT m.* FROM movies m JOIN movie_branch mb ON mb.movie_id = m.id
    WHERE m.status = 'active' AND mb.branch_id = ? AND mb.active = 1 ORDER BY m.id`),
  branches: db.prepare('SELECT * FROM branches ORDER BY id'),
  halls: db.prepare('SELECT * FROM halls ORDER BY id'),
  hallsByBranch: db.prepare('SELECT * FROM halls WHERE branch_id = ? ORDER BY id'),
  screenings: db.prepare('SELECT * FROM screenings ORDER BY id'),
  screeningsByBranch: db.prepare('SELECT * FROM screenings WHERE branch_id = ? ORDER BY id'),
  movieBranch: db.prepare('SELECT * FROM movie_branch ORDER BY id'),
};

const app = express();
app.disable('x-powered-by');

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
app.get('/api/movies', listHandler(q.movies, q.moviesByBranch, mapMovie));
app.get('/api/branches', (_req, res) => res.json(q.branches.all().map(mapBranch)));
app.get('/api/halls', listHandler(q.halls, q.hallsByBranch, mapHall));
app.get('/api/screenings', listHandler(q.screenings, q.screeningsByBranch, mapScreening));
app.get('/api/catalog', (_req, res) => res.json({
  movies: q.movies.all().map(mapMovie),
  branches: q.branches.all().map(mapBranch),
  halls: q.halls.all().map(mapHall),
  screenings: q.screenings.all().map(mapScreening),
  movieCinema: q.movieBranch.all().map(mapMovieBranch),
}));
app.use('/api', (_req, res) => res.status(404).json({ error: 'No encontrado' }));
app.use((err, _req, res, _next) => { console.error(err); res.status(500).json({ error: 'Error interno' }); });

// Aviso si no hay funciones de hoy en adelante (fecha de Lima, igual que el cliente).
const today = todayInLima();
const upcoming = db.prepare('SELECT COUNT(*) c FROM screenings WHERE starts_on >= ?').get(today).c;
if (upcoming === 0) {
  console.warn('\n[AVISO] No hay funciones con fecha de hoy en adelante: el sitio no mostrara horarios.');
  console.warn('        Ejecuta "npm run seed" para refrescar las fechas de las funciones de ejemplo.\n');
}

const server = app.listen(PORT, HOST, () => console.log(`API Cinerama en http://${HOST}:${PORT} (BD: ${DB_FILE})`));
const stop = () => { server.close(); db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
