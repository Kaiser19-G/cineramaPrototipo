// Textos del estado de una entrada. El servidor decide el estado (displayStatus); aqui solo se nombra.
export const ORDER_STATUS = {
  valid: { label: 'Vigente', icon: '✓' },
  used: { label: 'Usada', icon: '●' },
  past: { label: 'Función ya pasada', icon: '○' },
  refunded: { label: 'Reembolsada (simulado)', icon: '↺' },
  rejected: { label: 'Pago rechazado', icon: '✕' },
  cancelled: { label: 'Cancelada', icon: '✕' },
};

export const statusInfo = (order) => ORDER_STATUS[order.displayStatus] ?? { label: 'Desconocido', icon: '?' };

// Motivo corto por codigo fijo (el servidor nunca envia el motivo libre del personal).
const REFUND_SHORT = {
  screening_cancelled: 'función cancelada',
  customer_request: 'a solicitud del cliente',
  duplicate_purchase: 'compra duplicada',
  wrong_selection: 'función o butacas equivocadas',
  technical_issue: 'problema técnico o de sala',
};
export const money = (n) => `S/ ${Number(n).toFixed(2)}`;

// "Reembolsada (simulado): función cancelada"
export function statusText(order) {
  const { label } = statusInfo(order);
  const why = REFUND_SHORT[order.refund?.reasonCode];
  return order.displayStatus === 'refunded' && why ? `${label}: ${why}` : label;
}
