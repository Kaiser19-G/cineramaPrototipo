import { useState, useMemo, useRef } from 'react';
import './WebHome.css';
import { useNavigate } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import CustomDropdown from '../components/CustomDropdown';
import { getNextDays } from '../data/dateHelpers';
import Poster from '../components/Poster';
import PosterTags from '../components/PosterTags';
import { movieLabel } from '../utils/movieLabel';
import { useGridKeyboardNav } from '../hooks/useGridKeyboardNav';
import { buildScreeningEntries, computeCascadingOptions } from '../data/screeningEntries';
import cineramaBanner from '../assets/CineramaBanner.png';

const HOME_DIMENSIONS = {
  movie: (e) => e.movie.title,
  city: (e) => e.branch.city,
  cinema: (e) => e.branch.name,
  date: (e) => e.dayLabel,
};

const TABS = [
  { key: 'cartelera', label: 'En Cartelera', gridLabel: 'Películas en cartelera', empty: 'No hay películas en cartelera por ahora.',
    pick: (m) => m.status === 'active' && !m.presale },
  { key: 'preventa', label: 'En Preventa', gridLabel: 'Películas en preventa', empty: 'No hay películas en preventa por ahora.',
    pick: (m) => m.presale },
  { key: 'proximamente', label: 'Próximamente', gridLabel: 'Películas próximamente', empty: 'No hay estrenos anunciados por ahora.',
    pick: (m) => m.status === 'upcoming' && !m.presale },
];

export default function WebHome() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('cartelera');
  const { branches, publicMovies: enabledMovies, publicScreenings: activeScreenings } = useCinema();
  const tabRefs = useRef([]);
  const tab = TABS.find((t) => t.key === activeTab) ?? TABS[0];
  // Las destacadas van primero; el resto conserva el orden del catálogo. Se muestran hasta 5 (el catálogo completo está en "Ver catálogo").
  const carteleraMovies = useMemo(
    () => enabledMovies.filter(tab.pick).sort((a, b) => Number(b.featured) - Number(a.featured)).slice(0, 5),
    [enabledMovies, tab]
  );
  const posterGrid = useGridKeyboardNav(carteleraMovies.length, 5);

  const [currentSlide, setCurrentSlide] = useState(0);
  const [selectedMovie, setSelectedMovie] = useState(null);
  const [selectedCity, setSelectedCity] = useState(null);
  const [selectedCinema, setSelectedCinema] = useState(null);
  const [selectedDate, setSelectedDate] = useState(null);

  const days = useMemo(() => getNextDays(7), []);
  const entries = useMemo(
    () => buildScreeningEntries({ movies: enabledMovies, branches, screenings: activeScreenings, days }),
    [enabledMovies, branches, activeScreenings, days]
  );

  // Buscador en cascada: cada opción que se ofrece, combinada con lo que ya
  // se eligió en los otros campos, tiene al menos una función real — así no
  // se puede armar una búsqueda que termine en "no hay funciones".
  const searchFilters = { movie: selectedMovie, city: selectedCity, cinema: selectedCinema, date: selectedDate };
  const cascading = computeCascadingOptions(entries, searchFilters, HOME_DIMENSIONS);

  const movieTitles = enabledMovies.map(m => m.title).filter(t => cascading.movie.includes(t));
  const cities = [...new Set(branches.map(b => b.city))].filter(c => cascading.city.includes(c));
  const cinemaNames = branches.map(b => b.name).filter(c => cascading.cinema.includes(c));
  const dateOptions = days.map((d) => d.label).filter(l => cascading.date.includes(l));

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
            options={movieTitles}
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
            options={cinemaNames}
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
          <div className="movies-tabs" role="tablist" aria-label="Estado de las películas"
            onKeyDown={(e) => {
              const focused = tabRefs.current.indexOf(document.activeElement);
              const i = focused >= 0 ? focused : TABS.findIndex((t) => t.key === activeTab);
              let n = null;
              if (e.key === 'ArrowRight') n = (i + 1) % TABS.length;
              else if (e.key === 'ArrowLeft') n = (i - 1 + TABS.length) % TABS.length;
              else if (e.key === 'Home') n = 0;
              else if (e.key === 'End') n = TABS.length - 1;
              if (n === null) return;
              e.preventDefault();
              setActiveTab(TABS[n].key);
              tabRefs.current[n]?.focus();
            }}>
            {TABS.map((t, i) => (
              <button
                key={t.key}
                type="button"
                role="tab"
                id={`home-tab-${t.key}`}
                aria-selected={activeTab === t.key}
                aria-controls="home-tabpanel"
                tabIndex={activeTab === t.key ? 0 : -1}
                ref={(el) => { tabRefs.current[i] = el; }}
                className={`tab-btn ${activeTab === t.key ? 'active' : ''}`}
                onClick={() => setActiveTab(t.key)}
              >
                {t.label}
              </button>
            ))}
          </div>
          <button className="btn-catalogo" onClick={() => navigate('/web/peliculas')}>Ver catalogo</button>
        </div>
        <div className="movies-divider"></div>

        <div id="home-tabpanel" role="tabpanel" aria-labelledby={`home-tab-${tab.key}`}>
        {carteleraMovies.length === 0 && <p className="movies-empty" role="status">{tab.empty}</p>}
        {carteleraMovies.length > 0 && <div className="movies-grid" role="grid" aria-label={tab.gridLabel} onKeyDown={posterGrid.handleGridKeyDown}>
          {carteleraMovies.map((movie, i) => (
            <button
              type="button"
              key={movie.id}
              ref={posterGrid.registerItemRef(i)}
              data-grid-index={i}
              tabIndex={i === Math.min(posterGrid.focusedIndex, carteleraMovies.length - 1) ? 0 : -1}
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
      </section>
    </>
  );
}
