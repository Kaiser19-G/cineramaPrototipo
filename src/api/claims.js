// Cliente de la API de reclamos de DNI. Publico: crear, subir archivos, enviar y consultar estado.
// Admin central: lista, detalle, aprobar y rechazar (las imagenes se piden por URL con la cookie de sesion).
import { request } from './auth';

export const claimsApi = {
  create: (payload) => request('POST', '/api/claims', payload),
  submit: (code) => request('POST', '/api/claims/submit', { code }),
  status: (code) => request('POST', '/api/claims/status', { code }),
  removeSelfie: (code) => request('DELETE', '/api/claims/files/selfie', {}, { 'X-Claim-Code': code }),

  // Sube UNA imagen cruda. XMLHttpRequest porque fetch no informa el progreso de subida.
  upload(code, kind, blob, onProgress) {
    return new Promise((resolve) => {
      const xhr = new XMLHttpRequest();
      xhr.open('PUT', `/api/claims/files/${kind}`);
      xhr.setRequestHeader('Content-Type', blob.type);
      xhr.setRequestHeader('X-Claim-Code', code);
      xhr.upload.onprogress = (e) => { if (e.lengthComputable) onProgress?.(Math.round((e.loaded / e.total) * 100)); };
      xhr.onerror = () => resolve({ ok: false, status: 0, error: 'network', data: {} });
      xhr.onload = () => {
        let data = {};
        try { data = JSON.parse(xhr.responseText); } catch { /* sin cuerpo JSON */ }
        const ok = xhr.status >= 200 && xhr.status < 300;
        resolve({ ok, status: xhr.status, error: ok ? null : (data.error || 'unknown'), data });
      };
      xhr.send(blob);
    });
  },

  // Admin central
  list: (status = 'pending') => request('GET', `/api/admin/central/claims?status=${encodeURIComponent(status)}`),
  detail: (id) => request('GET', `/api/admin/central/claims/${id}`),
  approve: (id, body) => request('POST', `/api/admin/central/claims/${id}/approve`, body),
  reject: (id, body) => request('POST', `/api/admin/central/claims/${id}/reject`, body),
  fileUrl: (id, kind, download = false) => `/api/admin/central/claims/${id}/files/${kind}${download ? '?download=1' : ''}`,
};
