import { openDb, DB_FILE } from './db.js';
import { createApp } from './app.js';
import { todayInLima } from '../src/data/limaDate.js';

const PORT = Number(process.env.PORT) || 3001;
const HOST = '127.0.0.1';

const db = openDb();
const { app } = createApp(db, { dbFile: DB_FILE });

// Aviso si no hay funciones de hoy en adelante (fecha de Lima, igual que el cliente).
const today = todayInLima();
const upcoming = db.prepare('SELECT COUNT(*) c FROM screenings WHERE starts_on >= ?').get(today).c;
if (upcoming === 0) {
  console.warn('\n[AVISO] No hay funciones con fecha de hoy en adelante: el sitio no mostrara horarios.');
  console.warn('        Ejecuta "npm run seed" para refrescar las fechas de las funciones de ejemplo.\n');
}

// Aviso si hay personal sin contrasena (BD anterior a la fase 2).
const noPass = db.prepare(`SELECT COUNT(*) c FROM users WHERE role != 'customer' AND password_hash IS NULL`).get().c;
if (noPass > 0) {
  console.warn(`\n[AVISO] ${noPass} usuario(s) del personal no tienen contrasena y no podran iniciar sesion.`);
  console.warn('        Ejecuta "npm run seed:auth" para asignar la contrasena de demostracion (ver README).\n');
}

const server = app.listen(PORT, HOST, () => console.log(`API Cinerama en http://${HOST}:${PORT} (BD: ${DB_FILE})`));
const stop = () => { server.close(); db.close(); process.exit(0); };
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
