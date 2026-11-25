import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import CustomDropdown from '../components/CustomDropdown';
import { getNextDays } from '../data/dateHelpers';
import Poster from '../components/Poster';
import PosterTags from '../components/PosterTags';
import { movieLabel } from '../utils/movieLabel';
import WebNotFound from './WebNotFound';
import { useGridKeyboardNav } from '../hooks/useGridKeyboardNav';
import { buildScreeningEntries, presaleFirstDates, presaleFromText } from '../data/screeningEntries';
import './WebPages.css';

export default function WebCinemaDetails() {
  const { id } = useParams();
  const { branches } = useCinema();
  const cinema = /^\d+$/.test(id ?? '') ? branches.find(b => b.id === Number(id)) : undefined;
  if (!cinema) return <WebNotFound />;
  return <CinemaDetailsView cinema={cinema} />;
}

function CinemaDetailsView({ cinema }) {
  const navigate = useNavigate();
  const { publicMovies, publicScreenings: activeScreenings, publicMovieCinema } = useCinema();
  // Solo las películas habilitadas en ESTA sede (las que el administrador central asignó).
  const enabledMovies = publicMovies.filter(
    (m) => publicMovieCinema.some((mc) => mc.movieId === m.id && mc.branchId === cinema.id && mc.activa)
  );

  const [activeTab, setActiveTab] = useState('Horarios');
  const days = getNextDays(7);

  // R1 (mismo origen que H-01/H-02/H-03/H-07): antes esta pantalla mostraba
  // las 3 primeras películas del catálogo con horarios inventados e iguales
  // para todas. Ahora usa las funciones reales de ESTE cine.
  const cinemaEntries = buildScreeningEntries({
    movies: enabledMovies, branches: [cinema], screenings: activeScreenings, days,
  });

  // El selector de fecha solo ofrece días en los que esta sede SÍ tiene
  // alguna función — nunca un día que lleve a "no hay funciones".
  const availableDateLabels = days.map(d => d.label).filter(
    (label) => cinemaEntries.some((e) => e.dayLabel === label)
  );
  const [selectedDate, setSelectedDate] = useState(availableDateLabels[0] || days[0].label);

  const selectedDateValue = days.find(d => d.label === selectedDate)?.value;
  const screeningsHere = cinemaEntries.filter(
    (e) => !selectedDateValue || e.screening.date === selectedDateValue
  ).map((e) => e.screening);

  const moviesWithShowtimes = enabledMovies
    .map((movie) => ({
      movie,
      showtimes: screeningsHere.filter((s) => s.movieId === movie.id).sort((a, b) => a.startTime.localeCompare(b.startTime)),
    }))
    .filter(({ showtimes }) => showtimes.length > 0);

  // Preventa con funciones solo después de la ventana de 7 días: no entran en la grilla de horarios,
  // pero se anuncian aparte (sin repetir las que ya salen en algún día de la grilla).
  const presaleFrom = presaleFirstDates({ movies: enabledMovies, screenings: activeScreenings, branchId: cinema.id });
  const inWindow = new Set(cinemaEntries.filter((e) => e.dayLabel).map((e) => e.movie.id));
  const presaleLater = enabledMovies.filter((m) => presaleFrom[m.id] && !inWindow.has(m.id));

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
                options={availableDateLabels}
                value={selectedDate}
                onChange={(label) => setSelectedDate(label || availableDateLabels[0])}
              />
            </div>

            {moviesWithShowtimes.length === 0 && presaleLater.length === 0 ? (
              <p className="no-functions-message" role="status">
                No hay funciones programadas en esta sede para esta fecha.
              </p>
            ) : (
              <div className="cinema-movies-list">
                {moviesWithShowtimes.length === 0 && (
                  <p className="no-functions-message" role="status">
                    No hay funciones programadas en esta sede para esta fecha.
                  </p>
                )}
                {moviesWithShowtimes.map(({ movie, showtimes }) => (
                  <div key={movie.id} className="cinema-movie-list-item">

                    <div className="cinema-movie-poster-col">
                      <div className="poster-wrapper">
                        <Poster movie={movie} alt={movie.title} />
                        <PosterTags movie={movie} />
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
                            className={`showtime-btn${s.status === 'sold_out' ? ' soldout' : ''}`}
                            aria-label={`${s.startTime}, ${s.format} ${s.language === 'ES' ? 'doblada' : 'subtitulada'}${s.status === 'sold_out' ? ', agotada' : ''}`}
                            aria-disabled={s.status === 'sold_out' ? 'true' : undefined}
                            onClick={() => s.status !== 'sold_out' && navigate(`/web/compra/${s.id}`)}
                          >
                            <span className="time-lbl">{s.startTime}</span>
                            {s.status === 'sold_out' && <span className="soldout-lbl" aria-hidden="true">Agotada</span>}
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
                {presaleLater.map((movie) => (
                  <div key={`pre-${movie.id}`} className="cinema-movie-list-item">
                    <div className="cinema-movie-poster-col">
                      <div className="poster-wrapper">
                        <Poster movie={movie} alt={movie.title} />
                        <PosterTags movie={movie} />
                      </div>
                    </div>
                    <div className="cinema-movie-info-col">
                      <div className="movie-card-info">
                        <h4>{movie.title}</h4>
                        <p>{movie.genre}, {Math.floor(movie.duration / 60)}h {movie.duration % 60}min, {movie.rating}.</p>
                      </div>
                      <p className="presale-from-note">{presaleFromText(presaleFrom[movie.id])}</p>
                      <button type="button" className="presale-from-link" onClick={() => navigate(`/web/pelicula/${movie.id}`)}>
                        Ver ficha y comprar
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'Películas' && (
          <div className="cinema-peliculas-view">
            {enabledMovies.length === 0 && <p className="no-functions-message" role="status">Esta sede todavía no tiene películas habilitadas.</p>}
            {enabledMovies.length > 0 && <div className="movies-grid" role="grid" aria-label="Películas" onKeyDown={posterGrid.handleGridKeyDown}>
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
                  aria-label={movieLabel(movie)}
                >
                  <Poster movie={movie} />
                  <PosterTags movie={movie} />
                  <div className="movie-hover-overlay">
                    <span aria-hidden="true">Ver detalle ⟩</span>
                  </div>
                </button>
              ))}
            </div>}
          </div>
        )}

      </div>
    </div>
  );
}
