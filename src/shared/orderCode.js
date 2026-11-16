// Codigo de orden: CIN-XXXXX-XXXXX (sin 0, 1, I, L ni O). Compartido por el servidor y la pantalla Validar.
export const ORDER_CODE_RE = /^CIN-[2-9A-HJKMNP-Z]{5}-[2-9A-HJKMNP-Z]{5}$/;

// Acepta el codigo pegado o leido por un lector: con o sin guiones, espacios y en minusculas.
// Devuelve el codigo con su forma canonica, o null si no tiene la forma de un codigo de orden.
export function normalizeOrderCode(raw) {
  if (typeof raw !== 'string' || raw.length > 40) return null;
  const t = raw.toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (t.length !== 13 || !t.startsWith('CIN')) return null;
  const code = `CIN-${t.slice(3, 8)}-${t.slice(8)}`;
  return ORDER_CODE_RE.test(code) ? code : null;
}
