import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import { getNextDays } from '../data/dateHelpers';
import { handlePosterError } from '../utils/posterFallback';
import { useGridKeyboardNav } from '../hooks/useGridKeyboardNav';
import { buildScreeningEntries, computeCascadingOptions, matchesAllFilters } from '../data/screeningEntries';
import './WebPages.css';

const FORMAT_ORDER = ['2D', '3D'];

export default function WebMovies() {
  const navigate = useNavigate();
  const { enabledMovies, branches, activeScreenings } = useCinema();

  const [openAccordion, setOpenAccordion] = useState('Día');
  const [filters, setFilters] = useState({
    city: null,
    cinema: null,
    day: null,
    genre: null,
    language: null,
    format: null
  });

  const toggleAccordion = (name) => {
    setOpenAccordion(openAccordion === name ? null : name);
  };

  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: prev[key] === value ? null : value }));
  };

  const removeFilter = (key) => {
    setFilters(prev => ({ ...prev, [key]: null }));
  };

  const days = useMemo(() => getNextDays(3), []);

  // Una entrada por cada función real (bookable) de cada película: es la
  // única fuente de verdad para decidir qué opciones de filtro ofrecer.
  const entries = useMemo(
    () => buildScreeningEntries({ movies: enabledMovies, branches, screenings: activeScreenings, days }),
    [enabledMovies, branches, activeScreenings, days]
  );

  const dimensions = useMemo(() => ({
    city: (e) => e.branch.city,
    cinema: (e) => e.branch.name,
    day: (e) => e.dayLabel,
    genre: (e) => e.movie.genre,
    language: (e) => e.languageLabel,
    format: (e) => e.screening.format,
  }), []);

  // Opciones en cascada: cada valor que se muestra, combinado con los demás
  // filtros ya activos, tiene al menos una función real detrás — así nunca
  // se puede elegir una combinación que lleve a "no hay funciones".
  const cascading = useMemo(() => computeCascadingOptions(entries, filters, dimensions), [entries, filters, dimensions]);

  const filterOptions = useMemo(() => ({
    cities: [...new Set(branches.map(b => b.city))].filter(c => cascading.city.includes(c)),
    cinemas: branches.map(b => b.name).filter(c => cascading.cinema.includes(c)),
    days: days.map(d => d.label).filter(l => cascading.day.includes(l)),
    genres: [...new Set(enabledMovies.map(m => m.genre))].filter(g => cascading.genre.includes(g)),
    languages: ['Doblada', 'Subtitulada'].filter(l => cascading.language.includes(l)),
    formats: FORMAT_ORDER.filter(f => cascading.format.includes(f))
      .concat(cascading.format.filter(f => !FORMAT_ORDER.includes(f))),
  }), [branches, enabledMovies, days, cascading]);

  // Sin filtros activos se ve el catálogo completo; al activar cualquier
  // filtro, se exige que exista una función real que calce con TODOS a la vez.
  const filteredMovies = useMemo(() => {
    const anyFilterActive = Object.values(filters).some(v => v !== null);
    if (!anyFilterActive) return enabledMovies;
    const movieIds = new Set();
    entries.forEach((e) => { if (matchesAllFilters(e, filters, dimensions)) movieIds.add(e.movie.id); });
    return enabledMovies.filter(m => movieIds.has(m.id));
  }, [enabledMovies, entries, filters, dimensions]);

  const posterGrid = useGridKeyboardNav(filteredMovies.length, 3);

  // Render active filter pills
  const activePills = Object.entries(filters).filter(([, val]) => val !== null);

  return (
    <div className="web-movies-layout">
      {/* Sidebar de Filtros (Estilo Acordeón) */}
      <aside className="movies-sidebar">
        <h3 className="filter-header">
          <span className="icon">≑</span> Filtrar Por:
        </h3>
        
        <div className="accordion-filter">
          <button
            type="button"
            className="filter-title"
            aria-expanded={openAccordion === 'Ciudad'}
            aria-controls="filter-panel-city"
            onClick={() => toggleAccordion('Ciudad')}
          >
            <span>Ciudad</span> <span aria-hidden="true">{openAccordion === 'Ciudad' ? '-' : '+'}</span>
          </button>
          {openAccordion === 'Ciudad' && (
            <div className="filter-options" id="filter-panel-city">
              {filterOptions.cities.map(city => (
                <button type="button" key={city} className={filters.city === city ? 'active-option' : ''} aria-pressed={filters.city === city} onClick={() => setFilter('city', city)}>{city}</button>
              ))}
            </div>
          )}
        </div>
        
        <div className="accordion-filter">
          <button
            type="button"
            className="filter-title"
            aria-expanded={openAccordion === 'Cine'}
            aria-controls="filter-panel-cinema"
            onClick={() => toggleAccordion('Cine')}
          >
            <span>Cine</span> <span aria-hidden="true">{openAccordion === 'Cine' ? '-' : '+'}</span>
          </button>
          {openAccordion === 'Cine' && (
            <div className="filter-options" id="filter-panel-cinema">
              {filterOptions.cinemas.map(cine => (
                <button type="button" key={cine} className={filters.cinema === cine ? 'active-option' : ''} aria-pressed={filters.cinema === cine} onClick={() => setFilter('cinema', cine)}>{cine}</button>
              ))}
            </div>
          )}
        </div>

        <div className="accordion-filter">
          <button
            type="button"
            className="filter-title"
            aria-expanded={openAccordion === 'Día'}
            aria-controls="filter-panel-day"
            onClick={() => toggleAccordion('Día')}
          >
            <span className={openAccordion === 'Día' ? 'active-text' : ''}>Día</span>
            <span aria-hidden="true">{openAccordion === 'Día' ? '-' : '+'}</span>
          </button>
          {openAccordion === 'Día' && (
            <div className="filter-options" id="filter-panel-day">
              {filterOptions.days.map(day => (
                <button type="button" key={day} className={filters.day === day ? 'active-option' : ''} aria-pressed={filters.day === day} onClick={() => setFilter('day', day)}>{day}</button>
              ))}
            </div>
          )}
        </div>

        <div className="accordion-filter">
          <button
            type="button"
            className="filter-title"
            aria-expanded={openAccordion === 'Género'}
            aria-controls="filter-panel-genre"
            onClick={() => toggleAccordion('Género')}
          >
            <span>Género</span> <span aria-hidden="true">{openAccordion === 'Género' ? '-' : '+'}</span>
          </button>
          {openAccordion === 'Género' && (
            <div className="filter-options" id="filter-panel-genre">
              {filterOptions.genres.map(genre => (
                <button type="button" key={genre} className={filters.genre === genre ? 'active-option' : ''} aria-pressed={filters.genre === genre} onClick={() => setFilter('genre', genre)}>{genre}</button>
              ))}
            </div>
          )}
        </div>

        <div className="accordion-filter">
          <button
            type="button"
            className="filter-title"
            aria-expanded={openAccordion === 'Idioma'}
            aria-controls="filter-panel-language"
            onClick={() => toggleAccordion('Idioma')}
          >
            <span>Idioma</span> <span aria-hidden="true">{openAccordion === 'Idioma' ? '-' : '+'}</span>
          </button>
          {openAccordion === 'Idioma' && (
            <div className="filter-options" id="filter-panel-language">
              {filterOptions.languages.map(lang => (
                <button type="button" key={lang} className={filters.language === lang ? 'active-option' : ''} aria-pressed={filters.language === lang} onClick={() => setFilter('language', lang)}>{lang}</button>
              ))}
            </div>
          )}
        </div>

        <div className="accordion-filter">
          <button
            type="button"
            className="filter-title"
            aria-expanded={openAccordion === 'Formato'}
            aria-controls="filter-panel-format"
            onClick={() => toggleAccordion('Formato')}
          >
            <span>Formato</span> <span aria-hidden="true">{openAccordion === 'Formato' ? '-' : '+'}</span>
          </button>
          {openAccordion === 'Formato' && (
            <div className="filter-options" id="filter-panel-format">
              {filterOptions.formats.map(format => (
                <button type="button" key={format} className={filters.format === format ? 'active-option' : ''} aria-pressed={filters.format === format} onClick={() => setFilter('format', format)}>{format}</button>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Grilla de Películas */}
      <main className="movies-list">
        <div className="movies-top-bar">
          <h3 aria-live="polite"><span className="count">{filteredMovies.length}</span> Películas encontradas</h3>
          <div className="active-filters-pills">
            {activePills.map(([key, val]) => (
              <button type="button" key={key} className="pill" onClick={() => removeFilter(key)} aria-label={`Quitar filtro ${val}`}>
                {val} <span aria-hidden="true">✕</span>
              </button>
            ))}
          </div>
        </div>
        
        <div className="movies-grid-view" role="grid" aria-label="Películas" onKeyDown={posterGrid.handleGridKeyDown}>
          {filteredMovies.map((movie, i) => (
            <div key={movie.id} className="movie-grid-card">
              <button
                type="button"
                ref={posterGrid.registerItemRef(i)}
                data-grid-index={i}
                tabIndex={i === Math.min(posterGrid.focusedIndex, filteredMovies.length - 1) ? 0 : -1}
                role="gridcell"
                className="poster-container"
                onClick={() => navigate(`/web/pelicula/${movie.id}`)}
                onFocus={() => posterGrid.setFocusedIndex(i)}
                aria-label={`Ver detalle de ${movie.title}`}
              >
                <img src={movie.poster} alt="" data-fallback-title={movie.title} onError={handlePosterError} />

                {movie.featured && (
                  <div className="diagonal-tag">Estreno</div>
                )}

                {/* Overlay de Hover unificado */}
                <div className="movie-hover-overlay">
                  <span aria-hidden="true">Ver detalle ⟩</span>
                </div>
              </button>
              
              <div className="movie-card-info">
                <h4>{movie.title}</h4>
                <p>{movie.genre}, {Math.floor(movie.duration / 60)}h {movie.duration % 60}min, {movie.rating}.</p>
              </div>
            </div>
          ))}
        </div>
      </main>
    </div>
  );
}
