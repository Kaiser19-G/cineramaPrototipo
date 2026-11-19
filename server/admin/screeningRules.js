// Reglas de negocio de la programacion. Una sola implementacion para crear y editar; las pruebas tambien
// la usan para comprobar que los datos de ejemplo las cumplen.
import { absMinutes } from '../../src/data/limaDate.js';
import {
  CLEANING_MINUTES, MIN_LEAD_MINUTES, hallSupportsFormat, toMinutes, screeningSpan, endTimeOf, screeningWindow,
} from '../../src/shared/scheduling.js';

export function createRules(db) {
  const q = {
    movie: db.prepare('SELECT * FROM movies WHERE id = ?'),
    hall: db.prepare('SELECT * FROM halls WHERE id = ?'),
    branch: db.prepare('SELECT * FROM branches WHERE id = ?'),
    mb: db.prepare('SELECT * FROM movie_branch WHERE movie_id = ? AND branch_id = ?'),
    sameHall: db.prepare(`SELECT s.*, m.title AS movie_title FROM screenings s JOIN movies m ON m.id = s.movie_id
      WHERE s.hall_id = ? AND s.status != 'cancelled' AND s.starts_on BETWEEN ? AND ? AND s.id != ?`),
  };
  const addDays = (ymd, n) => {
    const [y, m, d] = ymd.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
  };
  const fail = (status, error, extra = {}) => ({ status, body: { error, ...extra } });

  // input: { movieId, hallId, date, startTime, format }. Devuelve null si todo cumple, o { status, body }.
  // Si todo cumple tambien devuelve datos derivados en ctx (para insertar sin volver a leer).
  function check(input, { excludeId = 0, nowAbs, skipPast = false } = {}) {
    const movie = q.movie.get(input.movieId);
    if (!movie) return { err: fail(404, 'not_found', { field: 'movieId' }) };
    const hall = q.hall.get(input.hallId);
    if (!hall) return { err: fail(404, 'not_found', { field: 'hallId' }) };
    const branch = q.branch.get(hall.branch_id);
    const ctx = { movie, hall, branch };
    if (branch.status !== 'active') return { err: fail(409, 'branch_inactive', { field: 'hallId' }), ctx };
    // Estados programables: "active", y "upcoming" solo si esta marcada la preventa (se venden entradas de funciones
    // posteriores al estreno antes de que llegue la fecha). Borrador y archivada nunca.
    const ok = movie.status === 'active' || (movie.status === 'upcoming' && !!movie.presale);
    if (!ok) return { err: fail(409, 'movie_inactive', { field: 'movieId', status: movie.status }), ctx };
    const mb = q.mb.get(movie.id, hall.branch_id);
    if (!mb || !mb.active) return { err: fail(409, 'movie_not_enabled', { field: 'movieId' }), ctx };
    const { from, to } = screeningWindow({ releaseDate: movie.release_date, endDate: movie.end_date }, { startDate: mb.start_date, endDate: mb.end_date });
    if ((from && input.date < from) || (to && input.date > to)) return { err: fail(409, 'outside_window', { field: 'date', from, to }), ctx };
    const startAbs = absMinutes(input.date, toMinutes(input.startTime));
    if (!skipPast && startAbs < nowAbs + MIN_LEAD_MINUTES) {
      return { err: fail(409, 'in_the_past', { field: 'startTime', minLeadMinutes: MIN_LEAD_MINUTES }), ctx };
    }
    if (hall.status !== 'active') return { err: fail(409, 'hall_in_maintenance', { field: 'hallId' }), ctx };
    if (!hallSupportsFormat(hall.type, input.format)) return { err: fail(409, 'format_not_supported_by_hall', { field: 'format', hallType: hall.type }), ctx };
    if (!JSON.parse(movie.formats_json).includes(input.format)) return { err: fail(409, 'format_not_in_movie', { field: 'format' }), ctx };
    if (!JSON.parse(mb.formats_json).includes(input.format)) return { err: fail(409, 'format_not_in_branch', { field: 'format' }), ctx };
    // Solape en la misma sala: cada funcion ocupa la sala hasta su fin mas la limpieza. Se revisan el dia anterior y el
    // siguiente para cubrir funciones que cruzan la medianoche.
    const endTime = endTimeOf(input.startTime, movie.duration);
    const newEnd = startAbs + movie.duration;
    for (const o of q.sameHall.all(hall.id, addDays(input.date, -1), addDays(input.date, 1), excludeId)) {
      const span = screeningSpan(o.starts_on, o.start_time, o.end_time);
      if (startAbs < span.end + CLEANING_MINUTES && span.start < newEnd + CLEANING_MINUTES) {
        return {
          err: fail(409, 'hall_overlap', {
            field: 'startTime',
            conflict: { id: o.id, movieTitle: o.movie_title, date: o.starts_on, startTime: o.start_time, endTime: o.end_time, hallName: hall.name },
          }),
          ctx,
        };
      }
    }
    return { err: null, ctx: { ...ctx, mb, endTime, totalSeats: hall.capacity } };
  }
  return { check };
}
