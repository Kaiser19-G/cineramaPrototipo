import { useState } from 'react';
import './WebHome.css';
import { useNavigate } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import CustomDropdown from '../components/CustomDropdown';
import cineramaBanner from '../assets/CineramaBanner.png';

export default function WebHome() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('cartelera');
  const { branches, enabledMovies } = useCinema();

  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedCinema, setSelectedCinema] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  const cities = [...new Set(branches.map(b => b.city))];
  const dateOptions = ['Hoy Lunes', 'Martes 19', 'Miércoles 20'];

  const handleSearch = () => {
    let movieId;
    if (selectedMovie) {
      const movie = enabledMovies.find(m => m.title === selectedMovie);
      if (movie) movieId = movie.id;
    }
    
    if (movieId) {
      navigate(`/web/pelicula/${movieId}`, {
        state: {
          city: selectedCity,
          cinema: selectedCinema,
          date: selectedDate
        }
      });
    } else {
      navigate('/web/peliculas');
    }
  };

  return (
    <>
      {/* Hero Banner */}
      <section className="web-hero">
        <div className="hero-carousel">
          <button className="carousel-control prev" aria-label="Diapositiva anterior" onClick={() => setCurrentSlide(prev => (prev > 0 ? prev - 1 : 4))}>〈</button>
          <img src={cineramaBanner} alt="Cinerama Banner" className="hero-img" />
          <button className="carousel-control next" aria-label="Siguiente diapositiva" onClick={() => setCurrentSlide(prev => (prev < 4 ? prev + 1 : 0))}>〉</button>
          <div className="carousel-indicators" role="tablist" aria-label="Diapositivas del banner">
            {[0, 1, 2, 3, 4].map((idx) => (
              <button
                type="button"
                key={idx}
                role="tab"
                aria-label={`Ir a la diapositiva ${idx + 1}`}
                aria-selected={currentSlide === idx}
                className={`dot ${currentSlide === idx ? 'active' : ''}`}
                onClick={() => setCurrentSlide(idx)}
              ></button>
            ))}
          </div>
        </div>
      </section>

      {/* Buscador de Funciones */}
      <section className="web-search-bar">
        <div className="search-filters">
          <CustomDropdown
            label="Por Película"
            placeholder="¿Qué quieres ver?"
            options={enabledMovies.map(m => m.title)}
            value={selectedMovie}
            onChange={setSelectedMovie}
          />
          
          <div className="filter-divider"></div>
          
          <CustomDropdown
            label="Por Ciudad"
            placeholder="¿Dónde?"
            options={cities}
            value={selectedCity}
            onChange={setSelectedCity}
          />
          
          <div className="filter-divider"></div>
          
          <CustomDropdown
            label="Por Cine"
            placeholder="¿En qué cine?"
            options={branches.map(b => b.name)}
            value={selectedCinema}
            onChange={setSelectedCinema}
          />
          
          <div className="filter-divider"></div>
          
          <CustomDropdown
            label="Por Fecha"
            placeholder="Elige un día"
            options={dateOptions}
            value={selectedDate}
            onChange={setSelectedDate}
          />
          
          <button className="btn-buscar" onClick={handleSearch}>Buscar</button>
        </div>
      </section>

      {/* Cartelera */}
      <section className="web-movies-section">
        <h2 className="section-title">Peliculas</h2>
        
        <div className="movies-header">
          <div className="movies-tabs">
            <button 
              className={`tab-btn ${activeTab === 'cartelera' ? 'active' : ''}`}
              onClick={() => setActiveTab('cartelera')}
            >
              En Cartelera
            </button>
            <button 
              className={`tab-btn ${activeTab === 'preventa' ? 'active' : ''}`}
              onClick={() => setActiveTab('preventa')}
            >
              En Preventa
            </button>
            <button 
              className={`tab-btn ${activeTab === 'proximamente' ? 'active' : ''}`}
              onClick={() => setActiveTab('proximamente')}
            >
              Proximamente
            </button>
          </div>
          <button className="btn-catalogo" onClick={() => navigate('/web/peliculas')}>Ver catalogo</button>
        </div>
        <div className="movies-divider"></div>

        <div className="movies-grid">
          {enabledMovies.slice(0, 5).map(movie => (
            <button
              type="button"
              key={movie.id}
              className="movie-poster"
              onClick={() => navigate(`/web/pelicula/${movie.id}`)}
              style={{ position: 'relative' }}
              aria-label={`Ver detalle de ${movie.title}`}
            >
              <img src={movie.poster} alt="" />
              <div className="movie-hover-overlay">
                <span aria-hidden="true">Ver detalle ⟩</span>
              </div>
            </button>
          ))}
        </div>
      </section>
    </>
  );
}
