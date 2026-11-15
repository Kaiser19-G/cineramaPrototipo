import crypto from 'node:crypto';
import express from 'express';
import { AUTH } from '../auth/config.js';
import { createDemoGate } from '../auth/demoGate.js';
import { createThrottle } from '../auth/throttle.js';
import { hashPassword } from '../auth/crypto.js';
import { normalizeName, normalizeEmail, EMAIL_RE } from '../../src/shared/validators.js';
import { createAudit, failValidation } from './common.js';

const STAFF_ROLES = ['admin', 'manager', 'cashier', 'support', 'operator'];
const EDITABLE_STATUSES = ['active', 'inactive'];
const ALL_STATUSES = ['active', 'inactive', 'suspended', 'pending_verification'];
const PAGE_SIZE = 50;
const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

const maskEmail = (e) => { const [u, d] = String(e).split('@'); return `${u?.[0] ?? ''}***@${d ?? ''}`; };
const maskPhone = (p) => (p ? `${p[0]}** *** ${p.slice(-3)}` : null);

// Contrasena temporal legible (sin caracteres ambiguos), aleatoria del sistema operativo: 3 grupos de 5.
const TEMP_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';
export const newTemporaryPassword = () => Array.from({ length: 3 }, () => Array.from({ length: 5 }, () => TEMP_ALPHABET[crypto.randomInt(TEMP_ALPHABET.length)]).join('')).join('-');

// Rutas de usuarios (solo administrador central, y solo si ningun admin central conserva la contrasena de demostracion).
// Nunca devuelven password_hash, dni_hash, DNI completo, celular completo (clientes) ni tokens.
export function createUsers(db, auth, opts = {}) {
  const { clock = Date.now } = opts;
  const audit = createAudit(db, clock);
  const throttle = createThrottle(db, clock);
  const { demoGate } = createDemoGate(db);

  const q = {
    byId: db.prepare('SELECT * FROM users WHERE id = ?'),
    byEmail: db.prepare('SELECT id FROM users WHERE lower(email) = ?'),
    branch: db.prepare('SELECT id FROM branches WHERE id = ?'),
    insert: db.prepare(`INSERT INTO users (name,email,role,branch_id,status,avatar,password_hash,must_change_password,created_by,created_at,updated_at)
      VALUES (@name,@email,@role,@branch_id,'active',@avatar,@password_hash,1,@by,@now,@now)`),
    activeAdmins: db.prepare(`SELECT COUNT(*) c FROM users WHERE role = 'admin' AND status = 'active' AND id != ?`),
    dropSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    roleCounts: db.prepare(`SELECT role, COUNT(*) c FROM users WHERE role != 'customer' GROUP BY role`),
  };

  const staffOut = (u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, branchId: u.branch_id ?? null, status: u.status,
    lastLogin: u.last_login ?? null, createdAt: u.created_at ?? null, mustChangePassword: !!u.must_change_password,
  });
  const customerOut = (u) => ({
    id: u.id, name: u.name, emailMasked: maskEmail(u.email), dniHint: u.dni_hint ?? null, phoneMasked: maskPhone(u.phone),
    status: u.status, lastLogin: u.last_login ?? null, createdAt: u.created_at ?? null,
  });
  const bodyOf = (req) => (req.body && typeof req.body === 'object' && !Array.isArray(req.body) ? req.body : {});
  const parseId = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null; };
  const rateLimited = (req, res) => {
    const key = `tmppw:admin:${req.user.id}`;
    const l = throttle.check(key);
    if (l.locked) { res.status(429).json({ error: 'too_many_attempts', retryAfter: l.retryAfter }); return true; }
    throttle.hit(key, AUTH.TEMP_PASSWORD_ISSUE);
    return false;
  };
  const noStore = (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); };
  const guard = [auth.loadSession, auth.requireAuth, auth.requireTier('central'), noStore, demoGate];

  const router = express.Router();
  router.use(...guard);

  router.get('/', (req, res) => {
    const kind = req.query.kind ?? 'staff';
    const errors = {};
    if (!['staff', 'customer'].includes(kind)) errors.kind = 'invalid_option';
    const status = req.query.status;
    if (status !== undefined && !ALL_STATUSES.includes(status)) errors.status = 'invalid_option';
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isInteger(page) || page < 1) errors.page = 'invalid';
    const branch = req.query.branchId === undefined ? null : Number(req.query.branchId);
    if (branch !== null && (!Number.isInteger(branch) || branch < 1)) errors.branchId = 'invalid';
    const role = req.query.role;
    if (role !== undefined && !STAFF_ROLES.includes(role)) errors.role = 'invalid_option';
    const text = typeof req.query.q === 'string' ? req.query.q.trim().toLowerCase() : '';
    if (text.length > 80) errors.q = 'too_long';
    if (Object.keys(errors).length) return failValidation(res, errors);

    const where = [kind === 'staff' ? `role != 'customer'` : `role = 'customer'`];
    const args = [];
    if (kind === 'customer') where.push(`status != 'pending_verification'`); // registros sin verificar no son cuentas todavia
    if (status) { where.push('status = ?'); args.push(status); }
    if (kind === 'staff' && branch !== null) { where.push('branch_id = ?'); args.push(branch); }
    if (kind === 'staff' && role) { where.push('role = ?'); args.push(role); }
    if (text) {
      where.push(`(lower(name) LIKE ? ESCAPE '\\' OR lower(email) LIKE ? ESCAPE '\\')`);
      const like = `%${text.replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
      args.push(like, like);
    }
    const sql = ` FROM users WHERE ${where.join(' AND ')}`;
    const total = db.prepare(`SELECT COUNT(*) c${sql}`).get(...args).c;
    const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    const rows = db.prepare(`SELECT *${sql} ORDER BY id LIMIT ? OFFSET ?`).all(...args, PAGE_SIZE, (page - 1) * PAGE_SIZE);
    const body = { users: rows.map(kind === 'staff' ? staffOut : customerOut), page, pageSize: PAGE_SIZE, total, pages };
    if (kind === 'staff') body.roleCounts = Object.fromEntries(q.roleCounts.all().map((r) => [r.role, r.c]));
    res.json(body);
  });

  // Registro de actividad (audit_log): solo ids y codigos; el nombre de quien actuo es de personal.
  router.get('/audit/log', (req, res) => {
    const page = req.query.page === undefined ? 1 : Number(req.query.page);
    if (!Number.isInteger(page) || page < 1) return failValidation(res, { page: 'invalid' });
    const total = db.prepare('SELECT COUNT(*) c FROM audit_log').get().c;
    const rows = db.prepare(`SELECT a.id, a.at, a.actor_id, u.name AS actor_name, a.action, a.entity, a.entity_id, a.branch_id, a.detail_json
      FROM audit_log a LEFT JOIN users u ON u.id = a.actor_id ORDER BY a.id DESC LIMIT ? OFFSET ?`).all(PAGE_SIZE, (page - 1) * PAGE_SIZE);
    res.json({
      entries: rows.map((r) => ({ id: r.id, at: r.at, actorId: r.actor_id, actorName: r.actor_name ?? null, action: r.action, entity: r.entity,
        entityId: r.entity_id, branchId: r.branch_id, detail: r.detail_json ? JSON.parse(r.detail_json) : null })),
      page, pageSize: PAGE_SIZE, total, pages: Math.max(1, Math.ceil(total / PAGE_SIZE)),
    });
  });

  // Valida rol y sede: el administrador central no tiene sede; los demas roles exigen una sede existente.
  const roleBranchErrors = (role, branchId) => {
    if (role === 'admin') return null;
    if (!Number.isInteger(branchId) || !q.branch.get(branchId)) return { branchId: branchId === undefined || branchId === null ? 'required' : 'invalid' };
    return null;
  };

  router.post('/', async (req, res) => {
    const b = bodyOf(req);
    const name = normalizeName(b.name);
    const email = normalizeEmail(b.email);
    const errors = {};
    if (typeof b.name !== 'string' || name.length < 2) errors.name = 'name_required'; else if (name.length > 100) errors.name = 'name_too_long';
    if (typeof b.email !== 'string' || !email) errors.email = 'email_required'; else if (!EMAIL_RE.test(email)) errors.email = 'email_invalid'; else if (email.length > 254) errors.email = 'email_too_long';
    if (!STAFF_ROLES.includes(b.role)) errors.role = b.role ? 'invalid_option' : 'required';
    else Object.assign(errors, roleBranchErrors(b.role, b.branchId) ?? {});
    if (Object.keys(errors).length) return failValidation(res, errors);
    if (rateLimited(req, res)) return;
    const temp = newTemporaryPassword();
    const password_hash = await hashPassword(temp);
    const out = db.transaction(() => {
      if (q.byEmail.get(email)) return { status: 409, body: { error: 'email_taken' } };
      const info = q.insert.run({ name, email, role: b.role, branch_id: b.role === 'admin' ? null : b.branchId, avatar: initials(name), password_hash, by: req.user.id, now: clock() });
      const id = Number(info.lastInsertRowid);
      audit(req, 'user.create', 'user', id, b.role === 'admin' ? null : b.branchId, { role: b.role });
      return { status: 201, body: { user: staffOut(q.byId.get(id)), temporaryPassword: temp } };
    }).immediate();
    res.status(out.status).json(out.body);
  });

  router.patch('/:id', (req, res) => {
    const b = bodyOf(req);
    const id = parseId(req);
    const given = ['name', 'role', 'branchId', 'status'].filter((k) => b[k] !== undefined);
    const errors = {};
    if (given.includes('name')) { const n = normalizeName(b.name); if (typeof b.name !== 'string' || n.length < 2) errors.name = 'name_required'; else if (n.length > 100) errors.name = 'name_too_long'; }
    if (given.includes('role') && !STAFF_ROLES.includes(b.role)) errors.role = 'invalid_option';
    if (given.includes('status') && !ALL_STATUSES.includes(b.status)) errors.status = 'invalid_option';
    if (given.includes('branchId') && b.branchId !== null && !Number.isInteger(b.branchId)) errors.branchId = 'invalid';
    if (!given.length) errors.body = 'empty';
    if (Object.keys(errors).length) return failValidation(res, errors);
    const out = db.transaction(() => {
      const u = id && q.byId.get(id);
      if (!u) return { status: 404, body: { error: 'not_found' } };
      if (u.role === 'customer') return { status: 409, body: { error: 'not_staff' } };
      const self = u.id === req.user.id;
      if (self && (given.includes('role') && b.role !== u.role)) return { status: 409, body: { error: 'cannot_modify_self', field: 'role' } };
      if (self && given.includes('status') && b.status !== u.status) return { status: 409, body: { error: 'cannot_modify_self', field: 'status' } };
      if (given.includes('status') && b.status !== u.status) {
        if (!EDITABLE_STATUSES.includes(b.status) || !EDITABLE_STATUSES.includes(u.status)) return { status: 409, body: { error: 'status_locked', status: u.status } };
      }
      const role = given.includes('role') ? b.role : u.role;
      const status = given.includes('status') ? b.status : u.status;
      let branchId = u.branch_id;
      if (role === 'admin') branchId = null;
      else if (given.includes('branchId')) branchId = b.branchId;
      const be = roleBranchErrors(role, branchId);
      if (be) return { status: 400, body: { error: 'validation', errors: be } };
      const leavesAdmin = u.role === 'admin' && u.status === 'active' && (role !== 'admin' || status !== 'active');
      if (leavesAdmin && q.activeAdmins.get(u.id).c === 0) return { status: 409, body: { error: 'last_admin' } };
      const name = given.includes('name') ? normalizeName(b.name) : u.name;
      const changed = [];
      if (name !== u.name) changed.push('name');
      if (role !== u.role) changed.push('role');
      if ((branchId ?? null) !== (u.branch_id ?? null)) changed.push('branchId');
      if (status !== u.status) changed.push('status');
      if (changed.length) {
        db.prepare('UPDATE users SET name = ?, role = ?, branch_id = ?, status = ?, avatar = ?, updated_at = ? WHERE id = ?')
          .run(name, role, branchId, status, changed.includes('name') ? initials(name) : u.avatar, clock(), u.id);
        // Al desactivar o cambiar de rol se cierran sus sesiones (cambiar de sede surte efecto en la siguiente peticion).
        if (changed.includes('role') || (changed.includes('status') && status !== 'active')) q.dropSessions.run(u.id);
        audit(req, 'user.update', 'user', u.id, branchId, { fields: changed });
      }
      return { status: 200, body: { user: staffOut(q.byId.get(u.id)) } };
    }).immediate();
    res.status(out.status).json(out.body);
  });

  router.post('/:id/reset-password', async (req, res) => {
    const id = parseId(req);
    const pre = id && q.byId.get(id);
    if (!pre) return res.status(404).json({ error: 'not_found' });
    if (pre.role === 'customer') return res.status(409).json({ error: 'not_staff' });
    if (pre.id === req.user.id) return res.status(409).json({ error: 'cannot_modify_self' });
    if (!EDITABLE_STATUSES.includes(pre.status)) return res.status(409).json({ error: 'status_locked', status: pre.status });
    if (rateLimited(req, res)) return;
    const temp = newTemporaryPassword();
    const hash = await hashPassword(temp);
    const out = db.transaction(() => {
      const u = q.byId.get(id);
      if (!u || u.role === 'customer' || !EDITABLE_STATUSES.includes(u.status)) return { status: 409, body: { error: 'not_staff' } };
      db.prepare('UPDATE users SET password_hash = ?, must_change_password = 1, updated_at = ? WHERE id = ?').run(hash, clock(), u.id);
      q.dropSessions.run(u.id);
      audit(req, 'user.reset_password', 'user', u.id, u.branch_id ?? null, null);
      return { status: 200, body: { user: staffOut(q.byId.get(u.id)), temporaryPassword: temp } };
    }).immediate();
    res.status(out.status).json(out.body);
  });

  return { router };
}
