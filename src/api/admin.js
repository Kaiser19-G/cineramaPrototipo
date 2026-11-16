// Cliente de la API del panel de administración (solo personal). Mismo formato de respuesta que auth.js:
// { ok, status, error, data }. Los permisos y el alcance por sede los aplica el servidor.
import { request } from './auth';

const qs = (params) => new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString();

export const adminApi = {
  movies: {
    list: () => request('GET', '/api/admin/movies'),
    get: (id) => request('GET', `/api/admin/movies/${id}`),
    create: (body) => request('POST', '/api/admin/movies', body),
    update: (id, body) => request('PATCH', `/api/admin/movies/${id}`, body),
    setBranches: (id, branches) => request('PUT', `/api/admin/movies/${id}/branches`, { branches }),
    setBranch: (id, branchId, body) => request('PUT', `/api/admin/movies/${id}/branches/${branchId}`, body),
  },
  screenings: {
    list: (query = '') => request('GET', `/api/admin/screenings${query ? `?${query}` : ''}`),
    create: (body) => request('POST', '/api/admin/screenings', body),
    update: (id, body) => request('PATCH', `/api/admin/screenings/${id}`, body),
    cancel: (id, body) => request('POST', `/api/admin/screenings/${id}/cancel`, body),
  },
  users: {
    list: (params = {}) => request('GET', `/api/admin/central/users?${new URLSearchParams(Object.entries(params).filter(([, v]) => v !== '' && v !== null && v !== undefined)).toString()}`),
    create: (body) => request('POST', '/api/admin/central/users', body),
    update: (id, body) => request('PATCH', `/api/admin/central/users/${id}`, body),
    resetPassword: (id) => request('POST', `/api/admin/central/users/${id}/reset-password`, {}),
    audit: (page = 1) => request('GET', `/api/admin/central/users/audit/log?page=${page}`),
  },
  sales: {
    orders: (params = {}) => request('GET', `/api/admin/orders?${qs(params)}`),
    reports: (params = {}) => request('GET', `/api/admin/reports/summary?${qs(params)}`),
    dashboard: (params = {}) => request('GET', `/api/admin/dashboard?${qs(params)}`),
  },
  // Taquilla: venta en mostrador, validacion en puerta y reembolso individual (el servidor decide permisos y sede).
  counter: {
    screenings: () => request('GET', '/api/admin/counter/screenings'),
    seats: (id) => request('GET', `/api/admin/counter/screenings/${id}/seats`),
    sell: (body) => request('POST', '/api/admin/counter/orders', body),
    lookup: (code) => request('POST', '/api/admin/counter/tickets/lookup', { code }),
    checkIn: (code, seats) => request('POST', '/api/admin/counter/tickets/checkin', seats ? { code, seats } : { code }),
    refund: (code, reason) => request('POST', `/api/admin/orders/${encodeURIComponent(code)}/refund`, { reason }),
  },
  // Cola de pedidos de confitería de la sede (permiso fulfill_orders). El código completo solo viaja en el cuerpo.
  pickups: {
    queue: () => request('GET', '/api/admin/pickups'),
    lookup: (code) => request('POST', '/api/admin/pickups/lookup', { code }),
    act: (id, action, code) => request('POST', `/api/admin/pickups/${id}/${action}`, code === undefined ? {} : { code }),
  },
  // Confitería: catálogo (solo admin central escribe) y disponibilidad por sede (admin central y gerente de la sede).
  products: {
    list: () => request('GET', '/api/admin/products'),
    get: (id) => request('GET', `/api/admin/products/${id}`),
    create: (body) => request('POST', '/api/admin/products', body),
    update: (id, body) => request('PATCH', `/api/admin/products/${id}`, body),
    setStock: (id, branchId, body) => request('PUT', `/api/admin/products/${id}/branches/${branchId}`, body),
  },
  halls: {
    setStatus: (id, status) => request('PATCH', `/api/admin/halls/${id}`, { status }),
  },
};
