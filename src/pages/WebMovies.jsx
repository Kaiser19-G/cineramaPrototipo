import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import './WebPages.css';

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

  // Dynamic filter options
  const filterOptions = useMemo(() => {
    const cities = [...new Set(branches.map(b => b.city))];
    const cinemas = branches.map(b => b.name);
    const genres = [...new Set(enabledMovies.map(m => m.genre))];
    const languages = [...new Set(enabledMovies.map(m => m.language === 'ES' ? 'Doblada' : 'Subtitulada'))];
    const formats = [...new Set(enabledMovies.map(m => m.format).flat())];
    
    // Days logic (simplified mock)
    const days = ['Hoy Lunes', 'Martes 19', 'Miércoles 20'];

    return { cities, cinemas, genres, languages, formats, days };
  }, [branches, enabledMovies]);

  // Filter the movies
  const filteredMovies = useMemo(() => {
    return enabledMovies.filter(movie => {
      if (filters.genre && movie.genre !== filters.genre) return false;
      if (filters.language) {
        const langStr = movie.language === 'ES' ? 'Doblada' : 'Subtitulada';
        if (langStr !== filters.language) return false;
      }
      if (filters.format && !movie.format.includes(filters.format)) return false;
      
      if (filters.city || filters.cinema) {
        const relevantBranches = branches.filter(b => 
          (!filters.city || b.city === filters.city) &&
          (!filters.cinema || b.name === filters.cinema)
        );
        const branchIds = relevantBranches.map(b => b.id);
        const hasScreening = activeScreenings.some(s => s.movieId === movie.id && branchIds.includes(s.branchId));
        if (!hasScreening) return false; // Hide movie if it doesn't play in selected city/cinema
      }
      
      return true;
    });
  }, [enabledMovies, branches, activeScreenings, filters]);

  // Render active filter pills
  const activePills = Object.entries(filters).filter(([_, val]) => val !== null);

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
        
        <div className="movies-grid-view">
          {filteredMovies.map(movie => (
            <div key={movie.id} className="movie-grid-card">
              <button type="button" className="poster-container" onClick={() => navigate(`/web/pelicula/${movie.id}`)} aria-label={`Ver detalle de ${movie.title}`}>
                <img src={movie.poster} alt="" />

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
