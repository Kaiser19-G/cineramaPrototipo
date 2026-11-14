// Cliente de la API de cuentas. Siempre JSON y cookie de sesion (httpOnly) del mismo origen.
export async function request(method, url, body, headers) {
  let res;
  try {
    res = await fetch(url, {
      method,
      credentials: 'same-origin',
      headers: method === 'GET' ? undefined : { 'Content-Type': 'application/json', ...headers },
      body: method === 'GET' ? undefined : JSON.stringify(body ?? {}),
    });
  } catch {
    return { ok: false, status: 0, error: 'network', data: {} };
  }
  let data = {};
  if (res.status !== 204) {
    try { data = await res.json(); } catch { /* sin cuerpo JSON */ }
  }
  return { ok: res.ok, status: res.status, error: res.ok ? null : (data.error || 'unknown'), data };
}

export const authApi = {
  me: () => request('GET', '/api/auth/me'),
  login: (email, password) => request('POST', '/api/auth/login', { email, password }),
  logout: () => request('POST', '/api/auth/logout'),
  register: (payload) => request('POST', '/api/auth/register', payload),
  verifyPhone: (code) => request('POST', '/api/auth/verify-phone', { code }),
  resendCode: () => request('POST', '/api/auth/resend-code'),
};
