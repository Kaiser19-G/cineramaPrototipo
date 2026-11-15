import { statusInfo, statusText, money } from '../shared/orderStatus';
import { formatDateLong } from '../data/dateHelpers';

export function OrderFacts({ order, hideSeats = false }) {
  const s = order.screening;
  return (
    <dl className="order-facts">
      <div><dt>Sede</dt><dd>{s.branchName}</dd></div>
      <div><dt>Sala</dt><dd>{s.hallName}</dd></div>
      <div><dt>Fecha y hora</dt><dd>{formatDateLong(s.date)}, {s.startTime}</dd></div>
      <div><dt>Formato e idioma</dt><dd>{s.format} · {s.language}</dd></div>
      {!hideSeats && <div><dt>Butacas</dt><dd>{order.seats.map((x) => x.seat).join(', ')}</dd></div>}
      <div><dt>Total</dt><dd>{money(order.amount)} (simulado)</dd></div>
    </dl>
  );
}

export function StatusBadge({ order }) {
  const { icon } = statusInfo(order);
  return (
    <span className={`order-status is-${order.displayStatus}`}>
      <span aria-hidden="true" className="order-status-icon">{icon}</span> {statusText(order)}
    </span>
  );
}
