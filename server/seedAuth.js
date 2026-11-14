// Credenciales de DEMOSTRACION del personal: una sola contrasena para los 8
// usuarios de ejemplo. Solo para el prototipo local; nunca usar en un entorno real.
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { hashPassword } from './auth/crypto.js';

export const DEMO_PASSWORD = 'Cinerama#2026';

export async function seedDemoCredentials(db) {
  const staff = db.prepare(`SELECT id FROM users WHERE role != 'customer'`).all();
  const set = db.prepare('UPDATE users SET password_hash = ?, created_at = COALESCE(created_at, ?) WHERE id = ?');
  const hashes = await Promise.all(staff.map(() => hashPassword(DEMO_PASSWORD)));
  db.transaction(() => staff.forEach((u, i) => set.run(hashes[i], Date.now(), u.id)))();
  return staff.length;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  let db;
  try { db = openDb(); } catch (e) {
    console.error(`\n[ERROR] No se pudo preparar los datos: ${e.message}\n`);
    process.exit(1);
  }
  const n = await seedDemoCredentials(db);
  console.log(`Contrasena de demostracion asignada a ${n} usuarios del personal (ver README).`);
  db.close();
}
