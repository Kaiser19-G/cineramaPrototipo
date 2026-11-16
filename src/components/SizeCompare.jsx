import { useId, useRef, useState } from 'react';
import { layoutSizes, pricePer100ml, PHONE } from '../shared/sizeScale';
import './SizeCompare.css';

const money = (n) => `S/ ${Number(n).toFixed(2)}`;
const num = (n) => String(n).replace('.', ',');
const cm = (n) => (n ? `${num(n)} cm` : null);
const vol = (v) => (v.volumeMl ? `${v.volumeMl} ml (${v.volumeOz} oz)` : null);

// Comparador de tamaños de un producto: botón con aria-expanded que despliega, en línea (sin modal, sin trampa de foco),
// el dibujo a escala (una sola escala para todas las figuras y el celular de referencia) y una tabla con los mismos datos.
// El SVG es decorativo (aria-hidden): la información completa está en la leyenda y en la tabla. Sin menos de dos
// tamaños no se muestra nada; sin medidas completas en al menos dos, solo la tabla.
export default function SizeCompare({ product }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const panelId = useId();
  const sizes = product.variants;
  if (sizes.length < 2) return null;
  const layout = layoutSizes(sizes);
  const drawn = layout ? new Set(layout.figures.map((f) => f.id)) : new Set();
  const notDrawn = sizes.filter((v) => !drawn.has(v.id));
  const legend = layout
    ? layout.figures.map((f, i) => ({ n: i + 1, fig: f, v: f.kind === 'size' ? sizes.find((s) => s.id === f.id) : null }))
    : [];
  const tallest = layout ? sizes.filter((v) => drawn.has(v.id)).reduce((a, b) => (b.heightCm > a.heightCm ? b : a)) : null;

  const close = () => { setOpen(false); btnRef.current?.focus(); };
  const rows = [
    ['Precio', (v) => money(v.price)],
    ['Volumen', vol],
    ['Alto', (v) => cm(v.heightCm)],
    ['Diámetro superior', (v) => cm(v.topDiamCm)],
    ['Diámetro de la base', (v) => cm(v.bottomDiamCm)],
    ['Ideal para', (v) => `${v.serves} ${v.serves === 1 ? 'persona' : 'personas'}`],
    ['Precio por 100 ml', (v) => { const p = pricePer100ml(v); return p === null ? null : money(p); }],
  ];

  return (
    <div className="size-compare">
      <button
        type="button" className="btn-outline size-compare-btn" ref={btnRef}
        aria-expanded={open} aria-controls={panelId} onClick={() => setOpen((o) => !o)}
      >Comparar tamaños</button>
      {open && (
        <div
          className="size-compare-panel" id={panelId} role="group" aria-label={`Comparación de tamaños de ${product.name}`}
          onKeyDown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); close(); } }}
        >
          {layout && (
            <figure className="size-fig">
              <div className="size-fig-draw" data-testid="size-draw">
                <svg className="size-svg" viewBox={`0 0 ${layout.width} ${layout.height}`} aria-hidden="true" focusable="false">
                  <line className="size-ground" x1={layout.rulerX} y1={layout.baseY} x2={layout.width - 5} y2={layout.baseY} />
                  <line className="size-ground" x1={layout.rulerX} y1={layout.rulerTicks.at(-1).y} x2={layout.rulerX} y2={layout.baseY} />
                  {layout.rulerTicks.map((t) => (
                    <line key={t.cm} className="size-ground" x1={layout.rulerX} x2={layout.rulerX + (t.long ? 14 : 8)} y1={t.y} y2={t.y} />
                  ))}
                  {layout.figures.map((f) => (f.kind === 'phone' ? (
                    <g key="phone" data-fig="phone" data-h={f.h}>
                      <rect className="size-shape size-phone" x={f.x} y={f.y} width={f.w} height={f.h} rx="9" />
                      <line className="size-phone-detail" x1={f.x + f.w * 0.35} x2={f.x + f.w * 0.65} y1={f.y + 8} y2={f.y + 8} />
                    </g>
                  ) : (
                    <polygon key={f.id} className="size-shape" points={f.points} data-fig={f.id} data-h={f.h} />
                  )))}
                </svg>
                <div className="size-badges" aria-hidden="true">
                  {legend.map(({ n, fig }) => <span key={n} className="size-badge" style={{ left: `${fig.cx}%` }}>{n}</span>)}
                </div>
              </div>
              <figcaption className="size-fig-cap">
                <p className="size-note">
                  Dibujos proporcionales entre sí, con la misma escala. Las medidas reales están en la tabla.
                  Las marcas de la regla van cada 5 cm.
                </p>
                <p className="size-summary">
                  El tamaño {tallest.label.toLowerCase()} mide {num(tallest.heightCm)} cm de alto; el celular de referencia, {PHONE.heightCm} cm.
                </p>
                <ol className="size-legend">
                  {legend.map(({ n, v }) => (
                    <li key={n}>
                      <span className="size-legend-n">{n}.</span>{' '}
                      {v ? (
                        <>
                          <strong>{v.label}</strong>: {money(v.price)}{vol(v) ? `, ${vol(v)}` : ''}, {num(v.heightCm)} cm de alto
                          {!v.available && ' (agotado)'}
                        </>
                      ) : <strong>{PHONE.label}</strong>}
                    </li>
                  ))}
                </ol>
                {notDrawn.length > 0 && (
                  <p className="size-note">No se dibuja (faltan medidas): {notDrawn.map((v) => v.label).join(', ')}. Sus datos están en la tabla.</p>
                )}
              </figcaption>
            </figure>
          )}

          <div className="size-table-wrap" role="region" aria-label={`Tabla de medidas de ${product.name}`} tabIndex={0}>
            <table className="size-table">
              <caption>Medidas y precios de {product.name} por tamaño</caption>
              <thead>
                <tr>
                  <th scope="col">Dato</th>
                  {sizes.map((v) => <th scope="col" key={v.id}>{v.label}</th>)}
                </tr>
              </thead>
              <tbody>
                {rows.map(([name, get]) => (
                  <tr key={name}>
                    <th scope="row">{name}</th>
                    {sizes.map((v) => {
                      const val = get(v);
                      return <td key={v.id}>{val ?? <><span aria-hidden="true">—</span><span className="sr-only">sin dato</span></>}</td>;
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <button type="button" className="btn-outline size-compare-close" onClick={close}>Cerrar comparación</button>
        </div>
      )}
    </div>
  );
}
