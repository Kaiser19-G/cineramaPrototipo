import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv } from './helpers.js';
import { presaleFirstDates, presaleFromText } from '../../src/data/screeningEntries.js';

let env;
const ins = (movie, branch, hall, date, status, time = '18:00') => env.db.prepare(
  `INSERT INTO screenings (movie_id, hall_id, branch_id, starts_on, start_time, end_time, language, format, price, status, booked_seats, total_seats)
   VALUES (?, ?, ?, ?, ?, '20:00', 'ES', '2D', 20, ?, 0, 100)`).run(movie, hall, branch, date, time, status);

before(async () => {
  env = await startEnv(); // reloj: 2026-11-12 (Lima)
  // Película 9: preventa. Primera función publicada a 10 días; borrador y cancelada, antes.
  ins(9, 1, 1, '2026-11-22', 'scheduled');
  ins(9, 1, 1, '2026-11-24', 'scheduled', '19:00');
  ins(9, 1, 1, '2026-11-20', 'draft');
  ins(9, 1, 1, '2026-11-21', 'cancelled');
  // Película normal con una función dentro de la ventana.
  ins(1, 1, 1, '2026-11-13', 'scheduled');
});
after(() => env.stop());

test('la API pública entrega la función de preventa a 10 días y omite borradores y canceladas', async () => {
  const { json } = await env.client().get('/api/catalog');
  const pre = json.screenings.filter((s) => s.movieId === 9);
  assert.deepEqual(pre.map((s) => s.date).sort(), ['2026-11-22', '2026-11-24']);
  assert.ok(json.movies.find((m) => m.id === 9).presale);
  assert.ok(json.screenings.some((s) => s.movieId === 1 && s.date === '2026-11-13'));
});

test('presaleFirstDates: primera fecha publicada, solo de preventa, por sede', async () => {
  const { json } = await env.client().get('/api/catalog');
  assert.deepEqual(presaleFirstDates({ movies: json.movies, screenings: json.screenings }), { 9: '2026-11-22' });
  assert.deepEqual(presaleFirstDates({ movies: json.movies, screenings: json.screenings, branchId: 2 }), {});
  assert.equal(presaleFromText('2026-12-12'), 'Preventa · desde el sáb 12 dic');
});
