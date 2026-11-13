// Carga inicial: traslada src/data/store.js a la base de datos.
// Repetible (upsert por id, en una transaccion). `--reset` borra el archivo antes.
// Las fechas de las funciones se calculan en store.js a partir del dia en que
// se ejecuta (hoy, +-1, +2; convencion UTC igual que el cliente) y aqui se
// escriben como fechas fijas.
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { openDb, DB_FILE } from './db.js';
import { movies, branches, halls, movieCinema, screenings, orders, users } from '../src/data/store.js';

const run = (db) => {
  const up = (table, cols, rows) => {
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
      'synopsis','featured','release_date','end_date','backdrop'],
      movies.map((m) => ({ id: m.id, title: m.title, genre: m.genre, duration: m.duration, rating: m.rating,
        status: m.status, formats_json: JSON.stringify(m.format), director: m.director, language: m.language,
        poster: m.poster, synopsis: m.synopsis ?? '', featured: m.featured ? 1 : 0, release_date: m.releaseDate,
        end_date: m.endDate, backdrop: m.backdrop ?? null })));

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
    for (const [k, p] of pairs) mcStmt.run({ ...p, id: origId.get(k) ?? nextId++ });

    up('screenings', ['id','movie_id','hall_id','branch_id','starts_on','start_time','end_time','language','format',
      'price','status','booked_seats','total_seats'],
      screenings.map((s) => ({ id: s.id, movie_id: s.movieId, hall_id: s.hallId, branch_id: s.branchId,
        starts_on: s.date, start_time: s.startTime, end_time: s.endTime, language: s.language, format: s.format,
        price: s.price, status: s.status, booked_seats: s.bookedSeats, total_seats: s.totalSeats })));

    up('users', ['id','name','email','role','branch_id','status','last_login','avatar'],
      users.map((u) => ({ id: u.id, name: u.name, email: u.email, role: u.role, branch_id: u.branchId,
        status: u.status, last_login: u.lastLogin, avatar: u.avatar })));

    // CORRECCION DE DATOS: la sede de cada orden debe ser la de su funcion
    // (store.js tiene 1248 -> sede 3 y 1252 -> sede 2, pero sus funciones son de la sede 1).
    const scrBranch = Object.fromEntries(screenings.map((s) => [s.id, s.branchId]));
    up('orders', ['id','screening_id','branch_id','customer_name','email','amount','method','status','created_at'],
      orders.map((o) => ({ id: o.id, screening_id: o.screeningId, branch_id: scrBranch[o.screeningId],
        customer_name: o.customer, email: o.email, amount: o.amount, method: o.method, status: o.status,
        created_at: o.date })));

    const seatStmt = db.prepare(`INSERT INTO order_seats (order_id,screening_id,seat,active) VALUES (?,?,?,?)
      ON CONFLICT(order_id,seat) DO UPDATE SET screening_id=excluded.screening_id, active=excluded.active`);
    orders.forEach((o) => o.seats.forEach((seat) =>
      seatStmt.run(o.id, o.screeningId, seat, o.status === 'approved' ? 1 : 0)));
  })();
};

export function seed(db) { run(db); }

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--reset')) {
    for (const f of [DB_FILE, DB_FILE + '-wal', DB_FILE + '-shm']) fs.rmSync(f, { force: true });
    console.log('Base de datos borrada:', DB_FILE);
  }
  const db = openDb();
  seed(db);
  const n = (t) => db.prepare(`SELECT COUNT(*) c FROM ${t}`).get().c;
  console.log('Seed listo:', Object.fromEntries(
    ['movies','branches','halls','movie_branch','screenings','users','orders','order_seats'].map((t) => [t, n(t)])));
  db.close();
}
