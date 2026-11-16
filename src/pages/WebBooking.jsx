import { useState, useMemo, useRef, useEffect, useCallback } from 'react';
import { useNavigate, useParams, Navigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { ordersApi } from '../api/orders';
import FieldError from '../components/FieldError';
import StepIndicator from '../components/StepIndicator';
import SeatMap from '../components/SeatMap';
import { handlePosterError } from '../utils/posterFallback';
import { formatDateLong } from '../data/dateHelpers';
import { compareSeats } from '../shared/seatLayout';
import { PRESALE_MAX_TICKETS } from '../shared/presale';
import './WebPages.css';

const SEL_KEY = (id) => `cinerama-sel-${id}`;
const POLL_MS = 20000;
const money = (n) => `S/ ${Number(n).toFixed(2)}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const newKey = () => (crypto.randomUUID ? crypto.randomUUID() : `k${Date.now()}${Math.random().toString(36).slice(2)}`);

const readStored = (id) => { try { const v = JSON.parse(sessionStorage.getItem(SEL_KEY(id)) || '[]'); return Array.isArray(v) ? v.filter((s) => typeof s === 'string') : []; } catch { return []; } };
const writeStored = (id, seats) => { try { if (seats.length) sessionStorage.setItem(SEL_KEY(id), JSON.stringify(seats)); else sessionStorage.removeItem(SEL_KEY(id)); } catch { /* sin almacenamiento */ } };

const REASONS = {
  not_on_sale: 'Esta función ya no está a la venta.',
  closed: 'La venta de esta función ya cerró: la función ya empezó o terminó.',
  sold_out: 'Esta función está agotada.',
};

// Puerta de la compra: exige una cuenta de cliente. Sin sesión se envía al inicio de sesión y se vuelve al mismo mapa.
export default function WebBooking() {
  const { screeningId } = useParams();
  const { user, loading } = useAuth();
  if (!/^\d+$/.test(screeningId ?? '')) return <Navigate to="/web/peliculas" replace state={{ notice: 'Esa función no existe. Elige una de la cartelera.' }} />;
  if (loading) return <div className="catalog-state" role="status"><p>Verificando sesión…</p></div>;
  if (!user) {
    return <Navigate to={`/web/login?next=${encodeURIComponent(`/web/compra/${screeningId}`)}`} replace state={{ reason: 'login_required' }} />;
  }
  if (user.tier !== 'customer') {
    return (
      <div className="web-booking-layout">
        <div className="booking-main">
          <h2 className="booking-step-title">Las cuentas del personal no compran en el sitio</h2>
          <p className="booking-note">Entraste con una cuenta del personal. Las ventas en mostrador se hacen desde Taquilla en el panel; para comprar en el sitio usa una cuenta de cliente.</p>
          <div className="booking-actions"><Link className="btn-outline" to="/web/peliculas">Volver a la cartelera</Link></div>
        </div>
      </div>
    );
  }
  return <BookingFlow key={screeningId} screeningId={Number(screeningId)} />;
}

function BookingFlow({ screeningId }) {
  const navigate = useNavigate();
  const { refresh: refreshSession } = useAuth();
  const [load, setLoad] = useState({ status: 'loading', data: null }); // loading | ok | error | notfound
  const [step, setStep] = useState(1); // 1 = Butacas, 2 = Pago
  const [selected, setSelected] = useState([]);
  const [order, setOrder] = useState(null);
  const [confirmAction, setConfirmAction] = useState(null); // null | 'cancel' | 'change'
  const [processing, setProcessing] = useState(false);
  const [showCvvHelp, setShowCvvHelp] = useState(false);
  const [alertMsg, setAlertMsg] = useState(null); // { text, kind } mostrado con role=alert
  const [live, setLive] = useState('');
  const [outcome, setOutcome] = useState('approved');
  const [pickCount, setPickCount] = useState(2);

  const headingRef = useRef(null);
  const alertRef = useRef(null);
  const loadRef = useRef(null);
  const seatMapRef = useRef(null);
  const [lastSeat, setLastSeat] = useState('A1'); // la butaca con foco sobrevive al paso de pago (el mapa se desmonta)
  const selectedRef = useRef([]);
  const attemptRef = useRef({ sig: '', key: null });

  // Cambia la selección y la deja disponible de inmediato para el siguiente evento (sin esperar al render).
  const setSel = useCallback((next) => { selectedRef.current = next; setSelected(next); }, []);
  const data = load.data;
  const screening = data?.screening;
  const layout = data?.layout;
  const taken = useMemo(() => new Set(data?.taken ?? []), [data]);
  const limits = data?.limits;
  const maxSel = Math.max(0, Math.min(limits?.remaining ?? 0, limits?.perOrder ?? 8));
  const price = screening?.price ?? 0;
  const total = selected.length * price;
  const onSale = !!screening?.onSale;

  // ── carga y refresco del mapa ──
  const fetchMap = useCallback(async () => {
    const res = await ordersApi.seats(screeningId);
    if (res.status === 404) return { status: 'notfound' };
    if (!res.ok) return { status: 'error' };
    return { status: 'ok', data: res.data };
  }, [screeningId]);

  const applyMap = useCallback((next, { announce } = {}) => {
    setLoad({ status: 'ok', data: next });
    const nowTaken = new Set(next.taken);
    const cur = selectedRef.current;
    const lost = cur.filter((s) => nowTaken.has(s));
    if (lost.length) {
      const keep = cur.filter((s) => !nowTaken.has(s));
      setSel(keep);
      writeStored(screeningId, keep);
      const txt = `${lost.length === 1 ? `La butaca ${lost[0]} ya no está disponible` : `Las butacas ${lost.join(', ')} ya no están disponibles`}: ${lost.length === 1 ? 'otra persona la compró' : 'otra persona las compró'}. ${lost.length === 1 ? 'La quitamos' : 'Las quitamos'} de tu selección${keep.length ? '' : '. Elige otra'}. Tus datos de pago se conservan.`;
      setLive('');
      setAlertMsg({ text: txt, kind: 'taken' });
      return { lost };
    }
    if (announce) setLive(announce);
    return { lost: [] };
  }, [screeningId, setSel]);

  // Primera carga (y reintento): deja el mapa y recupera la selección guardada (p. ej. tras volver de iniciar sesión),
  // solo las butacas aún libres y dentro del tope.
  const onLoaded = useCallback((r) => {
    if (r.status !== 'ok') { setLoad({ status: r.status, data: null }); return; }
    setLoad({ status: 'ok', data: r.data });
    const free = readStored(screeningId).filter((s) => !r.data.taken.includes(s));
    const max = Math.min(r.data.limits.remaining, r.data.limits.perOrder);
    const back = [...new Set(free)].sort(compareSeats).slice(0, max);
    if (back.length && r.data.screening.onSale) {
      setSel(back);
      setLive(`Recuperamos tu selección anterior: ${back.join(', ')}.`);
    }
  }, [screeningId, setSel]);

  useEffect(() => {
    let off = false;
    fetchMap().then((r) => { if (!off) onLoaded(r); });
    return () => { off = true; };
  }, [fetchMap, onLoaded]);

  const retryLoad = () => { setLoad({ status: 'loading', data: null }); fetchMap().then(onLoaded); };

  // Al volver a la pestaña y cada 20 s en el paso de butacas: otro comprador pudo tomar butacas.
  useEffect(() => {
    if (load.status !== 'ok' || order) return undefined;
    const tick = async () => {
      if (document.visibilityState !== 'visible' || processing) return;
      const r = await fetchMap();
      if (r.status === 'ok') applyMap(r.data);
    };
    const id = step === 1 ? setInterval(tick, POLL_MS) : null;
    const onVis = () => { if (document.visibilityState === 'visible') tick(); };
    document.addEventListener('visibilitychange', onVis);
    return () => { if (id) clearInterval(id); document.removeEventListener('visibilitychange', onVis); };
  }, [load.status, step, order, processing, fetchMap, applyMap]);

  // Foco al encabezado al cambiar de paso y al terminar de cargar (no se mueve en el primer render sin datos).
  useEffect(() => {
    if (load.status === 'loading') return;
    if (load.status === 'error') { loadRef.current?.focus(); return; }
    headingRef.current?.focus();
  }, [step, load.status]);

  // Un aviso nuevo se enfoca para que quien usa teclado o lector lo encuentre.
  useEffect(() => { if (alertMsg) alertRef.current?.focus(); }, [alertMsg]);

  // ── selección ──
  const summary = (list) => (list.length
    ? `${plural(list.length, 'butaca seleccionada', 'butacas seleccionadas')}: ${list.join(', ')}. Total ${money(list.length * price)}.`
    : 'Ninguna butaca seleccionada.');

  const limitText = () => {
    if (limits?.presale && limits.presale.remaining <= limits.screening.remaining) {
      return `Máximo de preventa: ${PRESALE_MAX_TICKETS} entradas por cuenta y película`;
    }
    return `Máximo ${limits?.screening?.limit ?? 8} entradas por cuenta en esta función`;
  };

  const toggleSeat = (seat) => {
    if (taken.has(seat) || !onSale) return;
    setAlertMsg(null);
    const cur = selectedRef.current;
    if (cur.includes(seat)) {
      const next = cur.filter((s) => s !== seat);
      setSel(next); writeStored(screeningId, next); setLive(summary(next));
      return;
    }
    if (cur.length >= maxSel) {
      setLive(maxSel === 0
        ? `No puedes comprar más entradas para esta función: ${limitText().toLowerCase()}.`
        : `Llegaste al máximo: solo puedes elegir ${plural(maxSel, 'butaca', 'butacas')} (${limitText().toLowerCase()}). Quita una para elegir otra.`);
      return;
    }
    const next = [...cur, seat].sort(compareSeats);
    setSel(next); writeStored(screeningId, next); setLive(summary(next));
  };

  // Elegir N butacas juntas: el mejor bloque libre de una misma fila (filas del centro-atrás, centrado).
  const autoPick = () => {
    if (!layout) return;
    const n = Math.min(Number(pickCount) || 1, maxSel);
    if (n < 1) return;
    const target = (layout.rows.length - 1) * 0.6;
    let best = null;
    layout.rows.forEach((row, r) => {
      for (let start = 1; start + n - 1 <= row.seats; start++) {
        const ids = Array.from({ length: n }, (_, i) => `${row.label}${start + i}`);
        if (ids.some((id) => taken.has(id))) continue;
        const score = Math.abs(r - target) * 3 + Math.abs((start + (n - 1) / 2) - (layout.cols + 1) / 2);
        if (!best || score < best.score) best = { score, ids };
      }
    });
    setAlertMsg(null);
    if (!best) { setLive(`No hay ${plural(n, 'butaca', 'butacas')} juntas disponibles. Elige las butacas una por una.`); return; }
    setSel(best.ids); writeStored(screeningId, best.ids);
    setLive(`Elegimos ${plural(n, 'butaca', 'butacas')} juntas: ${best.ids.join(', ')}. Total ${money(n * price)}.`);
    seatMapRef.current?.focusSeat(best.ids[0]);
  };

  // ── formulario de pago simulado (nada de esto sale del navegador) ──
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
        if (yy < currentYY || (yy === currentYY && mm < currentMM)) e.expiry = 'La tarjeta está vencida.';
      }
    }
    if (!/^\d{3,4}$/.test(cvv)) e.cvv = 'El CVV debe tener 3 o 4 dígitos.';
    return e;
  }, [cardName, cardNumber, expiry, cvv]);

  const isPaymentValid = Object.keys(errors).length === 0;
  const markTouched = (field) => setTouched((t) => ({ ...t, [field]: true }));
  const handleCardNumberChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 16);
    setCardNumber(raw.replace(/(.{4})(?=.)/g, '$1 '));
  };
  const handleExpiryChange = (e) => {
    const raw = e.target.value.replace(/\D/g, '').slice(0, 4);
    setExpiry(raw.length > 2 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw);
  };
  const handleCvvChange = (e) => setCvv(e.target.value.replace(/\D/g, '').slice(0, 4));

  // ── pasos ──
  const goContinue = async () => {
    setAlertMsg(null);
    const r = await fetchMap();
    if (r.status === 'ok') {
      const { lost } = applyMap(r.data);
      if (lost.length) return;            // se quitó alguna butaca: se queda en el mapa con el aviso
      if (!r.data.screening.onSale) { setAlertMsg({ text: REASONS[r.data.screening.reason] ?? REASONS.not_on_sale, kind: 'closed' }); return; }
    }
    setStep(2);
  };

  const failPurchase = (res) => {
    const d = res.data || {};
    const back = (text, kind = 'error') => { setAlertMsg({ text, kind }); setStep(kind === 'declined' ? 2 : 1); };
    switch (res.error) {
      case 'unauthenticated':
        // Sesión vencida: se guarda la selección (sin datos de tarjeta) y la puerta lleva al inicio de sesión y de vuelta aquí.
        writeStored(screeningId, selectedRef.current);
        refreshSession();
        return;
      case 'customer_only': return back('Esta cuenta no puede comprar en el sitio. Usa una cuenta de cliente.');
      case 'not_found': return back('Esta función ya no está disponible.');
      case 'not_on_sale': case 'sold_out':
        ordersApi.seats(screeningId).then((r) => { if (r.ok) applyMap(r.data); });
        return back(d.error === 'sold_out' ? REASONS.sold_out : 'Esta función ya no está a la venta (empezó, terminó o se canceló).');
      case 'seats_taken': {
        ordersApi.seats(screeningId).then((r) => {
          if (r.ok) applyMap(r.data); else back('Algunas butacas ya no están disponibles. Revisa el mapa.');
          setStep(1);
        });
        return undefined;
      }
      case 'limit_exceeded':
        ordersApi.seats(screeningId).then((r) => { if (r.ok) applyMap(r.data); });
        return back(d.scope === 'presale_movie'
          ? `Superas el máximo de preventa: ${PRESALE_MAX_TICKETS} entradas por cuenta y película. Ya compraste ${d.bought}; puedes comprar ${d.remaining} más.`
          : `Superas el máximo de ${d.limit} entradas por cuenta en esta función. Ya compraste ${d.bought}; puedes comprar ${d.remaining} más.`);
      case 'payment_declined':
        attemptRef.current = { sig: '', key: null };
        return back('El pago simulado fue rechazado (elegiste "Rechazado" en el resultado de la simulación). No se te cobró nada ni se reservaron butacas. Cambia el resultado a "Aprobado" para reintentar.', 'declined');
      case 'too_many_attempts': return back(`Hiciste demasiados intentos. Espera ${Math.ceil((d.retryAfter || 60) / 60)} minuto(s) y vuelve a intentarlo.`);
      case 'network': return back('No pudimos conectar con el servidor. Revisa tu conexión y vuelve a intentarlo: no se duplicará la compra.', 'network');
      default: return back('No pudimos completar la compra. Inténtalo de nuevo.');
    }
  };

  const handlePayment = async () => {
    if (!isPaymentValid || processing || selected.length === 0) return;
    setAlertMsg(null);
    setProcessing(true);
    // Misma clave mientras no cambie la selección ni el resultado: un reintento tras un corte de red no duplica la orden.
    const sig = `${selected.join(',')}|${outcome}`;
    if (attemptRef.current.sig !== sig) attemptRef.current = { sig, key: newKey() };
    const res = await ordersApi.purchase({ screeningId, seats: selected, idempotencyKey: attemptRef.current.key, simulatedOutcome: outcome });
    setProcessing(false);
    if (res.ok) {
      writeStored(screeningId, []);
      setOrder(res.data.order);
      return;
    }
    if (res.error === 'payment_declined' && res.data?.order) failPurchase({ ...res, error: 'payment_declined' });
    else failPurchase(res);
  };

  const handleCancelPurchase = () => setConfirmAction('cancel');
  const handleChangeFunction = () => {
    if (selected.length === 0) navigate(-1);
    else setConfirmAction('change');
  };
  const runConfirmedAction = () => {
    if (confirmAction === 'cancel') navigate('/WebHome');
    else if (confirmAction === 'change') navigate(-1);
    setConfirmAction(null);
  };

  const currentStep = order ? 5 : step === 1 ? 3 : 4;
  const modalOpen = !!order || !!confirmAction;

  // ── estados sin mapa ──
  if (load.status === 'loading') {
    return <div className="catalog-state" role="status" tabIndex={-1}><span className="catalog-state-spinner" aria-hidden="true" /><p>Cargando butacas…</p></div>;
  }
  if (load.status === 'error') {
    return (
      <div className="catalog-state" role="alert" tabIndex={-1} ref={loadRef}>
        <h2>No pudimos cargar las butacas</h2>
        <p>Revisa tu conexión o inténtalo de nuevo en unos segundos.</p>
        <button type="button" className="catalog-state-retry" onClick={retryLoad}>Reintentar</button>
      </div>
    );
  }
  if (load.status === 'notfound') {
    return (
      <div className="catalog-state" role="alert">
        <h2>Esta función no está disponible</h2>
        <p>Puede haberse cancelado o ya no existir.</p>
        <Link className="btn-outline" to="/web/peliculas">Ver la cartelera</Link>
      </div>
    );
  }

  const movie = screening.movie;
  const roomType = `${screening.format} ${screening.language === 'ES' ? 'Doblada' : 'Subtitulada'}`;
  const bought = limits.screening.bought;
  const showPresale = !!limits.presale;
  const lead = (b) => (b > 0 ? `Ya compraste ${b}; puedes` : 'Puedes');
  const remainingText = showPresale && limits.presale.remaining <= limits.screening.remaining
    ? `Preventa: máximo ${PRESALE_MAX_TICKETS} entradas por cuenta y película. ${lead(limits.presale.bought)} comprar hasta ${limits.presale.remaining} más.`
    : `Máximo ${limits.screening.limit} entradas por cuenta en esta función. ${lead(bought)} comprar hasta ${limits.screening.remaining} más.`;

  return (
    <div className="web-booking-layout">
      {order && <SuccessDialog order={order} onHome={() => navigate('/WebHome')} />}

      {confirmAction && (
        <div className="booking-success-overlay">
          <div className="booking-success-modal" role="alertdialog" aria-modal="true" aria-labelledby="confirm-title" aria-describedby="confirm-desc">
            <h2 id="confirm-title">{confirmAction === 'cancel' ? '¿Cancelar tu compra?' : '¿Cambiar de función?'}</h2>
            <p id="confirm-desc">
              {confirmAction === 'cancel'
                ? `Perderás la selección de butacas${step === 2 ? ' y los datos de pago ingresados' : ''}. Esta acción no se puede deshacer.`
                : 'Perderás la selección de butacas actual. Podrás elegir otro horario.'}
            </p>
            <div className="booking-actions booking-actions-split" style={{ marginTop: '8px' }}>
              <button className="btn-outline" onClick={() => setConfirmAction(null)} autoFocus>
                {confirmAction === 'cancel' ? 'Seguir comprando' : 'Seguir aquí'}
              </button>
              <button className="btn-solid" onClick={runConfirmedAction}>
                {confirmAction === 'cancel' ? 'Sí, cancelar' : 'Sí, cambiar'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="booking-main" inert={modalOpen ? true : undefined}>
        <div className="booking-header-row">
          <StepIndicator current={currentStep} />
          <button type="button" className="btn-cancel-purchase" onClick={handleCancelPurchase}>
            Cancelar compra
          </button>
        </div>

        {/* Región viva única: resumen de la selección y avisos de la compra (solo para lector de pantalla). */}
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{live}</p>

        {alertMsg && (
          <div className={`booking-alert booking-alert-${alertMsg.kind}`} role="alert" tabIndex={-1} ref={alertRef}>
            <p>{alertMsg.text}</p>
          </div>
        )}

        {!onSale ? (
          <div className="seats-selection">
            <h2 className="booking-step-title" tabIndex={-1} ref={headingRef}>Esta función no se puede comprar</h2>
            <p className="booking-note">{REASONS[screening.reason] ?? REASONS.not_on_sale}</p>
            <div className="booking-actions"><Link className="btn-outline" to="/web/peliculas">Ver otras funciones</Link></div>
          </div>
        ) : step === 1 ? (
          <div className="seats-selection">
            <h2 className="booking-step-title" tabIndex={-1} ref={headingRef}>Elige tus butacas</h2>
            <p className="booking-note" role="note" id="limit-note">{remainingText}</p>

            {maxSel > 0 && (
              <div className="booking-autopick">
                <label htmlFor="pick-count" className="form-label-web">Cantidad de butacas</label>
                <select id="pick-count" className="input-web" value={Math.min(Number(pickCount), maxSel)} onChange={(e) => setPickCount(e.target.value)}>
                  {Array.from({ length: maxSel }, (_, i) => <option key={i + 1} value={i + 1}>{i + 1}</option>)}
                </select>
                <button type="button" className="btn-outline" onClick={autoPick}>{Math.min(Number(pickCount), maxSel) === 1 ? 'Elegir 1 butaca automáticamente' : `Elegir ${Math.min(Number(pickCount), maxSel)} butacas juntas automáticamente`}</button>
              </div>
            )}

            <SeatMap ref={seatMapRef} initialFocus={lastSeat} onFocusChange={setLastSeat} layout={layout} taken={taken} selected={selected} onToggle={toggleSeat} describedBy="limit-note" />

            <div className="booking-actions booking-actions-split">
              <button className="btn-outline" onClick={handleChangeFunction}>⟨ Cambiar función</button>
              <button className="btn-solid" disabled={selected.length === 0} onClick={goContinue}>
                Continuar ⟩
              </button>
            </div>
          </div>
        ) : (
          <div className="payment-section">
            <h2 className="booking-step-title" tabIndex={-1} ref={headingRef}>Pago simulado</h2>
            <p className="sim-notice" role="note">
              <strong>Esto es una simulación.</strong> No se cobra nada. No escribas los datos de tu tarjeta real: usa números inventados.
              Estos datos se quedan en tu navegador y no se envían a ningún sitio.
            </p>
            <form className="payment-form" onSubmit={(e) => e.preventDefault()} autoComplete="off">
              <div className="form-field">
                <label htmlFor="pay-method" className="form-label-web">Método de pago</label>
                <select id="pay-method" className="input-web">
                  <option>Tarjeta de crédito / débito (simulada)</option>
                </select>
              </div>

              <div className="form-field">
                <label htmlFor="pay-name" className="form-label-web">Nombre del titular (inventado)</label>
                <input
                  id="pay-name" type="text" className="input-web" autoComplete="off"
                  placeholder="Un nombre cualquiera" value={cardName}
                  onChange={(e) => setCardName(e.target.value)} onBlur={() => markTouched('cardName')}
                  aria-invalid={Boolean(touched.cardName && errors.cardName)} aria-describedby={errors.cardName ? 'error-pay-name' : undefined}
                />
                {touched.cardName && errors.cardName && <FieldError id="error-pay-name" message={errors.cardName} />}
              </div>

              <div className="form-field">
                <label htmlFor="pay-card" className="form-label-web">Número de tarjeta (inventado)</label>
                <input
                  id="pay-card" type="text" inputMode="numeric" autoComplete="off" className="input-web"
                  placeholder="#### #### #### ####" maxLength={19} value={cardNumber}
                  onChange={handleCardNumberChange} onBlur={() => markTouched('cardNumber')}
                  aria-invalid={Boolean(touched.cardNumber && errors.cardNumber)} aria-describedby={errors.cardNumber ? 'error-pay-card' : undefined}
                />
                {touched.cardNumber && errors.cardNumber && <FieldError id="error-pay-card" message={errors.cardNumber} />}
              </div>

              <div className="payment-row">
                <div className="form-field">
                  <label htmlFor="pay-exp" className="form-label-web">Vencimiento</label>
                  <input
                    id="pay-exp" type="text" inputMode="numeric" autoComplete="off" className="input-web"
                    placeholder="MM/YY" maxLength={5} value={expiry}
                    onChange={handleExpiryChange} onBlur={() => markTouched('expiry')}
                    aria-invalid={Boolean(touched.expiry && errors.expiry)} aria-describedby={errors.expiry ? 'error-pay-exp' : undefined}
                  />
                  {touched.expiry && errors.expiry && <FieldError id="error-pay-exp" message={errors.expiry} />}
                </div>
                <div className="form-field">
                  <label htmlFor="pay-cvv" className="form-label-web">
                    CVV
                    <button
                      type="button" className="cvv-help-btn" aria-expanded={showCvvHelp} aria-controls="cvv-help-text"
                      aria-label="Ayuda: ¿dónde está el CVV?" onClick={() => setShowCvvHelp((v) => !v)}
                    >?</button>
                  </label>
                  <input
                    id="pay-cvv" type="text" inputMode="numeric" autoComplete="off" className="input-web"
                    placeholder="123" maxLength={4} value={cvv}
                    onChange={handleCvvChange} onBlur={() => markTouched('cvv')}
                    aria-invalid={Boolean(touched.cvv && errors.cvv)}
                    aria-describedby={[errors.cvv ? 'error-pay-cvv' : null, showCvvHelp ? 'cvv-help-text' : null].filter(Boolean).join(' ') || undefined}
                  />
                  {showCvvHelp && (
                    <p id="cvv-help-text" className="cvv-help-text" role="note">
                      En una tarjeta real son los 3 números al reverso (4 en American Express, al frente). Aquí escribe 3 dígitos inventados.
                    </p>
                  )}
                  {touched.cvv && errors.cvv && <FieldError id="error-pay-cvv" message={errors.cvv} />}
                </div>
              </div>

              <fieldset className="sim-outcome">
                <legend>Resultado de la simulación</legend>
                <label><input type="radio" name="sim-outcome" value="approved" checked={outcome === 'approved'} onChange={() => setOutcome('approved')} /> Aprobado</label>
                <label><input type="radio" name="sim-outcome" value="declined" checked={outcome === 'declined'} onChange={() => setOutcome('declined')} /> Rechazado</label>
                <p className="booking-note">Sirve para probar qué pasa cuando el pago falla: con &quot;Rechazado&quot; la orden queda rechazada y no se reservan butacas.</p>
              </fieldset>
            </form>

            <div className="booking-actions booking-actions-split">
              <button className="btn-outline" onClick={() => setStep(1)} disabled={processing}>⟨ Volver</button>
              <button className="btn-solid" disabled={!isPaymentValid || processing} onClick={handlePayment}>
                {processing ? 'Procesando...' : `Confirmar compra simulada ${money(total)} ⟩`}
              </button>
            </div>
            <p className="payment-processing-status" role="status">
              {processing ? 'Procesando tu compra simulada, por favor espera.' : ''}
            </p>
          </div>
        )}
      </div>

      <aside className="booking-sidebar" inert={modalOpen ? true : undefined}>
        <div className="movie-summary-card">
          <div className="movie-img-placeholder">
            {movie.poster
              ? <img src={movie.poster} alt={`Póster de ${movie.title}`} data-fallback-title={movie.title} onError={handlePosterError} />
              : <span>Póster</span>}
          </div>
          <div className="movie-info-compact">
            <p className="info-strong">{roomType}</p>
            {movie.duration ? <p>{movie.duration} min</p> : null}
            {screening.hall?.name ? <p>{screening.hall.name}</p> : null}
          </div>
        </div>

        <h2 className="summary-movie-title">{movie.title}</h2>
        <p className="highlight-text">{screening.branch.name}</p>
        <p className="summary-meta">{formatDateLong(screening.date)} - {screening.startTime}</p>

        <div className="divider"></div>

        <h3 className="summary-subtitle">Resumen de compra</h3>

        <div className="seats-selected-list">
          <p className="summary-label">Butacas seleccionadas:</p>
          <div className="selected-seats-chips">
            {selected.length > 0
              ? selected.map((s) => <span key={s} className="seat-chip">{s}</span>)
              : <span className="no-seats-text">Ninguna seleccionada</span>}
          </div>
        </div>

        <div className="divider"></div>

        {selected.length > 0 && (
          <p className="price-breakdown">
            {selected.length} {selected.length === 1 ? 'butaca' : 'butacas'} × {money(price)} = {money(total)}
          </p>
        )}

        <div className="total-row">
          <p className="total-label">Total a pagar:</p>
          <p className="price">{money(total)}</p>
        </div>
        <p className="booking-note booking-sim-flag">Compra simulada: no se cobra nada.</p>
      </aside>
    </div>
  );
}

// Confirmación: diálogo modal con foco en el título, trampa de foco y el código de la orden copiable.
function SuccessDialog({ order, onHome }) {
  const dialogRef = useRef(null);
  const titleRef = useRef(null);
  const [copied, setCopied] = useState('');

  useEffect(() => { titleRef.current?.focus(); }, []);

  const trap = (e) => {
    if (e.key !== 'Tab') return;
    const items = [...dialogRef.current.querySelectorAll('button, [href], [tabindex]:not([tabindex="-1"])')].filter((el) => !el.disabled);
    if (!items.length) return;
    const first = items[0]; const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(order.code);
      setCopied('Código copiado.');
    } catch {
      // Sin permiso de portapapeles: se selecciona el texto para copiarlo a mano.
      const node = document.getElementById('order-code');
      const range = document.createRange(); range.selectNodeContents(node);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      setCopied('Código seleccionado: pulsa Ctrl+C para copiarlo.');
    }
  };

  const s = order.screening;
  return (
    <div className="booking-success-overlay">
      <div
        className="booking-success-modal booking-success-wide" role="dialog" aria-modal="true"
        aria-labelledby="success-title" aria-describedby="success-desc" ref={dialogRef} onKeyDown={trap}
      >
        <div className="success-icon-circle">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path>
            <polyline points="22 4 12 14.01 9 11.01"></polyline>
          </svg>
        </div>
        <h2 id="success-title" tabIndex={-1} ref={titleRef}>¡Compra simulada exitosa!</h2>
        <p id="success-desc">
          No se cobró nada y no enviamos ningún correo. Guarda este código: es el comprobante de tu compra. Podrás volver a verlo
          cuando quieras en «Mis entradas».
        </p>
        <p className="order-code-label">Código de tu orden</p>
        <p><code className="order-code" id="order-code">{order.code}</code></p>
        <button type="button" className="btn-outline" onClick={copy}>Copiar código</button>
        <p className="payment-processing-status booking-copy-status" role="status">{copied}</p>
        <dl className="order-summary">
          <div><dt>Película</dt><dd>{s.movieTitle}</dd></div>
          <div><dt>Cine</dt><dd>{s.branchName}</dd></div>
          <div><dt>Función</dt><dd>{formatDateLong(s.date)}, {s.startTime}</dd></div>
          <div><dt>Butacas</dt><dd>{order.seats.map((x) => x.seat).join(', ')}</dd></div>
          <div><dt>Total</dt><dd>{money(order.amount)} (simulado)</dd></div>
        </dl>
        <Link className="btn-solid booking-success-link" to="/web/mis-entradas">Ver mis entradas</Link>
        <button className="btn-outline" onClick={onHome} style={{ width: '100%', marginTop: '0.75rem' }}>
          Volver al inicio
        </button>
      </div>
    </div>
  );
}
