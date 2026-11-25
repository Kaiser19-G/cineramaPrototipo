import { useState, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import CustomDropdown from '../components/CustomDropdown';
import StepIndicator from '../components/StepIndicator';
import { getNextDays } from '../data/dateHelpers';
import { handlePosterError } from '../utils/posterFallback';
import { buildScreeningEntries, computeCascadingOptions } from '../data/screeningEntries';
import './WebPages.css';

const DETAIL_DIMENSIONS = {
  city: (e) => e.branch.city,
  cinema: (e) => e.branch.name,
  date: (e) => e.dayLabel,
};

export default function WebMovieDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const showtimesRef = useRef(null);
  const { enabledMovies, branches, activeScreenings } = useCinema();

  const movie = enabledMovies.find(m => m.id === parseInt(id)) || enabledMovies[0];

  const days = getNextDays(3);
  const [filterCity, setFilterCity] = useState(location.state?.city || null);
  const [filterCinema, setFilterCinema] = useState(location.state?.cinema || null);
  const [filterDate, setFilterDate] = useState(location.state?.date || null);

  const handleScrollToShowtimes = () => {
    showtimesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // H-01/H-02 (evaluación heurística): antes esta sección listaba sedes de
  // otra cadena, fijas en el código, y los filtros de ciudad/cine/fecha no
  // afectaban en nada a la lista. Ahora se construye desde las sedes reales
  // de Cinerama (CinemaContext) y las funciones reales de esta película.
  const movieEntries = buildScreeningEntries({
    movies: [movie], branches, screenings: activeScreenings, days,
  });

  // Las opciones de ciudad/cine/fecha se limitan a las que esta película
  // SÍ tiene programadas (en cascada con lo que ya se eligió en las otras):
  // nunca se puede elegir una combinación sin funciones.
  const detailFilters = { city: filterCity, cinema: filterCinema, date: filterDate };
  const cascading = computeCascadingOptions(movieEntries, detailFilters, DETAIL_DIMENSIONS);

  const cities = [...new Set(branches.map(b => b.city))].filter(c => cascading.city.includes(c));
  const cinemaNames = branches.map(b => b.name).filter(c => cascading.cinema.includes(c));
  const dateLabels = days.map(d => d.label).filter(l => cascading.date.includes(l));

  const selectedDateValue = filterDate ? days.find(d => d.label === filterDate)?.value : null;

  const cinemasWithShowtimes = branches
    .map((branch) => {
      const matchesLocationFilter = (!filterCity || branch.city === filterCity)
        && (!filterCinema || branch.name === filterCinema);
      const showtimes = matchesLocationFilter
        ? movieEntries
            .filter((e) => e.branch.id === branch.id)
            .filter((e) => !selectedDateValue || e.screening.date === selectedDateValue)
            .map((e) => e.screening)
            .sort((a, b) => a.startTime.localeCompare(b.startTime))
        : [];
      return { branch, showtimes };
    })
    .filter(({ showtimes }) => showtimes.length > 0);

  return (
    <div className="movie-details-page">

      {/* 1. Banner superior con trailer */}
      <div className="movie-detail-banner" style={{ backgroundImage: `url(${movie.backdrop || movie.poster})`, backgroundSize: 'cover', backgroundPosition: 'center' }}>
        <button className="btn-play-trailer">
          <span className="play-icon" style={{display: 'flex'}}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
              <path d="M8 5v14l11-7z"/>
            </svg>
          </span>
          <span className="play-text">Mira el trailer</span>
        </button>
      </div>

      <div className="movie-detail-content">

        <StepIndicator current={2} />

        {/* 2. Cabecera principal con título y botón de comprar */}
        <div className="movie-header-section">
          <div className="movie-title-info">
            <h1>{movie.title}</h1>
            <p className="movie-meta-tags">
              {movie.genre} | {Math.floor(movie.duration / 60)}h {movie.duration % 60}min | {movie.rating}
            </p>
          </div>
          <button className="btn-comprar-top" onClick={handleScrollToShowtimes}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px', verticalAlign: 'text-bottom'}}>
              <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 11v2"/><path d="M13 17v2"/>
            </svg>
            Comprar
          </button>
        </div>

        {/* 3. Dos columnas: Póster y Sinopsis */}
        <div className="movie-info-cols">
          <div className="movie-info-left">
            <div className="poster-wrapper">
              <img src={movie.poster} alt={movie.title} data-fallback-title={movie.title} onError={handlePosterError} />
              {movie.featured && <div className="diagonal-tag">Estreno</div>}
            </div>
          </div>

          <div className="movie-info-right">
            <div className="synopsis-card">
              <h2>Sinopsis.</h2>
              <p className="synopsis-text">{movie.synopsis}</p>

              <div className="info-meta-group">
                <h3>Idioma</h3>
                <div className="lang-tags">
                  <span className="lang-badge">{movie.language === 'ES' ? 'Doblada al Español' : 'Subtitulada'}</span>
                </div>
              </div>

              <div className="info-meta-group">
                <h3>Disponible</h3>
                <p className="formats-available">{movie.format.join(', ')}</p>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Sección de funciones y horarios — H-03/H-05: siempre visibles,
            sin acordeón, con el indicador de pasos ya activo desde aquí. */}
        <div className="movie-showtimes-section" ref={showtimesRef}>
          <h2 className="section-title-fun">La función perfecta para ti.</h2>

          <div className="showtimes-filters-bar">
            <CustomDropdown
              label="Por ciudad"
              placeholder="Dónde estás"
              options={cities}
              value={filterCity}
              onChange={setFilterCity}
            />
            <div className="filter-divider-showtime"></div>
            <CustomDropdown
              label="Por cine"
              placeholder="Elige tu Cine"
              options={cinemaNames}
              value={filterCinema}
              onChange={setFilterCinema}
            />
            <div className="filter-divider-showtime"></div>
            <CustomDropdown
              label="Por fecha"
              placeholder="Elige un día"
              options={dateLabels}
              value={filterDate}
              onChange={setFilterDate}
            />
          </div>

          {cinemasWithShowtimes.length === 0 ? (
            <p className="no-functions-message" role="status">
              No hay funciones para esta selección. Prueba con otra ciudad, cine o fecha.
            </p>
          ) : (
            <div className="cinemas-showtimes-list">
              {cinemasWithShowtimes.map(({ branch, showtimes }) => (
                <div key={branch.id} className="cinema-showtimes-block">
                  <div className="cinema-showtimes-header">
                    <h3>{branch.name}</h3>
                    <span className="cinema-showtimes-city">{branch.city}</span>
                  </div>

                  <div className="showtime-buttons-grid">
                    {showtimes.map((s) => (
                      <button
                        key={s.id}
                        className="showtime-btn"
                        onClick={() => navigate('/web/compra', {
                          state: {
                            movie,
                            cinema: branch.name,
                            date: days.find((d) => d.value === s.date)?.label || s.date,
                            time: s.startTime,
                            roomType: `${s.format} ${s.language === 'ES' ? 'Doblada' : 'Subtitulada'}`,
                          }
                        })}
                      >
                        <span className="time-lbl">{s.startTime}</span>
                        <span className="chair-icon" style={{display: 'flex'}}>
                          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M4 18v3"/><path d="M20 18v3"/><path d="M5 10V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M3 10a2 2 0 0 0-2 2v3c0 1.1.9 2 2 2h18a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                          </svg>
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

      </div>

    </div>
  );
}
