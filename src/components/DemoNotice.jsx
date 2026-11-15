import { Info } from 'lucide-react';

// Aviso visible en las pantallas del panel que todavía no guardan nada real. Texto, no solo color.
export default function DemoNotice({ children }) {
  return (
    <div className="demo-notice" role="note">
      <Info size={16} aria-hidden="true" />
      <p>
        <strong>Datos de ejemplo.</strong>{' '}
        {children ?? 'Esta pantalla todavía no usa datos reales y lo que hagas aquí no se guarda.'}
      </p>
    </div>
  );
}
