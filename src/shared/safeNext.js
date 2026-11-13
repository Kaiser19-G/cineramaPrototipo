// Ruta interna segura para ?next= (evita redirecciones abiertas: "//evil.com", "/\evil.com", "https://...").
export function safeNext(next) {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//') || next.startsWith('/\\')) return null;
  if (/^\/web\/(login|registro)(\/|\?|$)/.test(next)) return null;
  return next;
}
