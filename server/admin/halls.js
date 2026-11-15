import express from 'express';
import { nowInLima } from '../../src/data/limaDate.js';
import { screeningSpan } from '../../src/shared/scheduling.js';
import { mapHall } from '../mappers.js';
import { branchScope, failValidation, createAudit } from './common.js';

// Mantenimiento de salas: gerente en su sede (block_hall), administrador central en cualquiera (edit_hall).
export function createHalls(db, opts = {}) {
  const { clock = Date.now } = opts;
  const audit = createAudit(db, clock);
  const q = {
    hall: db.prepare('SELECT * FROM halls WHERE id = ?'),
    setStatus: db.prepare('UPDATE halls SET status = ? WHERE id = ?'),
    upcoming: db.prepare(`SELECT id, starts_on, start_time, end_time, status FROM screenings
      WHERE hall_id = ? AND status NOT IN ('cancelled','finished') ORDER BY starts_on, start_time`),
  };
  const router = express.Router();
  router.patch('/:id', (req, res) => {
    const perms = req.user.perms ?? [];
    if (!perms.includes('block_hall') && !perms.includes('edit_hall')) return res.status(403).json({ error: 'forbidden' });
    const id = Number(req.params.id);
    const scope = branchScope(req);
    const status = req.body?.status;
    if (!['active', 'maintenance'].includes(status)) return failValidation(res, { status: status ? 'invalid_option' : 'required' });
    const out = db.transaction(() => {
      const hall = Number.isInteger(id) && q.hall.get(id);
      if (!hall || !(scope === null || (scope !== 'none' && hall.branch_id === scope))) return { status: 404, body: { error: 'not_found' } };
      if (hall.status !== status && status === 'maintenance') {
        const nowAbs = nowInLima(new Date(clock())).abs;
        const future = q.upcoming.all(id).filter((s) => screeningSpan(s.starts_on, s.start_time, s.end_time).start > nowAbs);
        if (future.length) {
          return { status: 409, body: { error: 'has_future_screenings', count: future.length,
            screenings: future.slice(0, 20).map((s) => ({ id: s.id, date: s.starts_on, startTime: s.start_time })) } };
        }
      }
      if (hall.status !== status) {
        q.setStatus.run(status, id);
        audit(req, status === 'maintenance' ? 'hall.maintenance_on' : 'hall.maintenance_off', 'hall', id, hall.branch_id, null);
      }
      return { status: 200, body: { hall: mapHall(q.hall.get(id)) } };
    }).immediate();
    res.status(out.status).json(out.body);
  });
  return { router };
}
