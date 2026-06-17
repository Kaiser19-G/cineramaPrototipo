import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import CustomDropdown from '../components/CustomDropdown';
import './WebPages.css';

export default function WebMovieDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const showtimesRef = useRef(null);
  const { enabledMovies, branches } = useCinema();

  const movie = enabledMovies.find(m => m.id === parseInt(id)) || enabledMovies[0];

  const [expandedCinema, setExpandedCinema] = useState('CP Arequipa Mall Plaza');
  const [filterCity, setFilterCity]   = useState(location.state?.city || null);
  const [filterCinema, setFilterCinema] = useState(location.state?.cinema || null);
  const [filterDate, setFilterDate]   = useState(location.state?.date || null);

  const cities  = [...new Set(branches.map(b => b.city))];
  const cinemaNames = branches.map(b => b.name);

  const dates = ['Hoy Lunes', 'Martes 19', 'Miércoles 20'];

  const toggleCinema = (cinemaName) => {
    setExpandedCinema(expandedCinema === cinemaName ? null : cinemaName);
  };

  const handleScrollToShowtimes = () => {
    showtimesRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const cinemas = [
    { name: 'CP Arequipa Mall Plaza', showtimes: [{ time: '16:50', active: false }, { time: '21:30', active: true }] },
    { name: 'CP Brasil', showtimes: [{ time: '18:00', active: true }, { time: '20:30', active: true }] },
    { name: 'CP Centro Jr. De La Unión', showtimes: [{ time: '14:20', active: false }, { time: '19:15', active: true }] },
    { name: 'CP Chiclayo Mall Aventura', showtimes: [{ time: '16:00', active: false }, { time: '21:00', active: true }] },
    { name: 'CP Chiclayo Real Plaza', showtimes: [{ time: '17:30', active: true }, { time: '22:00', active: true }] },
    { name: 'CP Comas', showtimes: [{ time: '15:10', active: false }, { time: '20:00', active: true }] }
  ];

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
              <img src={movie.poster} alt={movie.title} />
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

        {/* 4. Sección de funciones y horarios */}
        <div className="movie-showtimes-section" ref={showtimesRef}>
          <h2 className="section-title-fun">La función perfecta para ti.</h2>

          {/* Filtros de la función */}
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
              options={dates}
              value={filterDate}
              onChange={setFilterDate}
            />
          </div>

          {/* Acordeón de cines */}
          <div className="cinemas-accordion">
            {cinemas.map(cine => {
              const isExpanded = expandedCinema === cine.name;
              return (
                <div key={cine.name} className="accordion-item-cinema">
                  <div className="accordion-header-cinema" onClick={() => toggleCinema(cine.name)}>
                    <h3>{cine.name}</h3>
                    <span className="arrow">{isExpanded ? '−' : '+'}</span>
                  </div>

                  {isExpanded && (
                    <div className="accordion-body-cinema">
                      <div className="room-type-tag">
                        2D REGULAR DOBLADA
                      </div>
                      
                      <div className="showtime-buttons-grid">
                        {cine.showtimes.map((st, index) => (
                          <button
                            key={index}
                            className={`showtime-btn ${!st.active ? 'disabled' : ''}`}
                            disabled={!st.active}
                            onClick={() => navigate('/web/compra')}
                          >
                            <span className="time-lbl">{st.time}</span>
                            {st.active && (
                              <span className="chair-icon" style={{display: 'flex'}}>
                                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                  <path d="M4 18v3"/><path d="M20 18v3"/><path d="M5 10V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v5"/><path d="M3 10a2 2 0 0 0-2 2v3c0 1.1.9 2 2 2h18a2 2 0 0 0 2-2v-3a2 2 0 0 0-2-2H3z"/>
                                </svg>
                              </span>
                            )}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>

        </div>

      </div>

    </div>
  );
}
