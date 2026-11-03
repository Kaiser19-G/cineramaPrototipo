import { useState, useMemo, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import FieldError from '../components/FieldError';
import StepIndicator from '../components/StepIndicator';
import { handlePosterError } from '../utils/posterFallback';
import './WebPages.css';

const SEAT_PRICE = 15;

export default function WebBooking() {
  const [step, setStep] = useState(1); // 1 = Butacas, 2 = Pago
  const [selectedSeats, setSelectedSeats] = useState([]);
  const [showSuccessModal, setShowSuccessModal] = useState(false);
  const [showCancelConfirm, setShowCancelConfirm] = useState(false);
  const [isProcessingPayment, setIsProcessingPayment] = useState(false);
  const [showCvvHelp, setShowCvvHelp] = useState(false);
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

  // --- Navegación de butacas como grilla accesible (patrón ARIA grid) ---
  // Con 80 butacas, recorrerlas una por una con Tab es inviable (y si te
  // pasas, hay que rehacer todo el camino). Solo UNA butaca está en el
  // orden de tabulación a la vez (roving tabindex): Tab entra/sale de la
  // grilla en un solo paso; dentro, las flechas mueven el foco.
  const [focusedSeat, setFocusedSeat] = useState('A1');
  const seatRefs = useRef({});

  const handleSeatGridKeyDown = (e) => {
    // Lee la posición del elemento con foco REAL en el DOM (e.target), no del
    // estado de React: si las teclas llegan más rápido que un re-render,
    // el estado podría ir un paso atrás y la navegación saltaría mal.
    let r = parseInt(e.target.dataset.row, 10);
    let c = parseInt(e.target.dataset.col, 10);
    if (Number.isNaN(r) || Number.isNaN(c)) return;

    if (e.key === 'ArrowRight') c = Math.min(c + 1, COLS - 1);
    else if (e.key === 'ArrowLeft') c = Math.max(c - 1, 0);
    else if (e.key === 'ArrowDown') r = Math.min(r + 1, ROWS - 1);
    else if (e.key === 'ArrowUp') r = Math.max(r - 1, 0);
    else if (e.key === 'Home') c = 0;
    else if (e.key === 'End') c = COLS - 1;
    else return; // Enter/Espacio los maneja el <button> nativo; Tab sale de la grilla

    e.preventDefault();
    const newSeat = `${String.fromCharCode(65 + r)}${c + 1}`;
    setFocusedSeat(newSeat);
    seatRefs.current[newSeat]?.focus();
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

  // H-09: el pago no se confirma al instante — se muestra un estado de
  // "procesando" (con aria-live para quien usa lector de pantalla) antes
  // de pasar a la confirmación, para que la espera real no se perciba como
  // que el click no funcionó.
  const handlePayment = () => {
    if (!isPaymentValid || isProcessingPayment) return;
    setIsProcessingPayment(true);
    setTimeout(() => {
      setIsProcessingPayment(false);
      setShowSuccessModal(true);
    }, 1200);
  };

  // H-06: cancelar la compra descarta butacas y datos de pago ya
  // ingresados, así que se confirma antes de hacerlo en vez de perderlos
  // con un solo click accidental.
  const handleCancelPurchase = () => setShowCancelConfirm(true);
  const confirmCancelPurchase = () => navigate('/WebHome');

  // Pasos globales del flujo: 1 Película · 2 Función · 3 Butacas · 4 Pago · 5 Confirmación
  const currentStep = showSuccessModal ? 5 : step === 1 ? 3 : 4;

  return (
    <div className="web-booking-layout">

      {showSuccessModal && (
        <div className="booking-success-overlay">
          <div className="booking-success-modal" role="alertdialog" aria-labelledby="success-title" aria-describedby="success-desc">
            <div className="success-icon-circle">
              <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
                <polyline points="22 4 12 14.01 9 11.01"></polyline>
              </svg>
            </div>
            <h2 id="success-title">¡Compra Exitosa!</h2>
            <p id="success-desc">Tus boletos han sido enviados a tu correo electrónico. Disfruta de la función.</p>
            <button className="btn-solid" onClick={() => navigate('/WebHome')} style={{ width: '100%' }}>
              Volver al Inicio
            </button>
          </div>
        </div>
      )}

      {showCancelConfirm && (
        <div className="booking-success-overlay">
          <div className="booking-success-modal" role="alertdialog" aria-labelledby="cancel-title" aria-describedby="cancel-desc">
            <h2 id="cancel-title">¿Cancelar tu compra?</h2>
            <p id="cancel-desc">
              Perderás la selección de butacas{step === 2 ? ' y los datos de pago ingresados' : ''}. Esta acción no se puede deshacer.
            </p>
            <div className="booking-actions booking-actions-split" style={{ marginTop: '8px' }}>
              <button className="btn-outline" onClick={() => setShowCancelConfirm(false)} autoFocus>
                Seguir comprando
              </button>
              <button className="btn-solid" onClick={confirmCancelPurchase}>
                Sí, cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="booking-main">
        <div className="booking-header-row">
          <StepIndicator current={currentStep} />
          <button type="button" className="btn-cancel-purchase" onClick={handleCancelPurchase}>
            Cancelar compra
          </button>
        </div>

        {step === 1 ? (
          <div className="seats-selection">
            <div className="screen-indicator">
              <div className="screen-bar" />
              <p className="screen-label">Pantalla</p>
            </div>

            <div className="seats-map-scroll">
              <div
                className="seats-map"
                role="grid"
                aria-label="Mapa de butacas"
                onKeyDown={handleSeatGridKeyDown}
              >
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
                        ref={(el) => { seatRefs.current[seatName] = el; }}
                        type="button"
                        role="gridcell"
                        className={`seat-btn seat-${seatState}`}
                        tabIndex={seatName === focusedSeat ? 0 : -1}
                        data-row={r}
                        data-col={c}
                        aria-disabled={isOccupied || undefined}
                        aria-pressed={isSelected}
                        aria-rowindex={r + 1}
                        aria-colindex={c + 1}
                        aria-label={`Butaca ${seatName}, ${seatStateLabel}`}
                        onClick={() => toggleSeatSelect(seatName)}
                        onFocus={() => setFocusedSeat(seatName)}
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
                  <label htmlFor="pay-cvv" className="form-label-web">
                    CVV
                    <button
                      type="button"
                      className="cvv-help-btn"
                      aria-expanded={showCvvHelp}
                      aria-controls="cvv-help-text"
                      aria-label="Ayuda: ¿dónde encuentro mi CVV?"
                      onClick={() => setShowCvvHelp(v => !v)}
                    >?</button>
                  </label>
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
                    aria-describedby={[errors.cvv ? 'error-pay-cvv' : null, showCvvHelp ? 'cvv-help-text' : null].filter(Boolean).join(' ') || undefined}
                  />
                  {showCvvHelp && (
                    <p id="cvv-help-text" className="cvv-help-text" role="note">
                      Son los 3 números al reverso de tu tarjeta (4 en American Express, al frente).
                    </p>
                  )}
                  {touched.cvv && errors.cvv && <FieldError id="error-pay-cvv" message={errors.cvv} />}
                </div>
              </div>
            </form>

            <div className="booking-actions booking-actions-split">
              <button className="btn-outline" onClick={() => setStep(1)} disabled={isProcessingPayment}>⟨ Volver</button>
              <button className="btn-solid" disabled={!isPaymentValid || isProcessingPayment} onClick={handlePayment}>
                {isProcessingPayment ? 'Procesando...' : `Pagar S/ ${total.toFixed(2)} ⟩`}
              </button>
            </div>
            <p className="payment-processing-status" role="status">
              {isProcessingPayment ? 'Procesando tu pago, por favor espera.' : ''}
            </p>
            <p className="payment-support-link">
              ¿Problemas con tu pago? Escríbenos a <a href="mailto:soporte@cinerama.com.pe">soporte@cinerama.com.pe</a>
            </p>
          </div>
        )}
      </div>

      <aside className="booking-sidebar">
        <div className="movie-summary-card">
          <div className="movie-img-placeholder">
            {movie?.poster
              ? <img src={movie.poster} alt={`Póster de ${movie.title}`} data-fallback-title={movie.title} onError={handlePosterError} />
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
