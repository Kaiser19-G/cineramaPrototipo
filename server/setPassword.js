// Cambia la contrasena de un usuario del personal (o cliente) sin dejarla en el historial ni en consola:
//   npm run set-password -- admin@cinerama.com
// La contrasena se pide de forma interactiva, sin eco. Nunca se recibe por argumento ni variable de entorno.
import readline from 'node:readline';
import { fileURLToPath } from 'node:url';
import { hashPassword } from './auth/crypto.js';
import { DEMO_PASSWORD } from './auth/config.js';
import { normalizeEmail, PASSWORD_MIN, PASSWORD_MAX } from '../src/shared/validators.js';

// Devuelve { ok:true } o { ok:false, error } con codigos: not_found, password_short, password_long, password_demo.
export async function setPassword(db, email, password) {
  const user = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizeEmail(email));
  if (!user) return { ok: false, error: 'not_found' };
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) return { ok: false, error: 'password_short' };
  if (password.length > PASSWORD_MAX) return { ok: false, error: 'password_long' };
  if (password === DEMO_PASSWORD) return { ok: false, error: 'password_demo' };
  const hash = await hashPassword(password);
  db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, user.id);
    db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id); // las sesiones abiertas se cierran
  })();
  return { ok: true };
}

// Lee una linea sin eco si hay terminal; si la entrada es una tuberia (pruebas), lee la linea tal cual.
function askHidden(prompt, lines) {
  if (!process.stdin.isTTY) return Promise.resolve(lines.next());
  return new Promise((resolve) => {
    process.stdout.write(prompt);
    const stdin = process.stdin;
    stdin.setRawMode(true);
    stdin.resume();
    stdin.setEncoding('utf8');
    let buf = '';
    const onData = (chunk) => {
      for (const ch of chunk) {
        if (ch === '\r' || ch === '\n') {
          stdin.setRawMode(false); stdin.pause(); stdin.off('data', onData);
          process.stdout.write('\n');
          return resolve(buf);
        }
        if (ch === '\u0003') { stdin.setRawMode(false); process.stdout.write('\n'); process.exit(130); }
        if (ch === '\u007f' || ch === '\b') buf = buf.slice(0, -1);
        else if (ch >= ' ') buf += ch;
      }
    };
    stdin.on('data', onData);
  });
}

async function readPipedLines() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const out = [];
  for await (const l of rl) out.push(l);
  let i = 0;
  return { next: () => out[i++] ?? '' };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const email = process.argv[2];
  if (!email || process.argv.length > 3) {
    console.error('Uso: npm run set-password -- <correo>\n(la contrasena se pide despues, sin mostrarla)');
    process.exit(2);
  }
  const { openDb } = await import('./db.js');
  let db;
  try { db = openDb(); } catch (e) {
    console.error(`\n[ERROR] No se pudo abrir la base de datos: ${e.message}\n`);
    process.exit(1);
  }
  const exists = db.prepare('SELECT id FROM users WHERE lower(email) = ?').get(normalizeEmail(email));
  if (!exists) { console.error('No existe un usuario con ese correo.'); db.close(); process.exit(1); }
  const lines = process.stdin.isTTY ? null : await readPipedLines();
  const first = await askHidden('Contrasena nueva: ', lines);
  const second = await askHidden('Repite la contrasena: ', lines);
  if (first !== second) { console.error('Las contrasenas no coinciden. No se cambio nada.'); db.close(); process.exit(1); }
  const res = await setPassword(db, email, first);
  db.close();
  if (!res.ok) {
    const msg = {
      password_short: `Usa al menos ${PASSWORD_MIN} caracteres.`,
      password_long: `Usa como maximo ${PASSWORD_MAX} caracteres.`,
      password_demo: 'No uses la contrasena de demostracion.',
      not_found: 'No existe un usuario con ese correo.',
    }[res.error];
    console.error(`${msg} No se cambio nada.`);
    process.exit(1);
  }
  console.log('Contrasena cambiada. Las sesiones abiertas de ese usuario se cerraron.');
}
