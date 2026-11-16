import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import { useAuth } from '../context/AuthContext';
import { ordersApi } from '../api/orders';
import CustomDropdown from '../components/CustomDropdown';
import StepIndicator from '../components/StepIndicator';
import { getNextDays, formatDateLong } from '../data/dateHelpers';
import Poster from '../components/Poster';
import PosterTags from '../components/PosterTags';
import WebNotFound from './WebNotFound';
import { cssUrl } from '../utils/cssUrl';
import { PRESALE_MAX_TICKETS } from '../shared/presale';
import { buildScreeningEntries, computeCascadingOptions } from '../data/screeningEntries';
import './WebPages.css';

const DETAIL_DIMENSIONS = {
  city: (e) => e.branch.city,
  cinema: (e) => e.branch.name,
  date: (e) => e.dayLabel,
};

// Una película inexistente, archivada o sin sede habilitada no se sustituye por otra: página de no encontrada.
export default function WebMovieDetails() {
  const { id } = useParams();
  const { publicMovies } = useCinema();
  const movie = /^\d+$/.test(id ?? '') ? publicMovies.find(m => m.id === Number(id)) : undefined;
  if (!movie) return <WebNotFound />;
  return <MovieDetailsView movie={movie} />;
}

function MovieDetailsView({ movie }) {
  const navigate = useNavigate();
  const location = useLocation();
  const showtimesRef = useRef(null);
  const { branches, publicScreenings: activeScreenings } = useCinema();
  const upcoming = movie.status === 'upcoming';
  const { user } = useAuth();
  // Cupo de preventa de la cuenta (solo clientes con sesion; sin sesion queda el aviso general).
  const [fetched, setFetched] = useState(null);
  const isCustomer = user?.tier === 'customer';
  useEffect(() => {
    if (!isCustomer || !movie.presale) return undefined;
    let off = false;
    ordersApi.presaleQuota(movie.id).then((res) => { if (!off) setFetched({ movieId: movie.id, quota: res.ok ? res.data.presale : null }); });
    return () => { off = true; };
  }, [isCustomer, movie.id, movie.presale]);
  const quota = isCustomer && movie.presale && fetched?.movieId === movie.id ? fetched.quota : null;
  // Las próximas con preventa también se venden (el servidor solo permite programarlas si tienen preventa).
  const sellable = !upcoming || movie.presale;

  // En preventa las funciones empiezan en el estreno, que puede estar lejos: se ofrecen los próximos 30 días (el filtro de
  // fecha solo muestra los días que de verdad tienen funciones).
  const days = getNextDays(movie.presale ? 30 : 7);
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
      <div className="movie-detail-banner" style={{ backgroundImage: cssUrl(movie.backdrop || movie.poster), backgroundSize: 'cover', backgroundPosition: 'center' }}>
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
            {movie.presale && (
              <p className="movie-notice" role="note">
                <strong>Preventa:</strong> máximo {PRESALE_MAX_TICKETS} entradas por cuenta. Estreno el {formatDateLong(movie.releaseDate)}.
              </p>
            )}
            {quota && (
              <p className="movie-notice" role="status">
                {quota.remaining === 0
                  ? `Ya compraste tus ${quota.limit} entradas de preventa de esta película: no puedes comprar más.`
                  : `Ya compraste ${quota.bought} de ${quota.limit} entradas de preventa. Te ${quota.remaining === 1 ? 'queda 1 entrada' : `quedan ${quota.remaining} entradas`}.`}
              </p>
            )}
            {upcoming && !movie.presale && (
              <p className="movie-notice" role="note">
                <strong>Próximamente{movie.releaseDate ? `: estreno el ${formatDateLong(movie.releaseDate)}` : ''}.</strong> Todavía no hay funciones programadas.
              </p>
            )}
          </div>
          {sellable && <button className="btn-comprar-top" onClick={handleScrollToShowtimes}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px', verticalAlign: 'text-bottom'}}>
              <path d="M2 9a3 3 0 0 1 0 6v2a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-2a3 3 0 0 1 0-6V7a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2Z"/><path d="M13 5v2"/><path d="M13 11v2"/><path d="M13 17v2"/>
            </svg>
            Comprar
          </button>}
        </div>

        {/* 3. Dos columnas: Póster y Sinopsis */}
        <div className="movie-info-cols">
          <div className="movie-info-left">
            <div className="poster-wrapper">
              <Poster movie={movie} alt={movie.title} />
              <PosterTags movie={movie} />
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
        {sellable && <div className="movie-showtimes-section" ref={showtimesRef}>
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

                  {days.map((d) => ({ d, items: showtimes.filter((s) => s.date === d.value) })).filter((g) => g.items.length > 0).map(({ d, items }) => (
                    <div key={d.value} className="showtime-day-group">
                      <h4 className="showtime-day">{d.label}</h4>
                      <div className="showtime-buttons-grid">
                        {items.map((s) => (
                          <button
                            key={s.id}
                            className={`showtime-btn${s.status === 'sold_out' ? ' soldout' : ''}`}
                            aria-label={`${d.label}, ${s.startTime}, ${s.format} ${s.language === 'ES' ? 'doblada' : 'subtitulada'}, ${branch.name}${s.status === 'sold_out' ? ', agotada' : ''}`}
                            aria-disabled={s.status === 'sold_out' ? 'true' : undefined}
                            onClick={() => s.status !== 'sold_out' && navigate(`/web/compra/${s.id}`)}
                          >
                            <span className="time-lbl">{s.startTime}</span>
                            {s.status === 'sold_out' && <span className="soldout-lbl" aria-hidden="true">Agotada</span>}
                            <span className="chair-icon" style={{display: 'flex'}} aria-hidden="true">
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
              ))}
            </div>
          )}
        </div>}

      </div>

    </div>
  );
}
