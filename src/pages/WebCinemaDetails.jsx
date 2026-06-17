import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import CustomDropdown from '../components/CustomDropdown';
import './WebPages.css';

export default function WebCinemaDetails() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { branches, enabledMovies } = useCinema();

  const cinema = branches.find(b => b.id === parseInt(id)) || branches[0];

  const [activeTab, setActiveTab] = useState('Horarios');
  const [selectedDate, setSelectedDate] = useState('Hoy Miércoles 20');

  const dates = ['Hoy Lunes', 'Martes 19', 'Miércoles 20'];

  // Demo showtimes mapped for movies
  const getShowtimes = () => {
    return [
      { time: '17:10', active: false },
      { time: '19:30', active: true },
      { time: '21:50', active: true }
    ];
  };

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
                options={dates}
                value={selectedDate}
                onChange={setSelectedDate}
              />
            </div>
            
            <div className="cinema-movies-list">
              {enabledMovies.slice(0, 3).map(movie => (
                <div key={movie.id} className="cinema-movie-list-item">
                  
                  <div className="cinema-movie-poster-col">
                    <div className="poster-wrapper">
                      <img src={movie.poster} alt={movie.title} />
                      {movie.featured && <div className="diagonal-tag">Estreno</div>}
                    </div>
                  </div>
                  
                  <div className="cinema-movie-info-col">
                    <div className="movie-card-info">
                      <h4>{movie.title}</h4>
                      <p>{movie.genre}, {Math.floor(movie.duration / 60)}h {movie.duration % 60}min, {movie.rating}.</p>
                    </div>
                    
                    <div className="room-type-tag">
                      2D REGULAR DOBLADA
                    </div>
                    
                    <div className="showtime-buttons-grid cinema-showtimes">
                      {getShowtimes().map((st, index) => (
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
                  
                </div>
              ))}
            </div>
          </div>
        )}

        {activeTab === 'Películas' && (
          <div className="cinema-peliculas-view">
            <div className="movies-grid">
              {enabledMovies.map(movie => (
                <div key={movie.id} className="movie-poster" onClick={() => navigate(`/web/pelicula/${movie.id}`)} style={{position: 'relative', cursor: 'pointer'}}>
                  <img src={movie.poster} alt={movie.title} />
                  {movie.featured && <div className="diagonal-tag">Estreno</div>}
                  <div className="movie-hover-overlay">
                    <span>Ver detalle ⟩</span>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  );
}
