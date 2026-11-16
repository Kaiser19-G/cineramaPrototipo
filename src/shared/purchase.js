// Reglas de compra compartidas por el servidor (que las aplica) y el sitio (que las anuncia).
// Tope de entradas por cuenta y por funcion (acumulado entre ordenes); tambien es el maximo por orden.
export const MAX_TICKETS_PER_SCREENING = 8;
// Venta web: se cierra esta cantidad de minutos ANTES de la hora de inicio (0 = hasta la hora de inicio, hora de Lima).
export const WEB_SALE_CUTOFF_MINUTES = 0;
// Metodos y resultados del pago simulado.
export const SIMULATED_OUTCOMES = ['approved', 'declined'];
// Motivos fijos de un reembolso (el cliente ve un texto por codigo; nunca el motivo libre del personal).
export const REFUND_REASONS = {
  screening_cancelled: 'Función cancelada por el cine',
  customer_request: 'Reembolso a solicitud del cliente',
  duplicate_purchase: 'Compra duplicada',
  wrong_selection: 'Función o butacas equivocadas',
  technical_issue: 'Problema técnico o de sala',
};
// Motivos que el personal puede elegir al reembolsar una orden (codigo fijo; el cliente ve el texto de arriba).
export const STAFF_REFUND_REASONS = {
  customer_request: 'Solicitud del cliente',
  duplicate_purchase: 'Compra duplicada',
  wrong_selection: 'Función o butacas equivocadas',
  technical_issue: 'Problema técnico o de sala',
};

// ── Taquilla (venta en mostrador, validacion en puerta; fase 4d) ──
// Tope de entradas por orden en mostrador. No hay tope acumulado: el mostrador no tiene cuenta de cliente.
export const MAX_TICKETS_PER_COUNTER_ORDER = 10;
// El mostrador vende hasta esta cantidad de minutos DESPUES del inicio de la funcion (la web cierra al inicio).
export const COUNTER_SALE_GRACE_MINUTES = 15;
// El ingreso a sala se registra desde esta cantidad de minutos ANTES del inicio y hasta que termina la funcion,
// siempre el mismo dia de la funcion (hora de Lima).
export const CHECKIN_OPENS_MINUTES_BEFORE = 60;
// Pago simulado en mostrador (efectivo o tarjeta; no se recibe ni guarda ningun dato de tarjeta).
export const COUNTER_PAY_METHODS = { cash: 'Efectivo', card: 'Tarjeta' };
// Datos guardados de una venta sin nombre: ningun dato personal inventado. El correo queda vacio y nunca se muestra.
export const COUNTER_ANON_NAME = 'Venta en mostrador';
export const COUNTER_NAME_MAX = 60;
