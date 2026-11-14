// Opciones del catalogo compartidas por el cliente (formularios) y el servidor (validacion).
export const GENRES = ['Acción', 'Aventura', 'Animación', 'Comedia', 'Documental', 'Drama', 'Musical', 'Romance', 'Sci-Fi', 'Terror', 'Thriller'];
// Escala peruana de calificacion: apta para todo publico, mayores de 14 y mayores de 18.
export const RATINGS = ['APT', '+14', '+18'];
export const FORMATS = ['2D', '3D'];
export const LANGUAGES = ['ES', 'EN'];
// Estados de una pelicula. Solo "active" y "upcoming" se muestran en el sitio publico.
export const MOVIE_STATUSES = ['draft', 'upcoming', 'active', 'archived'];
export const MOVIE_STATUS_LABELS = { draft: 'Borrador', upcoming: 'Próximamente', active: 'En cartelera', archived: 'Archivada' };
export const LANGUAGE_LABELS = { ES: 'Español', EN: 'Inglés' };

// Conversion de las calificaciones antiguas (escala estadounidense) a la peruana.
export const LEGACY_RATING_MAP = { G: 'APT', PG: 'APT', 'PG-13': '+14', 'PG-14': '+14', R: '+18', 'NC-17': '+18' };

export const POSTER_URL_MAX = 2048;
// https, sin espacios, comillas, parentesis, <, >, \ ni acento grave: asi la URL no puede salirse de un url(...) de CSS.
export const POSTER_URL_RE = /^https:\/\/[^\s"'()<>\\`]+$/;
export const isValidPosterUrl = (v) => typeof v === 'string' && v.length <= POSTER_URL_MAX && POSTER_URL_RE.test(v);
