import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import CustomDropdown from '../components/CustomDropdown';
import { getNextDays } from '../data/dateHelpers';
import { handlePosterError } from '../utils/posterFallback';
import { useGridKeyboardNav } from '../hooks/useGridKeyboardNav';
import './WebPages.css';

const BOOKABLE_STATUSES = new Set(['active', 'scheduled']);

export default function WebCinemaDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { branches, enabledMovies, activeScreenings } = useCinema();

  const cinema = branches.find(b => b.id === parseInt(id)) || branches[0];

  const [activeTab, setActiveTab] = useState('Horarios');
  const days = getNextDays(3);
  const [selectedDate, setSelectedDate] = useState(days[0].label);

  // R1 (mismo origen que H-01/H-02/H-03/H-07): antes esta pantalla mostraba
  // las 3 primeras películas del catálogo con horarios inventados e iguales
  // para todas. Ahora usa las funciones reales de ESTE cine.
  const selectedDateValue = days.find(d => d.label === selectedDate)?.value;
  const screeningsHere = activeScreenings.filter(
    (s) => s.branchId === cinema.id && BOOKABLE_STATUSES.has(s.status) && (!selectedDateValue || s.date === selectedDateValue)
  );

  const moviesWithShowtimes = enabledMovies
    .map((movie) => ({
      movie,
      showtimes: screeningsHere.filter((s) => s.movieId === movie.id).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
    .filter(({ showtimes }) => showtimes.length > 0);

  const posterGrid = useGridKeyboardNav(enabledMovies.length, 5);

  return (
    <div className="cinema-details-page">
      <div className="cinema-details-container">

        <div className="cinema-details-header">
          <h1 className="cinema-title-blue">{cinema.name}</h1>
          <div className="cinema-header-tabs">
            <button
              className={`cinema-tab-btn ${activeTab === 'Horarios' ? 'active' : ''}`}
              onClick={() => setActiveTab('Horarios')}
            >
              Horarios
            </button>
            <button
              className={`cinema-tab-btn ${activeTab === 'Películas' ? 'active' : ''}`}
              onClick={() => setActiveTab('Películas')}
            >
              Películas
            </button>
          </div>
        </div>

        {activeTab === 'Horarios' && (
          <div className="cinema-horarios-view">
            <div className="cinema-horarios-controls">
              <CustomDropdown
                label="Fecha"
                placeholder="Elige un día"
                options={days.map((d) => d.label)}
                value={selectedDate}
                onChange={(label) => setSelectedDate(label || days[0].label)}
              />
            </div>

            {moviesWithShowtimes.length === 0 ? (
              <p className="no-functions-message" role="status">
                No hay funciones programadas en esta sede para esta fecha.
              </p>
            ) : (
              <div className="cinema-movies-list">
                {moviesWithShowtimes.map(({ movie, showtimes }) => (
                  <div key={movie.id} className="cinema-movie-list-item">

                    <div className="cinema-movie-poster-col">
                      <div className="poster-wrapper">
                        <img src={movie.poster} alt={movie.title} data-fallback-title={movie.title} onError={handlePosterError} />
                        {movie.featured && <div className="diagonal-tag">Estreno</div>}
                      </div>
                    </div>

                    <div className="cinema-movie-info-col">
                      <div className="movie-card-info">
                        <h4>{movie.title}</h4>
                        <p>{movie.genre}, {Math.floor(movie.duration / 60)}h {movie.duration % 60}min, {movie.rating}.</p>
                      </div>

                      <div className="room-type-tag">
                        {showtimes[0]?.format || movie.format[0]} {showtimes[0]?.language === 'ES' ? 'DOBLADA' : 'SUBTITULADA'}
                      </div>

                      <div className="showtime-buttons-grid cinema-showtimes">
                        {showtimes.map((s) => (
                          <button
                            key={s.id}
                            className="showtime-btn"
                            onClick={() => navigate('/web/compra', {
                              state: {
                                movie,
                                cinema: cinema.name,
                                date: selectedDate,
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

                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Películas' && (
          <div className="cinema-peliculas-view">
            <div className="movies-grid" role="grid" aria-label="Películas" onKeyDown={posterGrid.handleGridKeyDown}>
              {enabledMovies.map((movie, i) => (
                <button
                  type="button"
                  key={movie.id}
                  ref={posterGrid.registerItemRef(i)}
                  data-grid-index={i}
                  tabIndex={i === Math.min(posterGrid.focusedIndex, enabledMovies.length - 1) ? 0 : -1}
                  role="gridcell"
                  className="movie-poster"
                  onClick={() => navigate(`/web/pelicula/${movie.id}`)}
                  onFocus={() => posterGrid.setFocusedIndex(i)}
                  style={{ position: 'relative' }}
                  aria-label={`Ver detalle de ${movie.title}`}
                >
                  <img src={movie.poster} alt="" data-fallback-title={movie.title} onError={handlePosterError} />
                  {movie.featured && <div className="diagonal-tag">Estreno</div>}
                  <div className="movie-hover-overlay">
                    <span aria-hidden="true">Ver detalle ⟩</span>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
