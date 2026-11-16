import { CheckCircle, XCircle, Clock, Ban, AlertTriangle } from 'lucide-react';

// Estado de venta en mostrador: siempre con texto (y un icono), no solo color.
const SALE = {
  open: { label: 'Abierta', Icon: CheckCircle, cls: 'sl-status-approved' },
  closed: { label: 'Cerrada', Icon: Clock, cls: '' },
  finished: { label: 'Terminada', Icon: Ban, cls: '' },
  sold_out: { label: 'Agotada', Icon: XCircle, cls: 'sl-status-rejected' },
  not_on_sale: { label: 'No está a la venta', Icon: Ban, cls: '' },
  presale_requires_account: { label: 'Preventa: solo en la web', Icon: AlertTriangle, cls: 'sl-status-refunded' },
};

export default function SaleStatus({ sale, inline = false }) {
  const s = SALE[sale.reason] ?? SALE.not_on_sale;
  const text = sale.reason === 'open' ? `${s.label} hasta las ${sale.closesAt}` : s.label;
  if (inline) return <>{text.toLowerCase()}</>;
  return <span className={`sl-status ${s.cls}`}><s.Icon size={13} aria-hidden="true" />{text}</span>;
}
