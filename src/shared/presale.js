import { todayInLima, addDaysToDate } from '../data/limaDate.js';

// Maximo de entradas por cuenta y por pelicula mientras la pelicula esta en preventa.
// Lo aplica la fase 4 (compras); aqui solo se comparte el valor.
export const PRESALE_MAX_TICKETS = 4;
// "Estreno": pelicula activa cuyo estreno cae en los ultimos 14 dias (dia de Lima).
export const PREMIERE_WINDOW_DAYS = 14;

// Preventa efectiva: marcada a mano y todavia antes de la fecha de estreno. Termina sola ese dia.
export function isPresaleEffective(movie, today = todayInLima()) {
  return Boolean(movie?.presale) && Boolean(movie.releaseDate) && today < movie.releaseDate;
}

export function isPremiere(movie, today = todayInLima()) {
  if (movie?.status !== 'active' || !movie.releaseDate) return false;
  return movie.releaseDate <= today && movie.releaseDate >= addDaysToDate(today, -PREMIERE_WINDOW_DAYS);
}
