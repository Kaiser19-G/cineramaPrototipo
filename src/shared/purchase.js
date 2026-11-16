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

// ── Confitería (fase 5) ──
// Topes de un pedido de confitería. Los aplica el servidor al comprar; el menú público los anuncia.
export const MAX_ITEM_QTY = 10;              // unidades de un mismo producto y tamaño
export const MAX_FOOD_UNITS_PER_ORDER = 20;  // unidades en total por pedido
export const MAX_FOOD_LINES = 12;            // líneas distintas por pedido
// Antelación con la que se empieza a preparar un pedido "a la hora de la función".
export const PICKUP_PREP_LEAD_MINUTES = 15;
export const PICKUP_POINT_LABEL = 'Mostrador de pedidos web';
// Momento de preparación que elige el cliente.
export const PICKUP_TIMINGS = { on_arrival: 'Al llegar', at_showtime: 'A la hora de la función' };
// Estados de preparación y entrega del pedido (el personal los cambia en la entrega 5d).
export const FULFILLMENT_STATUS_LABELS = {
  ordered: 'Pedido recibido', preparing: 'En preparación', ready: 'Listo para recoger',
  delivered: 'Entregado', not_collected: 'No recogido', cancelled: 'Cancelado',
};

// Valida `items` y `pickup` de una compra (misma regla para el servidor y para el sitio). Solo se leen variantId, qty y
// los precios que el cliente VIO (expectedUnitPrice, opcional, solo para detectar cambios): nunca se cobra con ellos.
// Devuelve { errors } o { value: { items: [{ variantId, qty, expectedUnitPrice|null }] (ordenados por variantId), timing } }.
export function parseFoodRequest(rawItems, rawPickup) {
  const errors = {};
  if (rawItems === undefined || rawItems === null) return { value: { items: [], timing: null } };
  if (!Array.isArray(rawItems)) return { errors: { items: 'invalid' } };
  if (rawItems.length === 0) return { value: { items: [], timing: null } };
  if (rawItems.length > MAX_FOOD_LINES) return { errors: { items: 'too_many_lines' } };
  const items = [];
  let units = 0;
  for (const it of rawItems) {
    if (!it || typeof it !== 'object' || Array.isArray(it)) { errors.items = 'invalid'; break; }
    const { variantId, qty, expectedUnitPrice } = it;
    if (!(Number.isInteger(variantId) && variantId > 0)) { errors.items = 'invalid'; break; }
    if (!Number.isInteger(qty) || qty < 1) { errors.items = 'invalid_qty'; break; }
    if (qty > MAX_ITEM_QTY) { errors.items = 'qty_too_high'; break; }
    if (expectedUnitPrice !== undefined && !(typeof expectedUnitPrice === 'number' && Number.isFinite(expectedUnitPrice))) { errors.items = 'invalid'; break; }
    items.push({ variantId, qty, expectedUnitPrice: expectedUnitPrice ?? null });
    units += qty;
  }
  if (!errors.items && new Set(items.map((i) => i.variantId)).size !== items.length) errors.items = 'duplicated';
  if (!errors.items && units > MAX_FOOD_UNITS_PER_ORDER) errors.items = 'too_many_units';
  const timing = rawPickup && typeof rawPickup === 'object' ? rawPickup.timing : undefined;
  if (rawPickup === undefined || rawPickup === null) errors.pickup = 'required';
  else if (!Object.hasOwn(PICKUP_TIMINGS, timing)) errors.pickup = 'invalid';
  if (Object.keys(errors).length) return { errors };
  return { value: { items: items.sort((a, b) => a.variantId - b.variantId), timing } };
}
