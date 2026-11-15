// Reglas de compra compartidas por el servidor (que las aplica) y el sitio (que las anuncia).
// Tope de entradas por cuenta y por funcion (acumulado entre ordenes); tambien es el maximo por orden.
export const MAX_TICKETS_PER_SCREENING = 8;
// Venta web: se cierra esta cantidad de minutos ANTES de la hora de inicio (0 = hasta la hora de inicio, hora de Lima).
export const WEB_SALE_CUTOFF_MINUTES = 0;
// Metodos y resultados del pago simulado.
export const SIMULATED_OUTCOMES = ['approved', 'declined'];
// Motivos fijos de un reembolso (el cliente ve un texto por codigo; nunca el motivo libre del personal).
export const REFUND_REASONS = { screening_cancelled: 'Función cancelada por el cine' };
