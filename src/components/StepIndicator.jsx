const STEPS = ['Película', 'Función', 'Butacas', 'Pago', 'Confirmación'];

// Indicador de progreso compartido por todo el flujo de compra (resuelve
// H-05: antes solo aparecía dentro de WebBooking, empezando en "Butacas" —
// el usuario no veía que elegir película y función también eran pasos).
export default function StepIndicator({ current }) {
  return (
    <nav className="booking-steps" aria-label="Progreso de la compra">
      {STEPS.map((label, idx) => {
        const n = idx + 1;
        const state = n < current ? 'done' : n === current ? 'current' : 'upcoming';
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
  );
}
