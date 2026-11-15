import express from 'express';
import { mapAdminScreening } from '../mappers.js';
import { branchScope } from './common.js';

// Solo lectura en la entrega 3a: la pantalla Programacion sigue leyendo funciones (todas, tambien borradores y
// canceladas) mientras llegan las rutas de escritura de la 3b. El personal de sede ve solo su sede.
export function createScreenings(db) {
  const all = db.prepare('SELECT * FROM screenings ORDER BY id');
  const byBranch = db.prepare('SELECT * FROM screenings WHERE branch_id = ? ORDER BY id');
  const router = express.Router();
  router.get('/', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const scope = branchScope(req);
    if (scope === 'none') return res.json({ screenings: [] });
    res.json({ screenings: (scope === null ? all.all() : byBranch.all(scope)).map(mapAdminScreening) });
  });
  return { router };
}
