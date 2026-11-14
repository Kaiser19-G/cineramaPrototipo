import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startEnv, regBody, DEMO_PASSWORD } from './helpers.js';

let env;
// fetch (undici) oculta los 304 de peticiones condicionales: se usa http directo.
const conditionalGet = (url, etag) => new Promise((resolve, reject) => {
  http.get(env.base + url, { headers: { 'if-none-match': etag } }, (res) => { res.resume(); res.on('end', () => resolve({ status: res.statusCode, etag: res.headers.etag })); }).on('error', reject);
});
let admin, manager, cashier, other, customer;
const NEW = { title: 'Pelicula de prueba', genre: 'Drama', duration: 100, rating: '+14', format: ['2D'], language: 'ES' };

const login = async (email) => {
  const c = env.client();
  const r = await c.post('/api/auth/login', { email, password: DEMO_PASSWORD });
  assert.equal(r.status, 200, email);
  return c;
};
const patch = (c, id, body) => c.call('PATCH', `/api/admin/movies/${id}`, body);
const put = (c, url, body) => c.call('PUT', url, body);

before(async () => {
  env = await startEnv();
  admin = await login('admin@cinerama.com');
  manager = await login('sarah.mitchell@cinerama.com');   // gerente, sede 1
  other = await login('emily.rodriguez@cinerama.com');    // gerente, sede 3
  cashier = await login('michael.chen@cinerama.com');     // cajero, sede 1
  customer = env.client();
  const reg = await customer.post('/api/auth/register', regBody({ dni: '60000011', email: 'cli-mov@example.com', phone: '991111122' }));
  await customer.post('/api/auth/verify-phone', { code: reg.json.simulation.code });
});
after(() => env.stop());

describe('permisos de /api/admin/movies', () => {
  test('401 sin sesion y 403 para clientes, en todas las rutas', async () => {
    const anon = env.client();
    for (const c of [anon, customer]) {
      const want = c === anon ? 401 : 403;
      assert.equal((await c.get('/api/admin/movies')).status, want);
      assert.equal((await c.get('/api/admin/movies/1')).status, want);
      assert.equal((await c.post('/api/admin/movies', NEW)).status, want);
      assert.equal((await patch(c, 1, { version: 1 })).status, want);
      assert.equal((await put(c, '/api/admin/movies/1/branches', { branches: [] })).status, want);
    }
  });

  test('gerente y cajero: leen solo lo habilitado en su sede; no escriben', async () => {
    const list = await manager.get('/api/admin/movies');
    assert.equal(list.status, 200);
    const all = (await admin.get('/api/admin/movies')).json.movies;
    assert.ok(list.json.movies.length < all.length);
    for (const m of list.json.movies) {
      assert.ok(m.branches.length >= 1 && m.branches.every((b) => b.branchId === 1 && b.active));
    }
    assert.equal((await cashier.get('/api/admin/movies')).status, 200);
    for (const c of [manager, cashier]) {
      assert.equal((await c.post('/api/admin/movies', NEW)).status, 403);
      assert.equal((await patch(c, 1, { version: 1, featured: true })).status, 403);
      assert.equal((await put(c, '/api/admin/movies/1/branches', { branches: [] })).status, 403);
      assert.equal((await put(c, '/api/admin/movies/1/branches/1', {})).status, 403);
    }
  });

  test('alcance por sede: un id fuera de la sede del personal responde 404', async () => {
    // La pelicula 7 solo esta habilitada en la sede 2.
    assert.equal((await admin.get('/api/admin/movies/7')).status, 200);
    assert.equal((await manager.get('/api/admin/movies/7')).status, 404);
    assert.equal((await other.get('/api/admin/movies/1')).status, 404);
    assert.equal((await manager.get('/api/admin/movies/1')).status, 200);
    assert.equal((await manager.get('/api/admin/movies/9999')).status, 404);
  });

  test('la lectura del personal no filtra otras sedes ni datos internos', async () => {
    const one = (await manager.get('/api/admin/movies/1')).json.movie;
    assert.ok(one.branches.every((b) => b.branchId === 1));
    const text = JSON.stringify(one);
    assert.ok(!/password|hash|dni/i.test(text));
  });

  test('no existe DELETE', async () => {
    const r = await admin.call('DELETE', '/api/admin/movies/1', {});
    assert.ok([404, 405].includes(r.status));
    assert.equal((await admin.get('/api/admin/movies/1')).status, 200);
  });
});

describe('crear y editar peliculas', () => {
  test('crear: 201, valores por defecto y auditoria sin datos personales', async () => {
    const r = await admin.post('/api/admin/movies', NEW);
    assert.equal(r.status, 201);
    const m = r.json.movie;
    assert.equal(m.status, 'draft');
    assert.equal(m.version, 1);
    assert.equal(m.presale, false);
    assert.deepEqual(m.branches, []);
    const row = env.db.prepare(`SELECT * FROM audit_log WHERE entity = 'movie' AND entity_id = ? AND action = 'movie.create'`).get(m.id);
    assert.ok(row);
    assert.equal(row.actor_id, 1);
    assert.ok(!/@|dni|phone|password/i.test(row.detail_json ?? ''));
  });

  test('validacion por campo (codigos)', async () => {
    const bad = {
      title: '   ', genre: 'Inexistente', duration: 0, rating: 'PG', format: [], language: 'FR', status: 'x',
      poster: 'http://x.com/a.jpg', backdrop: 'https://a.com/a b.jpg', synopsis: 'x'.repeat(2001),
      releaseDate: '2026-13-45', endDate: 'hoy', featured: 'si', presale: 1,
    };
    const r = await admin.post('/api/admin/movies', bad);
    assert.equal(r.status, 400);
    assert.equal(r.json.error, 'validation');
    assert.deepEqual(r.json.errors, {
      title: 'required', genre: 'invalid_option', duration: 'out_of_range', rating: 'invalid_option', format: 'required',
      language: 'invalid_option', status: 'invalid_option', poster: 'invalid_url', backdrop: 'invalid_url',
      synopsis: 'too_long', releaseDate: 'invalid_date', endDate: 'invalid_date', featured: 'invalid', presale: 'invalid',
    });
    const dates = await admin.post('/api/admin/movies', { ...NEW, releaseDate: '2026-12-10', endDate: '2026-12-01' });
    assert.deepEqual(dates.json.errors, { endDate: 'date_order' });
    const noDate = await admin.post('/api/admin/movies', { ...NEW, presale: true });
    assert.deepEqual(noDate.json.errors, { releaseDate: 'required_for_presale' });
  });

  test('posters: solo https sin espacios, comillas ni parentesis; maximo 2048', async () => {
    const bad = ['javascript:alert(1)', 'http://a.com/x.jpg', 'https://a.com/x(1).jpg', 'https://a.com/x".jpg', "https://a.com/x'.jpg",
      'https://a.com/x y.jpg', 'https://a.com/x\\y.jpg', `https://a.com/${'a'.repeat(2048)}`, '//a.com/x.jpg'];
    for (const poster of bad) {
      const r = await admin.post('/api/admin/movies', { ...NEW, poster });
      assert.equal(r.status, 400, poster.slice(0, 40));
      assert.equal(r.json.errors.poster, 'invalid_url');
    }
    const ok = await admin.post('/api/admin/movies', { ...NEW, poster: 'https://example.com/p/poster%201.jpg?x=1' });
    assert.equal(ok.status, 201);
    const empty = await admin.post('/api/admin/movies', { ...NEW, poster: '' });
    assert.equal(empty.json.movie.poster, null);
  });

  test('editar: sube la version; version ausente -> 400; version vieja -> 409 stale con la entidad actual', async () => {
    const m = (await admin.post('/api/admin/movies', NEW)).json.movie;
    assert.equal((await patch(admin, m.id, { title: 'Sin version' })).json.errors.version, 'required');
    const a = await patch(admin, m.id, { version: 1, title: 'Cambio A', featured: true });
    assert.equal(a.status, 200);
    assert.equal(a.json.movie.version, 2);
    assert.equal(a.json.movie.title, 'Cambio A');
    const b = await patch(admin, m.id, { version: 1, title: 'Cambio B' });
    assert.equal(b.status, 409);
    assert.equal(b.json.error, 'stale');
    assert.equal(b.json.current.title, 'Cambio A');
    assert.equal(b.json.current.version, 2);
    assert.equal((await env.db.prepare('SELECT title FROM movies WHERE id = ?').get(m.id)).title, 'Cambio A');
    assert.equal((await patch(admin, 99999, { version: 1 })).status, 404);
    const bad = await patch(admin, m.id, { version: 2, duration: 'x', format: ['4D'] });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.json.errors, { duration: 'out_of_range', format: 'invalid_option' });
    // dos cambios simultaneos con la misma version: solo uno gana
    const [x, y] = await Promise.all([patch(admin, m.id, { version: 2, rating: '+18' }), patch(admin, m.id, { version: 2, rating: 'APT' })]);
    assert.deepEqual([x.status, y.status].sort(), [200, 409]);
  });

  test('ids invalidos y cuerpo no objeto', async () => {
    assert.equal((await patch(admin, 'abc', { version: 1 })).status, 404);
    assert.equal((await admin.call('PATCH', '/api/admin/movies/1', [1, 2])).status, 400);
  });
});

describe('funciones futuras', () => {
  test('has_future_screenings: pasar a un estado no activo o quitar un formato en uso', async () => {
    const m = (await admin.post('/api/admin/movies', { ...NEW, status: 'active', format: ['2D', '3D'] })).json.movie;
    await put(admin, `/api/admin/movies/${m.id}/branches/1`, { active: true });
    env.db.prepare(`INSERT INTO screenings (movie_id,hall_id,branch_id,starts_on,start_time,end_time,language,format,price,status,booked_seats,total_seats)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(m.id, 1, 1, '2099-01-01', '15:00', '16:40', 'ES', '3D', 30, 'scheduled', 0, 280);
    const r = await patch(admin, m.id, { version: 1, status: 'archived' });
    assert.equal(r.status, 409);
    assert.equal(r.json.error, 'has_future_screenings');
    assert.equal(r.json.count, 1);
    assert.equal(r.json.screenings[0].date, '2099-01-01');
    const f = await patch(admin, m.id, { version: 1, format: ['2D'] });
    assert.equal(f.status, 409);
    assert.equal(f.json.error, 'has_future_screenings');
    // Reenviar la misma lista de formatos (el formulario siempre la envia) no cuenta como quitar un formato
    assert.equal((await patch(admin, m.id, { version: 1, format: ['3D', '2D'], title: 'Mismos formatos' })).status, 200);
    assert.equal((await patch(admin, m.id, { version: 2, format: ['2D'] })).status, 409);
    // Sin tocar estado ni formatos si se puede editar
    assert.equal((await patch(admin, m.id, { version: 2, title: 'Sigue activa', featured: true })).status, 200);
    // Cancelada la funcion, ya se puede archivar
    env.db.prepare(`UPDATE screenings SET status = 'cancelled' WHERE movie_id = ?`).run(m.id);
    assert.equal((await patch(admin, m.id, { version: 3, status: 'archived' })).status, 200);
  });

  test('deshabilitar una sede con funciones futuras de esa pelicula -> 409', async () => {
    const m = (await admin.post('/api/admin/movies', { ...NEW, status: 'active' })).json.movie;
    assert.equal((await put(admin, `/api/admin/movies/${m.id}/branches`, { branches: [{ branchId: 1 }, { branchId: 2 }] })).status, 200);
    env.db.prepare(`INSERT INTO screenings (movie_id,hall_id,branch_id,starts_on,start_time,end_time,language,format,price,status,booked_seats,total_seats)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`).run(m.id, 6, 2, '2099-01-02', '18:00', '19:40', 'ES', '2D', 18, 'scheduled', 0, 200);
    const off = await put(admin, `/api/admin/movies/${m.id}/branches/2`, { active: false });
    assert.equal(off.status, 409);
    assert.equal(off.json.error, 'has_future_screenings');
    const repl = await put(admin, `/api/admin/movies/${m.id}/branches`, { branches: [{ branchId: 1 }] });
    assert.equal(repl.status, 409);
    // La sede sin funciones si se puede quitar
    const ok = await put(admin, `/api/admin/movies/${m.id}/branches/1`, { active: false });
    assert.equal(ok.status, 200);
    assert.equal(ok.json.movie.branches.find((b) => b.branchId === 1).active, false);
    assert.equal(ok.json.movie.branches.find((b) => b.branchId === 2).active, true);
  });
});

describe('habilitar por sede', () => {
  test('PUT /branches reemplaza; validaciones por fila; sede inexistente', async () => {
    const m = (await admin.post('/api/admin/movies', { ...NEW, format: ['2D'] })).json.movie;
    const ok = await put(admin, `/api/admin/movies/${m.id}/branches`, { branches: [{ branchId: 1, basePrice: 22.5 }, { branchId: 3, startDate: '2026-12-01', endDate: '2027-01-01' }] });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.json.movie.branches.map((b) => [b.branchId, b.active, b.basePrice]), [[1, true, 22.5], [3, true, 18]].map(([a, b, c]) => [a, b, a === 3 ? ok.json.movie.branches[1].basePrice : c]));
    const bad = await put(admin, `/api/admin/movies/${m.id}/branches`, { branches: [{ branchId: 99 }, { branchId: 1, formats: ['3D'] }, { branchId: 1 }, { branchId: 2, endDate: '2020-01-01', startDate: '2021-01-01', basePrice: -3 }] });
    assert.equal(bad.status, 400);
    assert.deepEqual(bad.json.errors.branches, {
      0: { branchId: 'invalid' }, 1: { formats: 'not_in_movie' }, 2: { branchId: 'duplicate' }, 3: { endDate: 'date_order', basePrice: 'out_of_range' },
    });
    assert.equal((await put(admin, '/api/admin/movies/99999/branches', { branches: [] })).status, 404);
    assert.equal((await put(admin, `/api/admin/movies/${m.id}/branches`, { branches: 'x' })).status, 400);
    // la peticion invalida no cambio nada
    assert.equal(admin && (await admin.get(`/api/admin/movies/${m.id}`)).json.movie.branches.length, 2);
  });
});

describe('catalogo publico', () => {
  test('no expone borradores, funciones canceladas ni el campo manager; ni peliculas sin sede habilitada', async () => {
    const draft = (await admin.post('/api/admin/movies', { ...NEW, title: 'Borrador secreto', status: 'draft' })).json.movie;
    const orphan = (await admin.post('/api/admin/movies', { ...NEW, title: 'Activa sin sede', status: 'active' })).json.movie;
    const live = (await admin.post('/api/admin/movies', { ...NEW, title: 'Activa con sede', status: 'active', branches: [{ branchId: 1 }] })).json.movie;
    const soon = (await admin.post('/api/admin/movies', { ...NEW, title: 'Proxima', status: 'upcoming' })).json.movie;
    const arch = (await admin.post('/api/admin/movies', { ...NEW, title: 'Archivada', status: 'archived', branches: [{ branchId: 1 }] })).json.movie;
    const cat = (await env.client().get('/api/catalog')).json;
    const ids = cat.movies.map((m) => m.id);
    assert.ok(ids.includes(live.id) && ids.includes(soon.id));
    for (const m of [draft, orphan, arch]) assert.ok(!ids.includes(m.id), m.title);
    assert.ok(cat.movieCinema.every((mc) => mc.activa && ids.includes(mc.movieId)));
    assert.ok(cat.branches.every((b) => !('manager' in b)));
    assert.ok(!JSON.stringify(cat).includes('Sarah Mitchell'));
    // funciones: sin borradores ni canceladas
    const statuses = new Set(cat.screenings.map((s) => s.status));
    assert.ok(!statuses.has('draft') && !statuses.has('cancelled'));
    env.db.prepare(`UPDATE screenings SET status = 'cancelled' WHERE id = 1`).run();
    const again = (await env.client().get('/api/catalog')).json;
    assert.ok(!again.screenings.some((s) => s.id === 1));
    assert.ok(!again.screenings.some((s) => s.id === 7)); // borrador del ejemplo
    // /api/movies y /api/screenings usan las mismas reglas
    assert.ok(!(await env.client().get('/api/movies')).json.some((m) => m.id === draft.id));
    assert.ok(!(await env.client().get('/api/screenings')).json.some((s) => s.status === 'cancelled'));
    // no hay campos internos en las peliculas publicas
    for (const m of cat.movies) assert.ok(!('version' in m) && !('updatedAt' in m));
  });

  test('preventa efectiva y estreno, con reloj controlado (dia de Lima)', async () => {
    const cl = env.clock;
    const saved = cl.now;
    // hoy en Lima segun el reloj: 2026-11-12
    const pre = (await admin.post('/api/admin/movies', { ...NEW, title: 'En preventa', status: 'active', presale: true, releaseDate: '2026-11-20', branches: [{ branchId: 1 }] })).json.movie;
    const flag = (await admin.post('/api/admin/movies', { ...NEW, title: 'Marca vieja', status: 'active', presale: true, releaseDate: '2026-11-12', branches: [{ branchId: 1 }] })).json.movie;
    const premiere = (await admin.post('/api/admin/movies', { ...NEW, title: 'Reciente', status: 'active', releaseDate: '2026-10-30', branches: [{ branchId: 1 }] })).json.movie;
    const old = (await admin.post('/api/admin/movies', { ...NEW, title: 'Antigua', status: 'active', releaseDate: '2026-10-28', branches: [{ branchId: 1 }] })).json.movie;
    const pick = async () => Object.fromEntries((await env.client().get('/api/catalog')).json.movies.map((m) => [m.id, m]));
    try {
      let c = await pick();
      assert.equal(c[pre.id].presale, true);
      assert.equal(c[flag.id].presale, false, 'el dia del estreno la preventa termina');
      assert.equal(c[pre.id].premiere, false);
      assert.equal(c[premiere.id].premiere, true, 'estreno hace 13 dias');
      assert.equal(c[old.id].premiere, false, 'hace 15 dias ya no');
      // el admin ve la marca cruda y la efectiva
      const adm = (await admin.get(`/api/admin/movies/${pre.id}`)).json.movie;
      assert.equal(adm.presale, true);
      assert.equal(adm.presaleEffective, true);
      // avanza el reloj al dia del estreno: la preventa termina sola (cruce de medianoche de Lima)
      cl.now = Date.UTC(2026, 10, 20, 4, 59, 0);   // 23:59 del 19 en Lima
      c = await pick();
      assert.equal(c[pre.id].presale, true);
      cl.now = Date.UTC(2026, 10, 20, 5, 1, 0);    // 00:01 del 20 en Lima
      c = await pick();
      assert.equal(c[pre.id].presale, false);
      assert.equal(c[pre.id].premiere, true);
      const fresh = await login('admin@cinerama.com'); // la sesion anterior caduco al avanzar el reloj
      const adm2 = (await fresh.get(`/api/admin/movies/${pre.id}`)).json.movie;
      assert.equal(adm2.presale, true);
      assert.equal(adm2.presaleEffective, false);
    } finally { cl.now = saved; admin = await login('admin@cinerama.com'); }
  });

  test('ETag y no-cache: revalida y responde 304 sin cambios; el cambio invalida', async () => {
    const c = env.client();
    const first = await c.get('/api/catalog');
    assert.equal(first.headers.get('cache-control'), 'no-cache');
    const etag = first.headers.get('etag');
    assert.ok(etag);
    assert.equal((await conditionalGet('/api/catalog', etag)).status, 304);
    await admin.post('/api/admin/movies', { ...NEW, title: 'Cambia el ETag', status: 'active', branches: [{ branchId: 2 }] });
    const third = await conditionalGet('/api/catalog', etag);
    assert.equal(third.status, 200);
    assert.notEqual(third.etag, etag);
  });

  test('POST sin JSON -> 415 y sin sesion -> 401 (CSRF y auth previos)', async () => {
    const r = await admin.call('POST', '/api/admin/movies', undefined, { rawBody: 'x', headers: { 'content-type': 'text/plain' } });
    assert.equal(r.status, 415);
  });
});

describe('la consola del servidor no recibe datos personales', () => {
  test('los registros de auditoria solo llevan ids y nombres de campos', () => {
    const rows = env.db.prepare('SELECT detail_json FROM audit_log').all();
    assert.ok(rows.length > 5);
    for (const r of rows) assert.ok(!/@|\d{8}|password|dni/i.test(r.detail_json ?? ''));
  });
});
