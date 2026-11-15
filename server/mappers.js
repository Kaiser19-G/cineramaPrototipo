// Formas JSON de la API (claves en camelCase). Las publicas no incluyen datos internos
// (borradores, marca de preventa sin calcular, nombre del gerente, versiones).
import { isPresaleEffective, isPremiere } from '../src/shared/presale.js';

export const mapMovie = (r, today) => {
  const base = {
    id: r.id, title: r.title, genre: r.genre, duration: r.duration, rating: r.rating, status: r.status,
    format: JSON.parse(r.formats_json), director: r.director, language: r.language, poster: r.poster,
    synopsis: r.synopsis, featured: !!r.featured, releaseDate: r.release_date, endDate: r.end_date,
  };
  const m = {
    ...base,
    // Efectivos (calculados con el dia de Lima): el sitio publico no ve la marca cruda.
    presale: isPresaleEffective({ presale: !!r.presale, releaseDate: r.release_date }, today),
    premiere: isPremiere(base, today),
  };
  if (r.backdrop) m.backdrop = r.backdrop;
  return m;
};

// Pelicula para el panel: incluye la marca cruda, la version y los datos de auditoria minimos.
export const mapAdminMovie = (r, today, branches = []) => ({
  id: r.id, title: r.title, genre: r.genre, duration: r.duration, rating: r.rating, status: r.status,
  format: JSON.parse(r.formats_json), director: r.director, language: r.language, poster: r.poster,
  backdrop: r.backdrop ?? null, synopsis: r.synopsis, featured: !!r.featured, releaseDate: r.release_date,
  endDate: r.end_date, presale: !!r.presale,
  presaleEffective: isPresaleEffective({ presale: !!r.presale, releaseDate: r.release_date }, today),
  version: r.version, updatedAt: r.updated_at ?? null, branches,
});

export const mapBranch = (r) => ({
  id: r.id, name: r.name, city: r.city, address: r.address, status: r.status, halls: r.halls_count,
  formats: r.formats, img: r.img,
});
export const mapHall = (r) => ({
  id: r.id, branchId: r.branch_id, name: r.name, type: r.type, capacity: r.capacity, status: r.status,
  priceBase: r.price_base,
});
export const mapScreening = (r) => ({
  id: r.id, movieId: r.movie_id, hallId: r.hall_id, branchId: r.branch_id, date: r.starts_on,
  startTime: r.start_time, endTime: r.end_time, language: r.language, format: r.format, price: r.price,
  status: r.status, bookedSeats: r.booked_seats, totalSeats: r.total_seats,
});
export const mapAdminScreening = (r) => ({
  ...mapScreening(r), version: r.version, cancelledAt: r.cancelled_at ?? null, cancelReason: r.cancel_reason ?? null,
});
export const mapMovieBranch = (r) => ({
  id: r.id, movieId: r.movie_id, branchId: r.branch_id, activa: !!r.active, fechaInicio: r.start_date,
  fechaFin: r.end_date, formatos: JSON.parse(r.formats_json), precioBase: r.base_price,
});
