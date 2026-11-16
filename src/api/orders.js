// Cliente de la API de compras. Mapa de butacas publico; comprar exige sesion de cliente.
// El cuerpo de la compra NO lleva datos de tarjeta: el pago es simulado y esos campos nunca salen del navegador.
import { request } from './auth';

export const ordersApi = {
  seats: (screeningId) => request('GET', `/api/screenings/${screeningId}/seats`),
  mine: ({ scope, page = 1, pageSize = 10 } = {}) => request('GET', `/api/orders?${new URLSearchParams({ ...(scope ? { scope } : {}), page, pageSize })}`),
  one: (code) => request('GET', `/api/orders/${encodeURIComponent(code)}`),
  presaleQuota: (movieId) => request('GET', `/api/presale-quota/${movieId}`),
  purchase: ({ screeningId, seats, idempotencyKey, simulatedOutcome }) => request('POST', '/api/orders', {
    screeningId, seats, idempotencyKey, payment: { method: 'card', simulatedOutcome },
  }),
};
