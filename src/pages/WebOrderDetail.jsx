import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { ordersApi } from '../api/orders';
import OrderCode from '../components/OrderCode';
import { OrderFacts, StatusBadge } from '../components/OrderParts';
import OrderFood from '../components/OrderFood';
import './WebOrders.css';

const NOTES = {
  valid: 'Muestra este código en la puerta del cine.',
  used: 'Esta entrada ya se usó para ingresar.',
  past: 'La función de esta entrada ya pasó.',
  refunded: 'Esta orden fue reembolsada (simulado). La entrada ya no sirve para entrar.',
  rejected: 'El pago fue rechazado: no se compró ninguna entrada ni se reservaron butacas.',
  cancelled: 'Esta orden fue cancelada.',
};

// Detalle de una entrada, pensado para mostrarse desde el telefono en la puerta (y para imprimir).
export default function WebOrderDetail() {
  const { code } = useParams();
  const [state, setState] = useState({ status: 'loading', order: null, retryAfter: 0 });
  const titleRef = useRef(null);

  useEffect(() => {
    let off = false;
    ordersApi.one(code).then((res) => {
      if (off) return;
      if (res.ok) setState({ status: 'ok', order: res.data.order, retryAfter: 0 });
      else if (res.status === 404) setState({ status: 'notfound', order: null, retryAfter: 0 });
      else if (res.status === 429) setState({ status: 'throttled', order: null, retryAfter: res.data.retryAfter ?? 0 });
      else setState({ status: 'error', order: null, retryAfter: 0 });
    });
    return () => { off = true; };
  }, [code]);
  useEffect(() => { document.title = 'Tu entrada · Cinerama'; }, []);

  // Estado del pedido de confitería: el cliente no recibe avisos, así que puede actualizarlo con un botón y, mientras el
  // pedido sigue abierto y la función es de hoy, se actualiza solo cada 30 s sin mover el foco.
  const [live, setLive] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const pickupStatus = useRef(null);
  const refresh = async (silent) => {
    if (!silent) setRefreshing(true);
    const res = await ordersApi.one(code);
    if (!silent) setRefreshing(false);
    if (!res.ok) { if (!silent) setLive('No pudimos actualizar el estado. Inténtalo de nuevo.'); return; }
    const next = res.data.order;
    setState((s) => (s.status === 'ok' ? { ...s, order: next } : s));
    const label = next.pickup?.statusLabel;
    if (!silent) setLive(`Estado del pedido: ${label ?? 'sin pedido'}.`);
    else if (label && pickupStatus.current && pickupStatus.current !== label) setLive(`El estado de tu pedido cambió: ${label}.`);
    pickupStatus.current = label ?? null;
  };
  const openStatus = state.order?.pickup?.status;
  const isOpen = ['ordered', 'preparing', 'ready'].includes(openStatus) && state.order?.displayStatus === 'valid';
  useEffect(() => {
    if (state.order) pickupStatus.current = state.order.pickup?.statusLabel ?? null;
    if (!isOpen) return undefined;
    const id = setInterval(() => { if (document.visibilityState === 'visible') refresh(true); }, 30000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, code, state.status]);
  useEffect(() => { if (state.status !== 'loading') titleRef.current?.focus(); }, [state.status]);

  const o = state.order;
  return (
    <main className="orders-page ticket-page">
      <p className="ticket-back"><Link to="/web/mis-entradas">← Mis entradas</Link></p>
      {state.status === 'loading' && <p className="orders-state" role="status">Cargando tu entrada…</p>}
      {state.status === 'notfound' && (
        <div className="orders-empty">
          <h2 className="orders-title" tabIndex={-1} ref={titleRef}>No encontramos esa entrada</h2>
          <p>El código no existe o no pertenece a tu cuenta.</p>
          <Link className="btn-solid orders-link-btn" to="/web/mis-entradas">Ir a mis entradas</Link>
        </div>
      )}
      {state.status === 'throttled' && (
        <div className="orders-empty" role="alert">
          <h2 className="orders-title" tabIndex={-1} ref={titleRef}>Demasiados intentos</h2>
          <p>Espera {Math.max(1, Math.ceil(state.retryAfter / 60))} minuto(s) antes de volver a consultar un código.</p>
        </div>
      )}
      {state.status === 'error' && (
        <div className="orders-state" role="alert">
          <h2 className="orders-title" tabIndex={-1} ref={titleRef}>No pudimos cargar la entrada</h2>
          <p>Revisa tu conexión e inténtalo de nuevo.</p>
          <button type="button" className="btn-outline" onClick={() => window.location.reload()}>Reintentar</button>
        </div>
      )}
      {o && (
        <article className="ticket" aria-labelledby="ticket-title">
          <h2 className="orders-title ticket-heading" tabIndex={-1} ref={titleRef}>Tu entrada</h2>
          <h3 className="ticket-movie" id="ticket-title">{o.screening.movieTitle}</h3>
          <p className="ticket-state"><StatusBadge order={o} /></p>
          <p className="ticket-note">{NOTES[o.displayStatus]}{o.refund?.reason ? ` Motivo: ${o.refund.reason}.` : ''}</p>
          <OrderCode code={o.code} large />
          <p className="ticket-seats-label" id="seats-label">Butacas</p>
          <ul className="ticket-seats" aria-labelledby="seats-label">
            {o.seats.map((x) => <li key={x.seat}>{x.seat}{x.checkedIn ? ' · ya ingresó' : ''}</li>)}
          </ul>
          <OrderFacts order={o} hideSeats />
          <OrderFood order={o} idPrefix="detail-food" />
          {o.pickup && (
            <div className="ticket-actions ticket-food-refresh">
              <button type="button" className="btn-outline" onClick={() => refresh(false)} aria-disabled={refreshing || undefined}>
                {refreshing ? 'Actualizando…' : 'Actualizar estado del pedido'}
              </button>
            </div>
          )}
          <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{live}</p>
          <p className="ticket-sim">Compra simulada: no se cobró nada y esta entrada no vale para entrar a una sala real.</p>
          <div className="ticket-actions">
            <button type="button" className="btn-outline" onClick={() => window.print()}>Imprimir entrada</button>
          </div>
        </article>
      )}
    </main>
  );
}
