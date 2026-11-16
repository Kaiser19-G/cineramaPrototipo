// Cliente de la API de compras. Mapa de butacas y menu publicos; comprar exige sesion de cliente.
// El cuerpo de la compra NO lleva datos de tarjeta: el pago es simulado y esos campos nunca salen del navegador.
import { request } from './auth';

export const ordersApi = {
  seats: (screeningId) => request('GET', `/api/screenings/${screeningId}/seats`),
  menu: (screeningId) => request('GET', `/api/screenings/${screeningId}/menu`),
  mine: ({ scope, page = 1, pageSize = 10 } = {}) => request('GET', `/api/orders?${new URLSearchParams({ ...(scope ? { scope } : {}), page, pageSize })}`),
  one: (code) => request('GET', `/api/orders/${encodeURIComponent(code)}`),
  presaleQuota: (movieId) => request('GET', `/api/presale-quota/${movieId}`),
  // items: [{ variantId, qty, expectedUnitPrice }] y pickup: { timing } son opcionales. expectedAmount es el total que
  // el cliente vio: si el servidor calcula otro, responde 409 price_changed y no cobra.
  purchase: ({ screeningId, seats, idempotencyKey, simulatedOutcome, items, pickup, expectedAmount }) => request('POST', '/api/orders', {
    screeningId, seats, idempotencyKey, payment: { method: 'card', simulatedOutcome },
    ...(items?.length ? { items, pickup } : {}),
    ...(expectedAmount !== undefined ? { expectedAmount } : {}),
  }),
};
