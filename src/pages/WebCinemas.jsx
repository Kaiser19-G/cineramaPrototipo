import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import CustomDropdown from '../components/CustomDropdown';
import './WebPages.css';

export default function WebCinemas() {
  const navigate = useNavigate();
  const { branches } = useCinema();
  const [selectedCity, setSelectedCity] = useState('Todas las ciudades');
  const [selectedFormat, setSelectedFormat] = useState('Todos los formatos');

  // Obtener ciudades únicas
  const cities = [...new Set(branches.map(b => b.city))];
  const formatsList = ['2D', '3D', 'REGULAR'];

  const filteredBranches = branches.filter(b => {
    const matchesCity = selectedCity === 'Todas las ciudades' || b.city === selectedCity;
    const formatsString = Array.isArray(b.formats) ? b.formats.join(', ') : (b.formats || '');
    const matchesFormat = selectedFormat === 'Todos los formatos' || formatsString.includes(selectedFormat);
    return matchesCity && matchesFormat;
  });

  return (
    <div className="web-list-page">
      <div className="page-header">
        <h1 className="cinemas-title">Cines</h1>
      </div>

      <div className="cinemas-filter-bar">
        <CustomDropdown
          label="Por Ciudad"
          placeholder="Todas las ciudades"
          options={cities}
          value={selectedCity === 'Todas las ciudades' ? null : selectedCity}
          onChange={val => setSelectedCity(val || 'Todas las ciudades')}
        />
        
        <div className="filter-divider"></div>
        
        <CustomDropdown
          label="Por Formato"
          placeholder="Todos los formatos"
          options={formatsList}
          value={selectedFormat === 'Todos los formatos' ? null : selectedFormat}
          onChange={val => setSelectedFormat(val || 'Todos los formatos')}
        />
      </div>

      <div className="cinemas-grid-view">
        {filteredBranches.length > 0 ? (
          filteredBranches.map(cine => (
            <div 
              key={cine.id} 
              className="cinema-card-visual" 
              onClick={() => navigate(`/web/cine/${cine.id}`)}
            >
              <div className="cinema-card-img">
                <img src={cine.img} alt={cine.name} />
                <div className="cinema-hover-overlay">
                  <span>Ver Cartelera ⟩</span>
                </div>
              </div>
              <div className="cinema-card-details">
                <h4>{cine.name}</h4>
                <p className="cinema-address">{cine.address}</p>
                <p className="cinema-formats">{Array.isArray(cine.formats) ? cine.formats.join(', ') : (cine.formats || '2D, REGULAR')}</p>
              </div>
            </div>
          ))
        ) : (
          <div className="no-cinemas-message" style={{ gridColumn: '1 / -1', textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
            No se encontraron cines que coincidan con los filtros seleccionados.
          </div>
        )}
      </div>
    </div>
  );
}
