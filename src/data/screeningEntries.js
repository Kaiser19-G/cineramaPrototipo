// Funciones con estos estados sí se pueden comprar; el resto (draft,
// finished, cancelled, sold_out) no debe ofrecerse como opción de filtro.
const BOOKABLE_STATUSES = new Set(['active', 'scheduled']);

// Una "entrada" junta una función real con su película y su sede, más las
// etiquetas ya resueltas (día legible, idioma legible) — es la única fuente
// de verdad para saber qué combinaciones de filtros tienen al menos una
// función real detrás.
export function buildScreeningEntries({ movies, branches, screenings, days }) {
  const movieById = Object.fromEntries(movies.map((m) => [m.id, m]));
  const branchById = Object.fromEntries(branches.map((b) => [b.id, b]));
  return screenings
    .filter((s) => BOOKABLE_STATUSES.has(s.status))
    .map((s) => {
      const movie = movieById[s.movieId];
      const branch = branchById[s.branchId];
      if (!movie || !branch) return null;
      return {
        movie,
        branch,
        screening: s,
        dayLabel: days.find((d) => d.value === s.date)?.label,
        languageLabel: s.language === 'ES' ? 'Doblada' : 'Subtitulada',
      };
    })
    .filter(Boolean);
}

// `dimensions`: { key: (entry) => valor }. `filters`: { key: valor|null }.
// Para cada key devuelve solo los valores que, dados los DEMÁS filtros ya
// activos, siguen teniendo al menos una función real — así ninguna opción
// que se muestre puede llevar a "no hay funciones para esta selección".
export function computeCascadingOptions(entries, filters, dimensions) {
  const keys = Object.keys(dimensions);
  const matches = (entry, except) =>
    keys.every((k) => k === except || !filters[k] || dimensions[k](entry) === filters[k]);

  const result = {};
  keys.forEach((key) => {
    const set = new Set();
    entries.forEach((e) => { if (matches(e, key)) set.add(dimensions[key](e)); });
    result[key] = [...set];
  });
  return result;
}

export function matchesAllFilters(entry, filters, dimensions) {
  return Object.keys(dimensions).every((k) => !filters[k] || dimensions[k](entry) === filters[k]);
}
