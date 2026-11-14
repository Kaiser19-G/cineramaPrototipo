// Reglas de validacion compartidas (cliente y servidor). Devuelven CODIGOS de
// error; los mensajes visibles estan en el cliente.

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;

export const normalizeName = (v) => String(v ?? '').trim().replace(/\s+/g, ' ');
export const normalizeEmail = (v) => String(v ?? '').trim().toLowerCase();
export const normalizeDni = (v) => String(v ?? '').replace(/\s/g, '');

// Celular peruano: 9 digitos y empieza en 9. Se tolera "+51", "51", espacios, guiones y parentesis.
export function normalizePhone(v) {
  let s = String(v ?? '').replace(/[\s\-().]/g, '');
  if (s.startsWith('+51')) s = s.slice(3);
  else if (/^51\d{9}$/.test(s)) s = s.slice(2);
  return s;
}

export const isDni = (s) => /^\d{8}$/.test(s);
export const isPhone = (s) => /^9\d{8}$/.test(s);

export function validateRegistration(input = {}) {
  const e = {};
  const name = normalizeName(input.name);
  if (typeof input.name !== 'string' || name.length < 2) e.name = 'name_required';
  else if (name.length > 100) e.name = 'name_too_long';

  if (typeof input.dni !== 'string' || !isDni(normalizeDni(input.dni))) e.dni = 'dni_invalid';

  const email = normalizeEmail(input.email);
  if (typeof input.email !== 'string' || !email) e.email = 'email_required';
  else if (!EMAIL_RE.test(email)) e.email = 'email_invalid';
  else if (email.length > 254) e.email = 'email_too_long';

  if (typeof input.phone !== 'string' || !isPhone(normalizePhone(input.phone))) e.phone = 'phone_invalid';

  if (typeof input.password !== 'string' || input.password.length === 0) e.password = 'password_required';
  else if (input.password.length < PASSWORD_MIN) e.password = 'password_short';
  else if (input.password.length > PASSWORD_MAX) e.password = 'password_long';

  if (input.consent !== true) e.consent = 'consent_required';
  return e;
}

// Reclamo de DNI: mismos campos de identidad que el registro, sin contrasena. `consent` es la aceptacion de la politica.
export function validateClaim(input = {}) {
  const e = validateRegistration({ ...input, password: 'x'.repeat(PASSWORD_MIN) });
  delete e.password;
  return e;
}
