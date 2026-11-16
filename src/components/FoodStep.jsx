import ProductArt from './ProductArt';
import SizeCompare from './SizeCompare';
import { PICKUP_POINT_LABEL, PICKUP_TIMINGS, PICKUP_PREP_LEAD_MINUTES } from '../shared/purchase';
import { variantName, minusMinutes } from '../utils/foodCart';
import './FoodStep.css';

const money = (n) => `S/ ${Number(n).toFixed(2)}`;
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

// Paso opcional "Confitería" de la compra. Es solo presentación: el estado (carrito, menú, tiempos) vive en BookingFlow.
// Los botones de cantidad usan aria-disabled (no disabled) para no perder el foco al llegar al tope; el motivo se lee
// en el texto visible y en la región viva de la compra.
export default function FoodStep({
  menuState, cart, totals, timing, onTiming, startTime, onChangeQty, onSkip, onContinue, onBack, onRetry, headingRef,
}) {
  const menu = menuState.data;
  const limits = menu?.limits ?? { maxQty: 10, maxUnits: 20, maxLines: 12 };
  const capUnits = totals.units >= limits.maxUnits;
  const capLines = totals.count >= limits.maxLines;

  const groups = [];
  for (const p of menu?.products ?? []) {
    const last = groups[groups.length - 1];
    if (last && last.category === p.category) last.products.push(p);
    else groups.push({ category: p.category, label: p.categoryLabel, products: [p] });
  }

  return (
    <div className="food-step">
      <h2 className="booking-step-title" tabIndex={-1} ref={headingRef}>Confitería (opcional)</h2>
      <p className="booking-note">
        Suma algo para comer o tomar. Lo pagas junto con tus entradas y lo recoges en el {PICKUP_POINT_LABEL}.
        Si no quieres nada, puedes omitir este paso.
      </p>
      <div className="food-skip-top">
        <button type="button" className="btn-outline food-skip-btn" onClick={onSkip}>Omitir confitería</button>
      </div>

      {menuState.status === 'loading' && <p className="food-state" role="status">Cargando la carta de confitería…</p>}

      {menuState.status === 'error' && (
        <div className="food-state food-error" role="alert">
          <p>No pudimos cargar la carta de confitería. Tus entradas no se ven afectadas: puedes reintentar o continuar sin confitería.</p>
          <div className="food-error-actions">
            <button type="button" className="btn-outline" onClick={onRetry}>Reintentar</button>
            <button type="button" className="btn-solid" onClick={onSkip}>Continuar sin confitería</button>
          </div>
        </div>
      )}

      {menuState.status === 'ok' && (
        <>
          <p className="food-limits" id="food-limits">
            Máximo {limits.maxQty} por producto y tamaño, {limits.maxUnits} unidades y {plural(limits.maxLines, 'producto distinto', 'productos distintos')} por pedido.
            {' '}Llevas {plural(totals.units, 'unidad', 'unidades')} de {limits.maxUnits}.
            {capUnits && <strong className="food-cap-note"> Llegaste al tope de unidades: quita alguna para sumar otra.</strong>}
            {!capUnits && capLines && <strong className="food-cap-note"> Llegaste al tope de productos distintos: quita uno para sumar otro.</strong>}
          </p>

          {groups.map((g) => (
            <section className="food-group" key={g.category} aria-labelledby={`food-cat-${g.category}`}>
              <h3 className="food-group-title" id={`food-cat-${g.category}`}>{g.label}</h3>
              {g.products.map((p) => (
                <article className="food-product" key={p.id} aria-labelledby={`food-p-${p.id}`}>
                  <div className="food-product-head">
                    <ProductArt artKey={p.artKey} className="food-art" />
                    <div className="food-product-text">
                      <h4 id={`food-p-${p.id}`}>{p.name}</h4>
                      {p.description && <p>{p.description}</p>}
                    </div>
                  </div>
                  <ul className="food-variants">
                    {p.variants.map((v) => {
                      const q = cart[v.id] ?? 0;
                      const fullName = variantName(p.name, v.label);
                      const capItem = q >= limits.maxQty;
                      const blockAdd = capItem || capUnits || (q === 0 && capLines);
                      const describedBy = blockAdd ? (capItem ? `food-cap-${v.id}` : 'food-limits') : undefined;
                      return (
                        <li className="food-variant" key={v.id}>
                          <div className="food-variant-info">
                            <p className="food-variant-name">
                              {v.label}
                              {v.volumeMl ? <span className="food-variant-vol"> · {v.volumeOz} oz ({v.volumeMl} ml)</span> : null}
                            </p>
                            {v.includes.length > 0 && (
                              <p className="food-includes">Incluye: {v.includes.map((c) => `${c.qty} × ${variantName(c.name, c.label)}`).join(', ')}</p>
                            )}
                            <p className="food-variant-meta">{v.servesText}</p>
                          </div>
                          <p className="food-price">{money(v.price)}</p>
                          {v.available ? (
                            <div className="food-qty" role="group" aria-label={`Cantidad de ${fullName}`}>
                              <button
                                type="button" className="food-qty-btn" aria-label={`Quitar una unidad de ${fullName}`}
                                aria-disabled={q === 0 ? 'true' : undefined} onClick={() => onChangeQty(v, p, -1)}
                              >−</button>
                              <span className="food-qty-value">{q}</span>
                              <button
                                type="button" className="food-qty-btn" aria-label={`Agregar una unidad de ${fullName}`}
                                aria-disabled={blockAdd ? 'true' : undefined} aria-describedby={describedBy} onClick={() => onChangeQty(v, p, 1)}
                              >+</button>
                            </div>
                          ) : (
                            <p className="food-soldout"><span aria-hidden="true">⊘ </span>Agotado<span className="sr-only">: {fullName} no se puede agregar</span></p>
                          )}
                          {capItem && <p className="food-cap-note food-cap-row" id={`food-cap-${v.id}`}>Máximo {limits.maxQty} de {fullName}.</p>}
                        </li>
                      );
                    })}
                  </ul>
                  <SizeCompare product={p} />
                </article>
              ))}
            </section>
          ))}

          {totals.count > 0 && (
            <fieldset className="food-pickup">
              <legend>¿Cuándo preparamos tu pedido?</legend>
              {Object.entries(PICKUP_TIMINGS).map(([id, label]) => (
                <label className="food-pickup-opt" key={id}>
                  <input type="radio" name="food-timing" value={id} checked={timing === id} onChange={() => onTiming(id)} aria-describedby={`food-timing-${id}`} />
                  <span>
                    <span className="food-pickup-label">{label}</span>
                    <span className="food-pickup-desc" id={`food-timing-${id}`}>
                      {id === 'on_arrival'
                        ? `El personal empieza a prepararlo cuando muestres tu código en el ${PICKUP_POINT_LABEL}.`
                        : `Empezamos a prepararlo ${PICKUP_PREP_LEAD_MINUTES} minutos antes de la función, a las ${minusMinutes(startTime, PICKUP_PREP_LEAD_MINUTES)}.`}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
          )}

          <p className="food-subtotal">
            {totals.count > 0
              ? <>Confitería: <strong>{money(totals.food)}</strong> ({plural(totals.units, 'unidad', 'unidades')})</>
              : 'Todavía no agregaste confitería.'}
          </p>
        </>
      )}

      <div className="food-actions">
        <button type="button" className="btn-outline" onClick={onBack}>⟨ Volver a butacas</button>
        <button type="button" className="btn-outline food-skip-btn" onClick={onSkip}>Omitir confitería</button>
        {totals.count > 0 && <button type="button" className="btn-solid" onClick={onContinue}>Continuar al pago ⟩</button>}
      </div>
    </div>
  );
}
