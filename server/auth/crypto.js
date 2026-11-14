import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { keyFileFor } from '../dataDir.js';
import { promisify } from 'node:util';

const scrypt = promisify(crypto.scrypt);

// scrypt (OWASP: N>=2^15, r=8, p=1). maxmem explicito: 128*N*r = 32 MiB, justo el limite por defecto.
const N = 2 ** 15, R = 8, P = 1, KEYLEN = 64, MAXMEM = 128 * 1024 * 1024;

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const key = await scrypt(password, salt, KEYLEN, { N, r: R, p: P, maxmem: MAXMEM });
  return `scrypt$${N}$${R}$${P}$${salt.toString('base64')}$${key.toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const parts = typeof stored === 'string' ? stored.split('$') : [];
  if (parts.length !== 6 || parts[0] !== 'scrypt') return false;
  const [n, r, p] = parts.slice(1, 4).map(Number);
  if (![n, r, p].every(Number.isInteger) || n > 2 ** 18 || n < 2 ** 12) return false;
  const salt = Buffer.from(parts[4], 'base64');
  const expected = Buffer.from(parts[5], 'base64');
  const key = await scrypt(password, salt, expected.length, { N: n, r, p, maxmem: MAXMEM * 2 });
  return key.length === expected.length && crypto.timingSafeEqual(key, expected);
}

// Hash ficticio para igualar tiempos cuando el correo no existe.
let dummy;
export async function dummyVerify(password) {
  dummy ??= await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummy);
  return false;
}

export const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');
export const randomToken = () => crypto.randomBytes(32).toString('base64url');

export function safeEqualHex(a, b) {
  const x = Buffer.from(a, 'hex'), y = Buffer.from(b, 'hex');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Codigo de 6 digitos (con ceros a la izquierda).
export const randomCode = () => String(crypto.randomInt(0, 1_000_000)).padStart(6, '0');

// Pepper del HMAC del DNI: CINERAMA_PEPPER, o un archivo junto a la base de datos
// (directorio de datos, fuera del proyecto; ver dataDir.js), generado al primer uso.
export function loadPepper(dbFile) {
  if (process.env.CINERAMA_PEPPER) return process.env.CINERAMA_PEPPER;
  const file = keyFileFor(dbFile);
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(32).toString('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
    fs.writeFileSync(file, secret + '\n', { mode: 0o600 });
    return secret;
  }
}

export const dniHash = (pepper, dni) => crypto.createHmac('sha256', pepper).update('dni:' + dni).digest('hex');

// Huellas para reclamos de DNI (HMAC con el pepper; no reversibles).
export const claimCodeHash = (pepper, code) => crypto.createHmac('sha256', pepper).update('claim:' + code).digest('hex');
export const contactHash = (pepper, email) => crypto.createHmac('sha256', pepper).update('contact:' + String(email).trim().toLowerCase()).digest('hex');
