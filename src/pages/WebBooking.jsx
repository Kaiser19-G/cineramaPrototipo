import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import './WebPages.css';

export default function WebBooking() {
  const [step, setStep] = useState(1); // 1 = Butacas, 2 = Pago
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const navigate = useNavigate();
  
  // Mock occupied seats
  const occupied = new Set(['B4', 'B5', 'F6', 'F7', 'F8', 'J10']);
  
  const COLS = 10;
  const ROWS = 8;
  const seatColor = { available: 'rgba(255,255,255,0.05)', selected: '#cc0000', occupied: 'rgba(255,255,255,0.05)' };
  const seatBorder = { available: 'rgba(255,255,255,0.1)', selected: '#cc0000', occupied: 'rgba(255,255,255,0.02)' };

  const toggleSeatSelect = (seatName) => {
    if (occupied.has(seatName)) return;
    setSelectedSeats(p => p.includes(seatName) ? p.filter(x => x !== seatName) : [...p, seatName]);
  };

  const total = selectedSeats.reduce((sum, seat) => {
    return sum + 15;
  }, 0);

  const handlePayment = () => {
    setShowSuccessModal(true);
  };

  return (
    <div className="web-booking-layout">
      
      {showSuccessModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.85)', zIndex: 1000, display: 'flex', justifyContent: 'center', alignItems: 'center', backdropFilter: 'blur(5px)' }}>
          <div style={{ background: '#111', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '12px', padding: '3rem', textAlign: 'center', maxWidth: '400px', boxShadow: '0 15px 50px rgba(0,0,0,0.8)' }}>
            <div style={{ width: '80px', height: '80px', background: 'rgba(46, 199, 113, 0.1)', borderRadius: '50%', display: 'flex', justifyContent: 'center', alignItems: 'center', margin: '0 auto 1.5rem', border: '2px solid #2EC771' }}>
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#2EC771" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h2 style={{ color: 'white', fontSize: '1.8rem', marginBottom: '1rem' }}>¡Compra Exitosa!</h2>
            <p style={{ color: '#ccc', marginBottom: '2rem', lineHeight: '1.5' }}>
              Tus boletos han sido enviados a tu correo electrónico. Disfruta de la función.
            </p>
            <button className="btn-solid" onClick={() => navigate('/WebHome')} style={{ width: '100%', padding: '12px', fontSize: '1.1rem' }}>
              Volver al Inicio
            </button>
          </div>
        </div>
      )}

      <div className="booking-main" style={{ background: 'rgba(0,0,0,0.6)', border: '1px solid rgba(255,255,255,0.1)', color: 'white', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {step === 1 ? (
          <div className="seats-selection" style={{ width: '100%', padding: '2rem 0' }}>
            <div style={{ marginBottom: 40, textAlign: 'center', width: '100%' }}>
              <div style={{ height: 6, background: 'rgba(204,0,0,0.2)', border: '1px solid #cc0000', borderRadius: 4, margin: '0 auto 12px', width: '70%', boxShadow: '0 0 15px rgba(204,0,0,0.5)' }} />
              <p style={{ fontSize: 12, color: '#cc0000', textTransform: 'uppercase', letterSpacing: 3, fontWeight: 700 }}>Pantalla</p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: `repeat(${COLS}, 36px)`, gap: 10, justifyContent: 'center', marginBottom: 40 }}>
              {Array.from({ length: ROWS }).map((_, r) =>
                Array.from({ length: COLS }).map((_, c) => {
                  const rowLetter = String.fromCharCode(65 + r);
                  const seatName = `${rowLetter}${c + 1}`;
                  const isOccupied = occupied.has(seatName);
                  const isSelected = selectedSeats.includes(seatName);
                  let state = 'available';
                  if (isOccupied) state = 'occupied';
                  else if (isSelected) state = 'selected';

                  return (
                    <button
                      key={seatName}
                      disabled={isOccupied}
                      onClick={() => toggleSeatSelect(seatName)}
                      title={isOccupied ? `${seatName} (Ocupado)` : isSelected ? `${seatName} (Seleccionado)` : `${seatName} (Estándar)`}
                      style={{
                        width: 36, height: 36, borderRadius: 8,
                        border: `2px solid ${seatBorder[state]}`,
                        background: seatColor[state], 
                        cursor: isOccupied ? 'not-allowed' : 'pointer',
                        opacity: isOccupied ? 0.3 : 1,
                        transition: 'all 0.2s', fontSize: 10,
                        color: isSelected ? 'white' : '#888', 
                        fontWeight: isSelected ? 800 : 500,
                      }}
                    >
                      {seatName}
                    </button>
                  );
                })
              )}
            </div>

            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap', justifyContent: 'center', marginBottom: '2rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#ccc' }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid rgba(255,255,255,0.1)', background: 'rgba(255,255,255,0.05)' }} />
                Disponible
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#ccc' }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, border: '2px solid #cc0000', background: '#cc0000' }} />
                Seleccionado
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13, color: '#ccc' }}>
                <div style={{ width: 16, height: 16, borderRadius: 4, background: 'rgba(255,255,255,0.1)', opacity: 0.3 }} />
                Ocupado
              </div>
            </div>

            <div className="booking-actions" style={{ justifyContent: 'center' }}>
              <button className="btn-solid" disabled={selectedSeats.length === 0} onClick={() => setStep(2)} style={{ padding: '12px 40px', fontSize: '1.2rem', opacity: selectedSeats.length === 0 ? 0.5 : 1 }}>
                Continuar ⟩
              </button>
            </div>
          </div>
        ) : (
          <div className="payment-section" style={{ width: '100%', maxWidth: '500px', padding: '2rem' }}>
            <h3 style={{ fontSize: '1.8rem', marginBottom: '1.5rem', color: 'white' }}>Pago Seguro</h3>
            <div className="payment-form">
              <select style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '1rem', borderRadius: '8px' }}>
                <option>Tarjeta de Crédito / Débito</option>
              </select>
              <input type="text" placeholder="Nombre del Titular" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '1rem', borderRadius: '8px' }} />
              <input type="text" placeholder="Número Tarjeta" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '1rem', borderRadius: '8px' }} />
              <div className="payment-row">
                <input type="text" placeholder="MM/YY" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '1rem', borderRadius: '8px' }} />
                <input type="text" placeholder="CVV" style={{ backgroundColor: 'rgba(255,255,255,0.05)', color: 'white', border: '1px solid rgba(255,255,255,0.2)', padding: '1rem', borderRadius: '8px' }} />
              </div>
            </div>
            <div className="booking-actions" style={{ justifyContent: 'space-between', marginTop: '2rem' }}>
              <button className="btn-outline" onClick={() => setStep(1)}>⟨ Volver</button>
              <button className="btn-solid" onClick={handlePayment}>Pagar S/ {total.toFixed(2)} ⟩</button>
            </div>
          </div>
        )}
      </div>

      <aside className="booking-sidebar" style={{ background: 'rgba(0,0,0,0.8)', borderColor: 'rgba(255,255,255,0.1)', color: 'white' }}>
        <div className="movie-summary-card">
          <div className="movie-img-placeholder" style={{ width: '80px', height: '120px', background: '#333', borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ color: '#888' }}>Póster</span>
          </div>
          <div className="movie-info-compact">
            <p style={{ margin: '0 0 5px', color: '#fff', fontWeight: 'bold' }}>2D Regular</p>
            <p style={{ margin: '0 0 5px', color: '#ccc' }}>Doblada</p>
            <p style={{ margin: '0 0 5px', color: '#ccc' }}>120 min</p>
          </div>
        </div>
        
        <h2 style={{ color: 'white', fontSize: '1.6rem', marginBottom: '8px' }}>Avengers: Endgame</h2>
        <p className="highlight-text" style={{ color: '#cc0000', fontSize: '1.1rem', marginBottom: '8px' }}>CP Arequipa Mall Plaza</p>
        <p style={{ color: '#ccc', marginBottom: '4px' }}>Hoy Lunes 20 - 21:30</p>
        <p style={{ color: '#ccc' }}>Sala 5</p>

        <div className="divider" style={{ background: 'rgba(255,255,255,0.1)' }}></div>

        <h3 style={{ color: 'white', marginBottom: '1rem' }}>Resumen de Compra</h3>
        
        <div className="seats-selected-list" style={{ marginBottom: '1rem' }}>
          <p style={{ color: '#aaa', margin: '0 0 10px 0' }}>Butacas Seleccionadas:</p>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', minHeight: '30px' }}>
            {selectedSeats.length > 0 ? selectedSeats.map(s => (
               <span key={s} style={{ background: 'rgba(204,0,0,0.2)', border: '1px solid #cc0000', color: 'white', padding: '4px 10px', borderRadius: '4px', fontSize: '0.9rem', fontWeight: 'bold' }}>{s}</span>
            )) : <span style={{ color: '#666', fontStyle: 'italic', fontSize: '0.9rem' }}>Ninguna seleccionada</span>}
          </div>
        </div>
        
        <div className="divider" style={{ background: 'rgba(255,255,255,0.1)' }}></div>
        <div className="total-row" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <p style={{ color: 'white', margin: 0 }}>Total a Pagar:</p>
          <p className="price" style={{ color: 'var(--emerald, #2EC771)', fontSize: '1.8rem', fontWeight: '900', margin: 0 }}>S/ {total.toFixed(2)}</p>
        </div>
      </aside>

    </div>
  );
}
