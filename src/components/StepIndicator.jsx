const DEFAULT_STEPS = ['Película', 'Función', 'Butacas', 'Pago', 'Confirmación'];

// Indicador de progreso compartido por todo el flujo de compra (resuelve
// H-05: antes solo aparecía dentro de WebBooking, empezando en "Butacas" —
// el usuario no veía que elegir película y función también eran pasos).
// `steps` es opcional (por defecto los 5 pasos originales); `current` es la posición (1..N) dentro de esa lista.
// `skipped` son posiciones omitidas por la persona (se marcan con "–" y texto oculto "omitido").
export default function StepIndicator({ current, steps = DEFAULT_STEPS, skipped = [] }) {
  return (
    <nav className="booking-steps" aria-label="Progreso de la compra">
      {steps.map((label, idx) => {
        const n = idx + 1;
        const state = skipped.includes(n) && n < current ? 'skipped' : n < current ? 'done' : n === current ? 'current' : 'upcoming';
        const hidden = { done: 'completado', skipped: 'omitido', upcoming: 'pendiente' }[state];
        return (
          <div className="booking-step-wrap" key={label}>
            {idx > 0 && <span className="step-arrow" aria-hidden="true">→</span>}
            <div className={`booking-step ${state}`} aria-current={state === 'current' ? 'step' : undefined}>
              <span className="step-num">{state === 'done' ? '✓' : state === 'skipped' ? '–' : n}</span>
              <span className="step-label">{label}</span>
              {hidden && <span className="sr-only">({hidden})</span>}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
