// Utilidades de prueba: servidor en un puerto efimero, base temporal y reloj controlable.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openDb } from '../db.js';
import { createApp } from '../app.js';
import { seed } from '../seed.js';
import { seedDemoCredentials, DEMO_PASSWORD } from '../seedAuth.js';

export { DEMO_PASSWORD };

// Datos de prueba que NUNCA deben aparecer en la consola del servidor.
export const PII = {
  dni: '12345678', email: 'ana.prueba@example.com', phone: '987654321', name: 'Ana Prueba Quispe',
  password: 'clave-de-prueba-1',
};

export async function startEnv(options = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cinerama-test-'));
  const dbFile = path.join(dir, 'test.db');
  const db = openDb(dbFile);
  seed(db);
  await seedDemoCredentials(db);
  const clock = { now: Date.UTC(2026, 10, 12, 15, 0, 0) };
  const logs = [];
  const log = { log: (...a) => logs.push(a.join(' ')), warn: (...a) => logs.push(a.join(' ')), error: (...a) => logs.push(a.join(' ')) };
  const { app } = createApp(db, { clock: () => clock.now, dbFile, simulateSms: true, log, ...options });
  const server = await new Promise((resolve) => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
  const base = `http://127.0.0.1:${server.address().port}`;
  let ipN = 0;

  // Un "navegador": conserva sus cookies. Cada uno usa una IP distinta (X-Forwarded-For).
  const client = (ip = `10.0.0.${++ipN}`) => {
    const jar = new Map();
    const call = async (method, url, body, extra = {}) => {
      const headers = {
        'x-forwarded-for': ip,
        ...(body !== undefined && !extra.rawBody ? { 'content-type': 'application/json' } : {}),
        ...(jar.size ? { cookie: [...jar].map(([k, v]) => `${k}=${v}`).join('; ') } : {}),
        ...(extra.headers || {}),
      };
      const res = await fetch(base + url, {
        method, headers,
        body: extra.rawBody ?? (body === undefined ? undefined : JSON.stringify(body)),
      });
      const setCookies = res.headers.getSetCookie();
      for (const sc of setCookies) {
        const [pair, ...attrs] = sc.split(';');
        const i = pair.indexOf('=');
        const name = pair.slice(0, i), value = pair.slice(i + 1);
        if (value === '' || /max-age=0/i.test(attrs.join(';'))) jar.delete(name); else jar.set(name, value);
      }
      let json = null;
      const text = await res.text();
      try { json = text ? JSON.parse(text) : null; } catch { /* no JSON */ }
      return { status: res.status, json, setCookies, headers: res.headers };
    };
    return { jar, get: (u, e) => call('GET', u, undefined, e), post: (u, b, e) => call('POST', u, b ?? {}, e), call };
  };

  const stop = () => new Promise((resolve) => server.close(() => {
    db.close();
    fs.rmSync(dir, { recursive: true, force: true });
    resolve();
  }));
  return { db, clock, logs, base, client, stop, dbFile };
}

export const regBody = (over = {}) => ({
  name: PII.name, dni: PII.dni, email: PII.email, phone: PII.phone, password: PII.password, consent: true, ...over,
});
