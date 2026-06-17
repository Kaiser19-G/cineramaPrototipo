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
          <div className="filter-title" onClick={() => toggleAccordion('Ciudad')}>
            <span>Ciudad</span> <span>{openAccordion === 'Ciudad' ? '-' : '+'}</span>
          </div>
          {openAccordion === 'Ciudad' && (
            <div className="filter-options">
              {filterOptions.cities.map(city => (
                <p key={city} className={filters.city === city ? 'active-option' : ''} onClick={() => setFilter('city', city)}>{city}</p>
              ))}
            </div>
          )}
        </div>
        
        <div className="accordion-filter">
          <div className="filter-title" onClick={() => toggleAccordion('Cine')}>
            <span>Cine</span> <span>{openAccordion === 'Cine' ? '-' : '+'}</span>
          </div>
          {openAccordion === 'Cine' && (
            <div className="filter-options">
              {filterOptions.cinemas.map(cine => (
                <p key={cine} className={filters.cinema === cine ? 'active-option' : ''} onClick={() => setFilter('cinema', cine)}>{cine}</p>
              ))}
            </div>
          )}
        </div>

        <div className="accordion-filter">
          <div className="filter-title" onClick={() => toggleAccordion('Día')}>
            <span className={openAccordion === 'Día' ? 'active-text' : ''}>Día</span> 
            <span>{openAccordion === 'Día' ? '-' : '+'}</span>
          </div>
          {openAccordion === 'Día' && (
            <div className="filter-options">
              {filterOptions.days.map(day => (
                <p key={day} className={filters.day === day ? 'active-option' : ''} onClick={() => setFilter('day', day)}>{day}</p>
              ))}
            </div>
          )}
        </div>

        <div className="accordion-filter">
          <div className="filter-title" onClick={() => toggleAccordion('Género')}>
            <span>Género</span> <span>{openAccordion === 'Género' ? '-' : '+'}</span>
          </div>
          {openAccordion === 'Género' && (
            <div className="filter-options">
              {filterOptions.genres.map(genre => (
                <p key={genre} className={filters.genre === genre ? 'active-option' : ''} onClick={() => setFilter('genre', genre)}>{genre}</p>
              ))}
            </div>
          )}
        </div>

        <div className="accordion-filter">
          <div className="filter-title" onClick={() => toggleAccordion('Idioma')}>
            <span>Idioma</span> <span>{openAccordion === 'Idioma' ? '-' : '+'}</span>
          </div>
          {openAccordion === 'Idioma' && (
            <div className="filter-options">
              {filterOptions.languages.map(lang => (
                <p key={lang} className={filters.language === lang ? 'active-option' : ''} onClick={() => setFilter('language', lang)}>{lang}</p>
              ))}
            </div>
          )}
        </div>

        <div className="accordion-filter">
          <div className="filter-title" onClick={() => toggleAccordion('Formato')}>
            <span>Formato</span> <span>{openAccordion === 'Formato' ? '-' : '+'}</span>
          </div>
          {openAccordion === 'Formato' && (
            <div className="filter-options">
              {filterOptions.formats.map(format => (
                <p key={format} className={filters.format === format ? 'active-option' : ''} onClick={() => setFilter('format', format)}>{format}</p>
              ))}
            </div>
          )}
        </div>
      </aside>

      {/* Grilla de Películas */}
      <main className="movies-list">
        <div className="movies-top-bar">
          <h3><span className="count">{filteredMovies.length}</span> Películas encontradas</h3>
          <div className="active-filters-pills">
            {activePills.map(([key, val]) => (
              <span key={key} className="pill" onClick={() => removeFilter(key)}>
                {val} ✕
              </span>
            ))}
          </div>
        </div>
        
        <div className="movies-grid-view">
          {filteredMovies.map(movie => (
            <div key={movie.id} className="movie-grid-card">
              <div className="poster-container" style={{cursor: 'pointer'}} onClick={() => navigate(`/web/pelicula/${movie.id}`)}>
                <img src={movie.poster} alt={movie.title} />
                
                {movie.featured && (
                  <div className="diagonal-tag">Estreno</div>
                )}
                
                {/* Overlay de Hover unificado */}
                <div className="movie-hover-overlay">
                  <span>Ver detalle ⟩</span>
                </div>
              </div>
              
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
