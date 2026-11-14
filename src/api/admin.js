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
    list: () => request('GET', '/api/admin/screenings'),
  },
};
