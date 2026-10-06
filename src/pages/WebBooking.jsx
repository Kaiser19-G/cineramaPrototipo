import { useState, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import './WebPages.css';

const SEAT_PRICE = 15;
const STEPS = ['Butacas', 'Pago', 'Confirmación'];

function FieldError({ message, id }) {
  return (
    <span className="field-error" role="alert" id={id}>
      <svg aria-hidden="true" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {message}
    </span>
  );
}

export default function WebBooking() {
  const [step, setStep] = useState(1); // 1 = Butacas, 2 = Pago
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const navigate = useNavigate();
  const location = useLocation();
  const { enabledMovies, branches } = useCinema();

  // Datos reales de la selección del usuario (película, cine, fecha, horario).
  // Si se llega directo a /web/compra sin pasar por el flujo, se usa un fallback real (no inventado).
  const booking = location.state || {};
  const movie = booking.movie || enabledMovies[0] || null;
  const cinemaName = booking.cinema || branches[0]?.name || 'Cine';
  const showDate = booking.date || 'Hoy';
  const showTime = booking.time || '--:--';
  const roomType = booking.roomType || '2D Regular';
  const languageLabel = movie?.language === 'ES' ? 'Doblada' : movie?.language ? 'Subtitulada' : '';
  const durationLabel = movie?.duration ? `${movie.duration} min` : '';

  // Mock occupied seats
  const occupied = new Set(['B4', 'B5', 'F6', 'F7', 'F8', 'J10']);
  const COLS = 10;
  const ROWS = 8;

  const toggleSeatSelect = (seatName) => {
    if (occupied.has(seatName)) return;
    setSelectedSeats(p => p.includes(seatName) ? p.filter(x => x !== seatName) : [...p, seatName]);
  };

  const total = selectedSeats.length * SEAT_PRICE;

  // --- Validación del formulario de pago ---
  const [cardName, setCardName] = useState('');
  const [cardNumber, setCardNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [touched, setTouched] = useState({});

  const errors = useMemo(() => {
    const e = {};
    if (!cardName.trim()) e.cardName = 'Ingresa el nombre del titular.';

    const digits = cardNumber.replace(/\s/g, '');
    if (!/^\d{16}$/.test(digits)) e.cardNumber = 'Ingresa los 16 dígitos de la tarjeta.';

    const expMatch = /^(\d{2})\/(\d{2})$/.exec(expiry);
    if (!expMatch) {
      e.expiry = 'Usa el formato MM/YY.';
    } else {
      const mm = parseInt(expMatch[1], 10);
      const yy = parseInt(expMatch[2], 10);
      if (mm < 1 || mm > 12) {
        e.expiry = 'El mes debe estar entre 01 y 12.';
      } else {
        const now = new Date();
        const currentYY = now.getFullYear() % 100;
        const currentMM = now.getMonth() + 1;
        if (yy < currentYY || (yy === currentYY && mm < currentMM)) {
          e.expiry = 'La tarjeta está vencida.';
        }
      }
    }

    if (!/^\d{3,4}$/.test(cvv)) e.cvv = 'El CVV debe tener 3 o 4 dígitos.';

    return e;
  }, [cardName, cardNumber, expiry, cvv]);

  const isPaymentValid = Object.keys(errors).length === 0;
  const markTouched = (field) => setTouched(t => ({ ...t, [field]: true }));

  const handleCardNumberChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
    setCardNumber(raw.replace(/(.{4})(?=.)/g, '$1 '));
  };

  const handleExpiryChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    setExpiry(raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw);
  };

  const handleCvvChange = (e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4));

  const handlePayment = () => {
    if (!isPaymentValid) return;
    setShowSuccessModal(true);
  };

  const currentStep = showSuccessModal ? 3 : step;

  return (
    <div className="web-booking-layout">

      {showSuccessModal && (
        <div className="booking-success-overlay">
          <div className="booking-success-modal">
            <div className="success-icon-circle">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h2>¡Compra Exitosa!</h2>
            <p>Tus boletos han sido enviados a tu correo electrónico. Disfruta de la función.</p>
            <button className="btn-solid" onClick={() => navigate('/WebHome')} style={{ width: '100%' }}>
              Volver al Inicio
            </button>
          </div>
        </div>
      )}

      <div className="booking-main">
        <nav className="booking-steps" aria-label="Progreso de la compra">
          {STEPS.map((label, idx) => {
            const n = idx + 1;
            const state = n < currentStep ? 'done' : n === currentStep ? 'current' : 'upcoming';
            return (
              <div className="booking-step-wrap" key={label}>
                {idx > 0 && <span className="step-arrow" aria-hidden="true">→</span>}
                <div className={`booking-step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                  <span className="step-num">{state === 'done' ? '✓' : n}</span>
                  <span className="step-label">{label}</span>
                </div>
              </div>
            );
          })}
        </nav>

        {step === 1 ? (
          <div className="seats-selection">
            <div className="screen-indicator">
              <div className="screen-bar" />
              <p className="screen-label">Pantalla</p>
            </div>

            <div className="seats-map-scroll">
              <div className="seats-map">
                {Array.from({ length: ROWS }).map((_, r) =>
                  Array.from({ length: COLS }).map((_, c) => {
                    const rowLetter = String.fromCharCode(65 + r);
                    const seatName = `${rowLetter}${c + 1}`;
                    const isOccupied = occupied.has(seatName);
                    const isSelected = selectedSeats.includes(seatName);
                    const seatState = isOccupied ? 'occupied' : isSelected ? 'selected' : 'available';
                    const seatStateLabel = seatState === 'occupied' ? 'ocupada' : seatState === 'selected' ? 'seleccionada' : 'disponible';

                    return (
                      <button
                        key={seatName}
                        type="button"
                        className={`seat-btn seat-${seatState}`}
                        disabled={isOccupied}
                        aria-pressed={isSelected}
                        aria-label={`Butaca ${seatName}, ${seatStateLabel}`}
                        onClick={() => toggleSeatSelect(seatName)}
                      >
                        {seatName}
                        {seatState === 'selected' && <span className="seat-icon" aria-hidden="true">✓</span>}
                        {seatState === 'occupied' && <span className="seat-icon" aria-hidden="true">✕</span>}
                      </button>
                    );
                  })
                )}
              </div>
            </div>

            <ul className="seats-legend">
              <li><span className="legend-swatch legend-available" aria-hidden="true"></span>Disponible</li>
              <li><span className="legend-swatch legend-selected" aria-hidden="true">✓</span>Seleccionada</li>
              <li><span className="legend-swatch legend-occupied" aria-hidden="true">✕</span>Ocupada</li>
            </ul>

            <div className="booking-actions booking-actions-center">
              <button className="btn-solid" disabled={selectedSeats.length === 0} onClick={() => setStep(2)}>
                Continuar ⟩
              </button>
            </div>
          </div>
        ) : (
          <div className="payment-section">
            <h3 className="payment-title">Pago Seguro</h3>
            <form className="payment-form" onSubmit={(e) => e.preventDefault()}>
              <div className="form-field">
                <label htmlFor="pay-method" className="form-label-web">Método de pago</label>
                <select id="pay-method" className="input-web">
                  <option>Tarjeta de Crédito / Débito</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="pay-name" className="form-label-web">Nombre del Titular</label>
                <input
                  id="pay-name"
                  type="text"
                  className="input-web"
                  placeholder="Como aparece en la tarjeta"
                  value={cardName}
                  onChange={(e) => setCardName(e.target.value)}
                  onBlur={() => markTouched('cardName')}
                  aria-invalid={Boolean(touched.cardName && errors.cardName)}
                  aria-describedby={errors.cardName ? 'error-pay-name' : undefined}
                />
                {touched.cardName && errors.cardName && <FieldError id="error-pay-name" message={errors.cardName} />}
              </div>

              <div className="form-field">
                <label htmlFor="pay-card" className="form-label-web">Número de Tarjeta</label>
                <input
                  id="pay-card"
                  type="text"
                  inputMode="numeric"
                  autoComplete="cc-number"
                  className="input-web"
                  placeholder="#### #### #### ####"
                  maxLength={19}
                  value={cardNumber}
                  onChange={handleCardNumberChange}
                  onBlur={() => markTouched('cardNumber')}
                  aria-invalid={Boolean(touched.cardNumber && errors.cardNumber)}
                  aria-describedby={errors.cardNumber ? 'error-pay-card' : undefined}
                />
                {touched.cardNumber && errors.cardNumber && <FieldError id="error-pay-card" message={errors.cardNumber} />}
              </div>

              <div className="payment-row">
                <div className="form-field">
                  <label htmlFor="pay-exp" className="form-label-web">Vencimiento</label>
                  <input
                    id="pay-exp"
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-exp"
                    className="input-web"
                    placeholder="MM/YY"
                    maxLength={5}
                    value={expiry}
                    onChange={handleExpiryChange}
                    onBlur={() => markTouched('expiry')}
                    aria-invalid={Boolean(touched.expiry && errors.expiry)}
                    aria-describedby={errors.expiry ? 'error-pay-exp' : undefined}
                  />
                  {touched.expiry && errors.expiry && <FieldError id="error-pay-exp" message={errors.expiry} />}
                </div>
                <div className="form-field">
                  <label htmlFor="pay-cvv" className="form-label-web">CVV</label>
                  <input
                    id="pay-cvv"
                    type="text"
                    inputMode="numeric"
                    autoComplete="cc-csc"
                    className="input-web"
                    placeholder="123"
                    maxLength={4}
                    value={cvv}
                    onChange={handleCvvChange}
                    onBlur={() => markTouched('cvv')}
                    aria-invalid={Boolean(touched.cvv && errors.cvv)}
                    aria-describedby={errors.cvv ? 'error-pay-cvv' : undefined}
                  />
                  {touched.cvv && errors.cvv && <FieldError id="error-pay-cvv" message={errors.cvv} />}
                </div>
              </div>
            </form>

            <div className="booking-actions booking-actions-split">
              <button className="btn-outline" onClick={() => setStep(1)}>⟨ Volver</button>
              <button className="btn-solid" disabled={!isPaymentValid} onClick={handlePayment}>
                Pagar S/ {total.toFixed(2)} ⟩
              </button>
            </div>
          </div>
        )}
      </div>

      <aside className="booking-sidebar">
        <div className="movie-summary-card">
          <div className="movie-img-placeholder">
            {movie?.poster
              ? <img src={movie.poster} alt={`Póster de ${movie.title}`} />
              : <span>Póster</span>}
          </div>
          <div className="movie-info-compact">
            <p className="info-strong">{roomType}</p>
            {languageLabel && <p>{languageLabel}</p>}
            {durationLabel && <p>{durationLabel}</p>}
          </div>
        </div>

        <h2 className="summary-movie-title">{movie?.title || 'Selecciona una función'}</h2>
        <p className="highlight-text">{cinemaName}</p>
        <p className="summary-meta">{showDate} - {showTime}</p>

        <div className="divider"></div>

        <h3 className="summary-subtitle">Resumen de Compra</h3>

        <div className="seats-selected-list">
          <p className="summary-label">Butacas Seleccionadas:</p>
          <div className="selected-seats-chips">
            {selectedSeats.length > 0
              ? selectedSeats.map(s => <span key={s} className="seat-chip">{s}</span>)
              : <span className="no-seats-text">Ninguna seleccionada</span>}
          </div>
        </div>

        <div className="divider"></div>

        {selectedSeats.length > 0 && (
          <p className="price-breakdown">
            {selectedSeats.length} {selectedSeats.length === 1 ? 'butaca' : 'butacas'} × S/ {SEAT_PRICE.toFixed(2)} = S/ {total.toFixed(2)}
          </p>
        )}

        <div className="total-row">
          <p className="total-label">Total a Pagar:</p>
          <p className="price">S/ {total.toFixed(2)}</p>
        </div>
      </aside>

    </div>
  );
}
