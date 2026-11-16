// Carga inicial: traslada src/data/store.js a la base de datos.
// NO pisa datos existentes: cada tabla se carga solo si esta vacia (lo que editan las personas del panel
// se conserva). `--reset` borra el archivo antes y recrea todo. `--refresh-screenings` actualiza solo las
// fechas de las funciones de ejemplo (ids de store.js), para renovar la cartelera de demostracion.
// Las fechas de las funciones se calculan en store.js a partir del dia en que
// se ejecuta (hoy, +-1, +2; dia de calendario en America/Lima, igual que el cliente) y aqui se
// escriben como fechas fijas.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb, prepareData, DB_FILE } from './db.js';
import { seedDemoCredentials } from './seedAuth.js';
import { ensureSampleHalls } from './sampleHalls.js';
import { seedMenu } from './menuSeed.js';
import { movies, branches, halls, movieCinema, screenings, users } from '../src/data/store.js';

const run = (db, { refreshScreenings = false } = {}) => {
  // Tablas que ya tienen filas: no se tocan.
  const skip = new Set(['branches','halls','movies','movie_branch','screenings','users']
    .filter((t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c > 0));
  if (refreshScreenings) skip.delete('screenings');
  const up = (table, cols, rows) => {
    if (skip.has(table)) return;
    const names = cols.join(',');
    const params = cols.map((c) => '@' + c).join(',');
    const sets = cols.filter((c) => c !== 'id').map((c) => `${c}=excluded.${c}`).join(',');
    const stmt = db.prepare(`INSERT INTO ${table} (${names}) VALUES (${params}) ON CONFLICT(id) DO UPDATE SET ${sets}`);
    rows.forEach((r) => stmt.run(r));
  };

  db.transaction(() => {
    up('branches', ['id','name','city','address','status','halls_count','manager','formats','img'],
      branches.map((b) => ({ id: b.id, name: b.name, city: b.city, address: b.address, status: b.status,
        halls_count: b.halls, manager: b.manager, formats: b.formats, img: b.img })));

    up('halls', ['id','branch_id','name','type','capacity','status','price_base'],
      halls.map((h) => ({ id: h.id, branch_id: h.branchId, name: h.name, type: h.type, capacity: h.capacity,
        status: h.status, price_base: h.priceBase })));

    up('movies', ['id','title','genre','duration','rating','status','formats_json','director','language','poster',
      'synopsis','featured','release_date','end_date','backdrop','presale'],
      movies.map((m) => ({ id: m.id, title: m.title, genre: m.genre, duration: m.duration, rating: m.rating,
        status: m.status, formats_json: JSON.stringify(m.format), director: m.director, language: m.language,
        poster: m.poster, synopsis: m.synopsis ?? '', featured: m.featured ? 1 : 0, release_date: m.releaseDate,
        end_date: m.endDate, backdrop: m.backdrop ?? null, presale: m.presale ? 1 : 0 })));

    // CORRECCION DE DATOS: movieCinema de store.js apunta a las peliculas de una
    // version anterior. Se conservan sus 8 pares y se agregan los pares
    // (pelicula, sede) que tienen funciones; la pelicula 8 (sin funciones) se
    // habilita en la sede 1. Ids estables: los 8 originales conservan su id.
    const pairs = new Map(movieCinema.map((mc) => [`${mc.movieId}-${mc.branchId}`, {
      movie_id: mc.movieId, branch_id: mc.branchId, active: mc.activa ? 1 : 0, start_date: mc.fechaInicio,
      end_date: mc.fechaFin, formats_json: JSON.stringify(mc.formatos), base_price: mc.precioBase }]));
    const addPair = (movieId, branchId, price) => {
      const k = `${movieId}-${branchId}`;
      if (pairs.has(k)) return;
      const m = movies.find((x) => x.id === movieId);
      pairs.set(k, { movie_id: movieId, branch_id: branchId, active: 1, start_date: m.releaseDate,
        end_date: m.endDate, formats_json: JSON.stringify(m.format), base_price: price });
    };
    [...screenings].sort((a, b) => a.id - b.id).forEach((s) => addPair(s.movieId, s.branchId, s.price));
    if (!movies.every((m) => [...pairs.values()].some((p) => p.movie_id === m.id))) {
      const h = halls.find((x) => x.branchId === 1);
      movies.filter((m) => ![...pairs.values()].some((p) => p.movie_id === m.id))
        .forEach((m) => addPair(m.id, 1, h.priceBase));
    }
    // Un par ya presente en la BD con otro id (si se cambia el orden) no choca: se actualiza por (movie_id, branch_id).
    const mcStmt = db.prepare(`INSERT INTO movie_branch (id,movie_id,branch_id,active,start_date,end_date,formats_json,base_price)
      VALUES (@id,@movie_id,@branch_id,@active,@start_date,@end_date,@formats_json,@base_price)
      ON CONFLICT(movie_id,branch_id) DO UPDATE SET active=excluded.active,start_date=excluded.start_date,
      end_date=excluded.end_date,formats_json=excluded.formats_json,base_price=excluded.base_price`);
    let nextId = Math.max(...movieCinema.map((m) => m.id)) + 1;
    const origId = new Map(movieCinema.map((mc) => [`${mc.movieId}-${mc.branchId}`, mc.id]));
    if (!skip.has('movie_branch')) for (const [k, p] of pairs) mcStmt.run({ ...p, id: origId.get(k) ?? nextId++ });

    up('screenings', ['id','movie_id','hall_id','branch_id','starts_on','start_time','end_time','language','format',
      'price','status','booked_seats','total_seats'],
      screenings.map((s) => ({ id: s.id, movie_id: s.movieId, hall_id: s.hallId, branch_id: s.branchId,
        starts_on: s.date, start_time: s.startTime, end_time: s.endTime, language: s.language, format: s.format,
        // Sin ventas de ejemplo: las butacas vendidas son las de las compras reales (order_seats). El estado 'agotada'
        // se deriva del conteo y nunca se guarda.
        price: s.price, status: s.status === 'sold_out' ? 'scheduled' : s.status, booked_seats: 0, total_seats: s.totalSeats })));

    up('users', ['id','name','email','role','branch_id','status','last_login','avatar'],
      users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, branch_id: u.branchId,
        status: u.status, last_login: u.lastLogin, avatar: u.avatar })));

    // Sedes que declaran salas y no tienen ninguna (solo si las salas se cargaron en esta pasada).
    if (!skip.has('halls')) ensureSampleHalls(db);

    // Confiteria: solo si products esta vacia (y existe: una base antigua sin migrar no la tiene).
    seedMenu(db);

  })();
};

export function seed(db, opts) { run(db, opts); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let db;
  try {
    prepareData(); // migra la base antigua de server/data antes de un posible --reset
    if (process.argv.includes('--reset')) {
      for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) fs.rmSync(f, { force: true });
      console.log('Base de datos borrada:', DB_FILE);
    }
    db = openDb();
  } catch (e) {
    console.error(`\n[ERROR] No se pudo preparar los datos: ${e.message}\n`);
    process.exit(1);
  }
  const nonEmpty = db.prepare('SELECT COUNT(*) c FROM movies').get().c > 0;
  const refreshScreenings = process.argv.includes('--refresh-screenings');
  if (nonEmpty && !refreshScreenings) {
    console.log('La base ya tiene datos: no se modifica nada. Usa "npm run seed -- --reset" para recrearla con los datos de ejemplo,');
    console.log('o "npm run seed -- --refresh-screenings" para renovar solo las fechas de las funciones de ejemplo.');
  }
  seed(db, { refreshScreenings });
  if (!nonEmpty) await seedDemoCredentials(db);
  const n = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  console.log('Seed listo:', Object.fromEntries(
    ['movies','branches','halls','movie_branch','screenings','users','orders','order_seats','products','product_variants','branch_variants'].map((t) => [t, n(t)])));
  db.close();
}
