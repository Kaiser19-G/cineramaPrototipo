import { money } from '../shared/orderStatus';
import { PICKUP_PREP_LEAD_MINUTES } from '../shared/purchase';
import { variantName, minusMinutes } from '../utils/foodCart';
import './FoodStep.css';

// Pedido de confitería de una orden (comprobante, Mis entradas y detalle). Muestra una FOTO del momento de la compra:
// los precios y nombres que el servidor guardó. Las órdenes sin confitería no pintan nada.
export default function OrderFood({ order, compact = false, idPrefix = 'food' }) {
  const items = order.items ?? [];
  if (!items.length) return null;
  const p = order.pickup;
  const units = items.reduce((a, i) => a + i.qty, 0);

  if (compact) {
    return (
      <p className="order-food-compact">
        Confitería: {units} {units === 1 ? 'unidad' : 'unidades'} ({money(order.foodAmount)})
        {p?.statusLabel ? ` · ${p.statusLabel}` : ''}
      </p>
    );
  }

  const start = order.screening?.startTime;
  const timingDetail = !p ? null
    : p.timing === 'at_showtime' && start
      ? `Empezamos a prepararlo ${PICKUP_PREP_LEAD_MINUTES} minutos antes de la función, a las ${minusMinutes(start, PICKUP_PREP_LEAD_MINUTES)}.`
      : p.timing === 'on_arrival' ? `El personal empieza a prepararlo cuando muestres tu código en el ${p.point}.` : null;
  const active = p && ['ordered', 'preparing', 'ready'].includes(p.status);
  const id = `${idPrefix}-title`;

  return (
    <section className="order-food" aria-labelledby={id}>
      <h3 id={id}>Tu pedido de confitería</h3>
      <ul className="order-food-lines">
        {items.map((i) => (
          <li key={`${i.variantId}`}>
            <span>
              {i.qty} × {variantName(i.name, i.variantLabel)}
              {i.includes ? <span className="order-food-includes">Incluye: {i.includes}</span> : null}
            </span>
            <span>{money(i.lineTotal)}</span>
          </li>
        ))}
      </ul>
      {p && (
        <dl className="order-food-facts">
          <div><dt>Punto de recojo</dt><dd>{p.point}</dd></div>
          <div><dt>Preparación</dt><dd>{p.timingLabel}</dd></div>
          {p.statusLabel && <div><dt>Estado del pedido</dt><dd>{p.statusLabel}</dd></div>}
        </dl>
      )}
      {p && timingDetail && active && <p>{timingDetail}</p>}
      {active && <p><strong>Se recoge con el mismo código de tu entrada:</strong> muéstralo en el {p.point}.</p>}
    </section>
  );
}
