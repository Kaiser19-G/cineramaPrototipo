import { forwardRef, useImperativeHandle, useRef, useState } from 'react';
import './SeatMap.css';

// Mapa de butacas accesible, compartido por la compra publica y Taquilla (mismo codigo, mismo aspecto):
// ARIA grid con row y rowheader, roving tabindex, teclado ampliado, butaca ocupada con aria-disabled y leyenda.
// Es controlado: la pantalla decide que significa elegir una butaca (`onToggle`) y anuncia en su propia region viva.
//   layout    { cols, rows: [{ label, seats }] }
//   taken     Set con las butacas ocupadas
//   selected  arreglo con las butacas elegidas
//   describedBy  id del texto que explica el limite de seleccion (opcional)
//   initialFocus / onFocusChange  permiten conservar la ultima butaca enfocada si la pantalla desmonta el mapa
// El padre puede mover el foco con ref.current.focusSeat('A1').
const SeatMap = forwardRef(function SeatMap({ layout, taken, selected, onToggle, describedBy, label = 'Mapa de butacas', initialFocus = 'A1', onFocusChange }, ref) {
  const seatRefs = useRef({});
  const [focusedSeat, setFocusedSeatState] = useState(initialFocus);
  const setFocusedSeat = (seat) => { setFocusedSeatState(seat); onFocusChange?.(seat); };

  useImperativeHandle(ref, () => ({
    focusSeat(seat) { setFocusedSeat(seat); seatRefs.current[seat]?.focus(); },
  }));

  // Lee la posición del elemento con foco REAL en el DOM (e.target), no del estado de React.
  const handleKeyDown = (e) => {
    let r = parseInt(e.target.dataset.row, 10);
    let c = parseInt(e.target.dataset.col, 10);
    if (Number.isNaN(r) || Number.isNaN(c)) return;
    const lastRow = layout.rows.length - 1;
    const rowLen = (i) => layout.rows[i].seats;
    if (e.key === 'ArrowRight') c = Math.min(c + 1, rowLen(r) - 1);
    else if (e.key === 'ArrowLeft') c = Math.max(c - 1, 0);
    else if (e.key === 'ArrowDown') r = Math.min(r + 1, lastRow);
    else if (e.key === 'ArrowUp') r = Math.max(r - 1, 0);
    else if (e.key === 'PageDown') r = Math.min(r + 5, lastRow);
    else if (e.key === 'PageUp') r = Math.max(r - 5, 0);
    else if (e.key === 'Home') { if (e.ctrlKey) r = 0; c = 0; }
    else if (e.key === 'End') { if (e.ctrlKey) r = lastRow; c = e.ctrlKey ? rowLen(lastRow) - 1 : rowLen(r) - 1; }
    else return; // Enter/Espacio los maneja el <button>; Tab sale de la grilla
    c = Math.min(c, rowLen(r) - 1);
    e.preventDefault();
    const seat = `${layout.rows[r].label}${c + 1}`;
    setFocusedSeat(seat);
    seatRefs.current[seat]?.focus();
  };

  return (
    <>
      <div className="screen-indicator">
        <div className="screen-bar" />
        <p className="screen-label">Pantalla</p>
      </div>

      <div className="seats-map-scroll" tabIndex={0} role="region" aria-label={`${label} (se desplaza horizontalmente)`}>
        <div
          className="seats-map"
          role="grid"
          aria-label={label}
          aria-describedby={describedBy}
          aria-rowcount={layout.rows.length}
          aria-colcount={layout.cols + 1}
          onKeyDown={handleKeyDown}
        >
          {layout.rows.map((row, r) => (
            <div className="seats-row" role="row" aria-rowindex={r + 1} key={row.label}>
              <span className="seat-rowlabel" role="rowheader" aria-colindex={1}>
                <span aria-hidden="true">{row.label}</span>
                <span className="sr-only">Fila {row.label}</span>
              </span>
              {Array.from({ length: row.seats }, (_, c) => {
                const seatName = `${row.label}${c + 1}`;
                const isOccupied = taken.has(seatName);
                const isSelected = selected.includes(seatName);
                const seatState = isOccupied ? 'occupied' : isSelected ? 'selected' : 'available';
                const stateLabel = seatState === 'occupied' ? 'ocupada' : seatState === 'selected' ? 'seleccionada' : 'disponible';
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
                    aria-colindex={c + 2}
                    aria-label={`Butaca ${seatName}, fila ${row.label}, ${stateLabel}`}
                    onClick={() => onToggle(seatName)}
                    onFocus={() => setFocusedSeat(seatName)}
                  >
                    {seatName}
                    {seatState === 'selected' && <span className="seat-icon" aria-hidden="true">✓</span>}
                    {seatState === 'occupied' && <span className="seat-icon" aria-hidden="true">✕</span>}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
      <p className="booking-keys">Con el teclado: flechas para moverte, Re Pág y Av Pág para saltar 5 filas, Ctrl+Inicio y Ctrl+Fin para ir a la primera o la última butaca, Enter o Espacio para elegir. Si el mapa es más ancho que la pantalla, desplázalo horizontalmente.</p>

      <ul className="seats-legend">
        <li><span className="legend-swatch legend-available" aria-hidden="true"></span>Disponible</li>
        <li><span className="legend-swatch legend-selected" aria-hidden="true">✓</span>Seleccionada</li>
        <li><span className="legend-swatch legend-occupied" aria-hidden="true">✕</span>Ocupada</li>
      </ul>
    </>
  );
});

export default SeatMap;
