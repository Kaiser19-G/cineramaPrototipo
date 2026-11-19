import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.js';
import { seed } from '../seed.js';
import { movies as sampleMovies } from '../../src/data/store.js';
import { screeningWindow, START_STEP_MINUTES } from '../../src/shared/scheduling.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cinerama-refresh-'));

test('--refresh-screenings renueva fechas de peliculas de ejemplo y su habilitacion, sin tocar lo del usuario', () => {
  const dir = tmp();
  const db = openDb(path.join(dir, 'r.db'));
  seed(db);
  // El usuario creo una pelicula propia (con habilitacion) y renombro otra de ejemplo (id 3); las fechas de todo vencieron.
  const mine = db.prepare(`INSERT INTO movies (title,duration,formats_json,status,release_date,end_date) VALUES ('Mia',90,'["2D"]','active','2026-01-01','2026-02-01')`).run().lastInsertRowid;
  db.prepare(`INSERT INTO movie_branch (movie_id,branch_id,active,start_date,end_date,formats_json,base_price) VALUES (?,?,?,?,?,?,?)`).run(mine, 1, 1, '2026-01-01', '2026-02-01', '["2D"]', 10);
  db.prepare(`UPDATE movies SET title = 'Renombrada' WHERE id = 3`).run();
  db.prepare(`UPDATE movies SET release_date = '2026-01-01', end_date = '2026-02-01', status = 'archived' WHERE id IN (1, 3)`).run();
  db.prepare(`UPDATE movie_branch SET start_date = '2026-01-01', end_date = '2026-02-01'`).run();
  const orders = JSON.stringify(db.prepare('SELECT * FROM orders').all());

  seed(db);                                   // sin la opcion: nada cambia
  assert.equal(db.prepare('SELECT end_date FROM movies WHERE id = 1').get().end_date, '2026-02-01');

  seed(db, { refreshScreenings: true });
  const m1 = sampleMovies.find((m) => m.id === 1);
  const r1 = db.prepare('SELECT release_date, end_date, status FROM movies WHERE id = 1').get();
  assert.deepEqual([r1.release_date, r1.end_date], [m1.releaseDate, m1.endDate]);
  assert.equal(r1.status, 'archived', 'no cambia el estado');
  // habilitacion por sede de la pelicula 1: dentro del periodo de la pelicula (se puede programar hoy)
  for (const b of db.prepare('SELECT start_date, end_date FROM movie_branch WHERE movie_id = 1').all()) {
    const w = screeningWindow({ releaseDate: r1.release_date, endDate: r1.end_date }, { startDate: b.start_date, endDate: b.end_date });
    assert.ok(w.to > new Date().toISOString().slice(0, 10), 'el periodo no esta vencido');
  }
  // lo que no es de ejemplo no se toca
  assert.equal(db.prepare('SELECT end_date FROM movies WHERE id = ?').get(mine).end_date, '2026-02-01');
  assert.equal(db.prepare('SELECT end_date FROM movie_branch WHERE movie_id = ?').get(mine).end_date, '2026-02-01');
  assert.equal(db.prepare('SELECT end_date FROM movies WHERE id = 3').get().end_date, '2026-02-01');
  assert.equal(db.prepare('SELECT end_date FROM movie_branch WHERE movie_id = 3').get().end_date, '2026-02-01');
  assert.equal(JSON.stringify(db.prepare('SELECT * FROM orders').all()), orders);
  db.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('screeningWindow: ultimo inicio y primer cierre; fechas ausentes no limitan', () => {
  assert.deepEqual(screeningWindow({ releaseDate: '2026-05-01', endDate: '2026-09-01' }, { startDate: '2026-06-01', endDate: '2026-08-01' }), { from: '2026-06-01', to: '2026-08-01' });
  assert.deepEqual(screeningWindow({ releaseDate: '2026-07-01', endDate: null }, { startDate: null, endDate: null }), { from: '2026-07-01', to: null });
  assert.deepEqual(screeningWindow({ releaseDate: null, endDate: null }, undefined), { from: null, to: null });
  assert.equal(START_STEP_MINUTES, 5);
});
