// Cliente de la API del panel de administración (solo personal). Mismo formato de respuesta que auth.js:
// { ok, status, error, data }. Los permisos y el alcance por sede los aplica el servidor.
import { request } from './auth';

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
  halls: {
    setStatus: (id, status) => request('PATCH', `/api/admin/halls/${id}`, { status }),
  },
};
