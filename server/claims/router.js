import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import { CLAIMS, REASONS, reasonText } from './config.js';
import { detectImage, createFileStore, STORED_NAME_RE } from './files.js';
import { claimCodeHash, contactHash, dniHash, verifyPassword } from '../auth/crypto.js';
import { DEMO_PASSWORD } from '../auth/config.js';
import { createThrottle } from '../auth/throttle.js';
import { assertOutsideRepo } from '../dataDir.js';
import { normalizeName, normalizeEmail, normalizeDni, normalizePhone, validateClaim } from '../../src/shared/validators.js';
import { POLICY_VERSION } from '../../src/shared/policy.js';

// Notas de privacidad: este modulo nunca escribe DNI, nombre, correo, celular ni codigos de reclamo
// en consola; los errores de disco solo registran su codigo (ENOENT, EACCES...).

const ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'; // Crockford: sin I, L, O, U
export const newClaimCode = () => Array.from({ length: 12 }, () => ALPHABET[crypto.randomInt(32)]).join('');
export const formatClaimCode = (c) => c.match(/.{4}/g).join('-');
// Normaliza lo que escribe la persona (minusculas, guiones, espacios; I/L -> 1, O -> 0). null si no es un codigo valido.
export function normalizeClaimCode(v) {
  if (typeof v !== 'string' || v.length > 40) return null;
  const s = v.toUpperCase().replace(/[\s-]/g, '').replace(/[IL]/g, '1').replace(/O/g, '0');
  return /^[0-9A-HJKMNP-TV-Z]{12}$/.test(s) ? s : null;
}

const IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const maskEmail = (e) => { const [u, d] = String(e).split('@'); return `${u[0] ?? ''}***@${d ?? ''}`; };
const fold = (s) => String(s ?? '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().split(/\s+/).filter(Boolean);

export function createClaims(db, auth, opts = {}) {
  const { clock = Date.now, dbFile, log = console } = opts;
  const { pepper, loadSession, requireAuth, requireTier } = auth;
  const throttle = createThrottle(db, clock);

  // Directorio privado de archivos: dentro del directorio de datos (fuera del repo), 0700.
  const claimsDir = opts.claimsDir ?? path.join(path.dirname(dbFile), 'claims');
  assertOutsideRepo(claimsDir);
  fs.mkdirSync(claimsDir, { recursive: true, mode: 0o700 });
  fs.chmodSync(claimsDir, 0o700);
  const store = createFileStore(claimsDir, log);

  const q = {
    userByDni: db.prepare('SELECT * FROM users WHERE dni_hash = ?'),
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT id FROM users WHERE lower(email) = ?'),
    userByPhone: db.prepare('SELECT id FROM users WHERE phone = ?'),
    ordersOf: db.prepare('SELECT COUNT(*) c FROM orders WHERE user_id = ?'),
    claimByCode: db.prepare('SELECT * FROM claims WHERE code_hash = ?'),
    claimById: db.prepare('SELECT * FROM claims WHERE id = ?'),
    insertClaim: db.prepare(`INSERT INTO claims (code_hash,status,name,email,phone,dni_plain,dni_hash,dni_hint,contact_hash,consent_at,consent_version,created_at)
      VALUES (@code_hash,'draft',@name,@email,@phone,@dni_plain,@dni_hash,@dni_hint,@contact_hash,@now,@policy,@now)`),
    openByDni: db.prepare(`SELECT COUNT(*) c FROM claims WHERE dni_hash = ? AND status IN ('draft','pending')`),
    openTotal: db.prepare(`SELECT COUNT(*) c FROM claims WHERE status IN ('draft','pending')`),
    filesOf: db.prepare('SELECT * FROM claim_files WHERE claim_id = ? ORDER BY id'),
    fileOf: db.prepare('SELECT * FROM claim_files WHERE claim_id = ? AND kind = ?'),
    insertFile: db.prepare('INSERT INTO claim_files (claim_id,kind,stored_name,mime,size,created_at) VALUES (?,?,?,?,?,?)'),
    deleteFileRow: db.prepare('DELETE FROM claim_files WHERE id = ?'),
    pendingFiles: db.prepare(`SELECT id, stored_name FROM claim_files WHERE delete_state = 'delete_pending'`),
    markFiles: db.prepare(`UPDATE claim_files SET delete_state = 'delete_pending' WHERE claim_id = ?`),
    knownNames: db.prepare('SELECT stored_name FROM claim_files'),
    submit: db.prepare(`UPDATE claims SET status='pending', submitted_at=? WHERE id=? AND status='draft'`),
    resolve: db.prepare(`UPDATE claims SET status=@status, resolved_at=@now, resolved_by=@by, reason_code=@reason, reason_note=@note,
      target_user_id=@target, reserved_until=@reserved, contact_hash=@contact, name=NULL, email=NULL, phone=NULL, dni_plain=NULL
      WHERE id=@id AND status IN ('draft','pending')`),
    openOthers: db.prepare(`SELECT id, name, status, submitted_at FROM claims WHERE dni_hash = ? AND id != ? AND status IN ('draft','pending')`),
    expireDrafts: db.prepare(`SELECT id FROM claims WHERE status='draft' AND created_at < ?`),
    expirePending: db.prepare(`SELECT id FROM claims WHERE status='pending' AND submitted_at < ?`),
    clearContact: db.prepare('UPDATE claims SET contact_hash = NULL WHERE contact_hash IS NOT NULL AND reserved_until < ?'),
    suspend: db.prepare(`UPDATE users SET status='suspended', dni_hash=NULL, pending_token_hash=NULL WHERE id=?`),
    tombEmail: db.prepare('UPDATE users SET email = ? WHERE id = ?'),
    tombPhone: db.prepare('UPDATE users SET phone = NULL WHERE id = ?'),
    dropSessions: db.prepare('DELETE FROM sessions WHERE user_id = ?'),
    adminHashes: db.prepare(`SELECT password_hash FROM users WHERE role='admin' AND status='active' AND password_hash IS NOT NULL`),
  };

  // ── borrado de archivos: primero se marca en la BD, luego se borra del disco ──
  // Devuelve cuantos archivos quedaron sin borrar (0 = todo borrado).
  const purgeMarked = () => {
    for (const f of q.pendingFiles.all()) if (store.remove(f.stored_name)) q.deleteFileRow.run(f.id);
    return q.pendingFiles.all().length;
  };
  const markClaimFiles = (id) => q.markFiles.run(id);
  const claimHasPendingDelete = (id) => q.filesOf.all(id).some((f) => f.delete_state === 'delete_pending');

  // Cierra un reclamo sin identidad (borrador o pendiente vencido): anula datos personales y marca archivos.
  const closeSilently = (id, status, reason, now) => {
    q.resolve.run({ id, status, now, by: null, reason, note: null, target: null, reserved: null, contact: null });
    markClaimFiles(id);
  };

  // ── mantenimiento: caducidades, reintento de borrados, archivos huerfanos ──
  function sweep() {
    const now = clock();
    db.transaction(() => {
      for (const c of q.expireDrafts.all(now - CLAIMS.DRAFT_TTL)) closeSilently(c.id, 'expired', 'expired', now);
      for (const c of q.expirePending.all(now - CLAIMS.PENDING_TTL)) closeSilently(c.id, 'expired', 'expired', now);
      q.clearContact.run(now);
    })();
    const left = purgeMarked();
    // Huerfanos: archivos del directorio sin fila (p. ej. un fallo entre escribir y registrar).
    const known = new Set(q.knownNames.all().map((r) => r.stored_name));
    for (const name of store.list()) {
      const base = name.replace(/\.part$/, '');
      if (!STORED_NAME_RE.test(base) || (name === base && known.has(base))) continue;
      let age;
      try { age = now - store.statMtime(name); } catch { continue; }
      if (age > CLAIMS.ORPHAN_AGE) store.removeRaw(name);
    }
    return { pendingDeletes: left };
  }

  // ── utilidades de peticion ──
  const clientCode = (req) => normalizeClaimCode(req.headers['x-claim-code'] ?? req.body?.code);
  const failKey = (req) => `claim:codefail:ip:${req.ip}`;
  // Busca el reclamo por codigo. Un codigo desconocido cuenta como fallo del IP.
  const findByCode = (req, res) => {
    const lock = throttle.check(failKey(req));
    if (lock.locked) { res.status(429).json({ error: 'too_many_attempts', retryAfter: lock.retryAfter }); return null; }
    const code = clientCode(req);
    const row = code ? q.claimByCode.get(claimCodeHash(pepper, code)) : null;
    if (!row) {
      throttle.hit(failKey(req), CLAIMS.CODE_FAIL_IP);
      res.status(404).json({ error: 'not_found' });
      return null;
    }
    return row;
  };
  const draftOnly = (row, res) => {
    if (row.status !== 'draft') { res.status(409).json({ error: 'not_draft' }); return false; }
    if (clock() - row.created_at >= CLAIMS.DRAFT_TTL) { sweep(); res.status(410).json({ error: 'draft_expired' }); return false; }
    return true;
  };
  const uploaded = (id) => q.filesOf.all(id).filter((f) => f.delete_state === 'stored');

  // ═════════════ rutas publicas ═════════════
  const router = express.Router();

  router.post('/', (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const errors = validateClaim(body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'validation', errors });

    const probe = `claim:probe:ip:${req.ip}`;
    const create = `claim:create:ip:${req.ip}`;
    for (const k of [probe, create]) {
      const l = throttle.check(k);
      if (l.locked) return res.status(429).json({ error: 'too_many_attempts', retryAfter: l.retryAfter });
    }
    throttle.hit(probe, CLAIMS.PROBE_IP);
    sweep();

    const name = normalizeName(body.name);
    const email = normalizeEmail(body.email);
    const dni = normalizeDni(body.dni);
    const phone = normalizePhone(body.phone);
    const dniH = dniHash(pepper, dni);

    // P9: sin cuenta con ese DNI no hay nada que reclamar (misma informacion que ya da /register).
    if (!q.userByDni.get(dniH)) return res.status(409).json({ error: 'no_account_for_dni' });
    if (q.openByDni.get(dniH).c >= CLAIMS.MAX_OPEN_PER_DNI) return res.status(409).json({ error: 'too_many_open' });
    if (q.openTotal.get().c >= CLAIMS.MAX_OPEN_TOTAL) return res.status(503).json({ error: 'claims_full' });

    const now = clock();
    const code = newClaimCode();
    q.insertClaim.run({
      code_hash: claimCodeHash(pepper, code), name, email, phone, dni_plain: dni, dni_hash: dniH, dni_hint: dni.slice(-3),
      contact_hash: contactHash(pepper, email), now, policy: POLICY_VERSION,
    });
    throttle.hit(create, CLAIMS.CREATE_IP);
    res.status(201).json({
      code: formatClaimCode(code),
      draftExpiresAt: now + CLAIMS.DRAFT_TTL,
      limits: { maxBytes: CLAIMS.MAX_FILE, required: CLAIMS.REQUIRED, optional: ['selfie'], types: IMAGE_TYPES },
    });
  });

  // Antes de leer el cuerpo (hasta 5 MB): tipo valido, codigo valido, limites y concurrencia.
  let inFlight = 0;
  const preUpload = (req, res, next) => {
    const kind = req.params.kind;
    if (!CLAIMS.KINDS.includes(kind)) return res.status(400).json({ error: 'bad_kind' });
    const key = `claim:upload:ip:${req.ip}`;
    const l = throttle.check(key);
    if (l.locked) return res.status(429).json({ error: 'too_many_attempts', retryAfter: l.retryAfter });
    const row = findByCode(req, res);
    if (!row || !draftOnly(row, res)) return undefined;
    if (inFlight >= CLAIMS.UPLOAD_CONCURRENCY) {
      res.set('Retry-After', '2');
      return res.status(503).json({ error: 'busy' });
    }
    throttle.hit(key, CLAIMS.UPLOAD_IP);
    req.claim = row;
    inFlight += 1;
    let done = false;
    const release = () => { if (!done) { done = true; inFlight -= 1; } };
    res.on('close', release);
    return next();
  };

  router.put('/files/:kind', preUpload, express.raw({ type: IMAGE_TYPES, limit: CLAIMS.MAX_FILE }), (req, res) => {
    const buf = Buffer.isBuffer(req.body) ? req.body : null;
    if (!buf || buf.length === 0) return res.status(400).json({ error: 'file_empty' });
    if (buf.length < CLAIMS.MIN_FILE) return res.status(415).json({ error: 'unsupported_type' });
    const info = detectImage(buf);
    if (info.error === 'heic') return res.status(415).json({ error: 'heic_not_supported' });
    if (info.error) return res.status(415).json({ error: info.error === 'corrupt' ? 'corrupt_file' : 'unsupported_type' });

    const claim = q.claimById.get(req.claim.id);
    if (claim.status !== 'draft') return res.status(409).json({ error: 'not_draft' });
    const name = store.write(buf);
    const kind = req.params.kind;
    try {
      db.transaction(() => {
        const old = q.fileOf.get(claim.id, kind);
        if (old) q.deleteFileRow.run(old.id);
        q.insertFile.run(claim.id, kind, name, info.mime, buf.length, clock());
        if (old) store.remove(old.stored_name);
      })();
    } catch (e) {
      store.remove(name);
      throw e;
    }
    res.json({ kind, size: buf.length, mime: info.mime });
  });

  router.delete('/files/:kind', (req, res) => {
    if (req.params.kind !== 'selfie') return res.status(400).json({ error: 'bad_kind' });
    const row = findByCode(req, res);
    if (!row || !draftOnly(row, res)) return;
    const f = q.fileOf.get(row.id, 'selfie');
    if (f) { q.deleteFileRow.run(f.id); store.remove(f.stored_name); }
    res.json({ kind: 'selfie', removed: Boolean(f) });
  });

  router.post('/submit', (req, res) => {
    const row = findByCode(req, res);
    if (!row || !draftOnly(row, res)) return;
    const have = new Set(uploaded(row.id).map((f) => f.kind));
    const missing = CLAIMS.REQUIRED.filter((k) => !have.has(k));
    if (missing.length) return res.status(422).json({ error: 'missing_files', missing });
    const now = clock();
    q.submit.run(now, row.id);
    res.json({ status: 'pending', submittedAt: now, expiresAt: now + CLAIMS.PENDING_TTL });
  });

  router.post('/status', (req, res) => {
    const key = `claim:status:ip:${req.ip}`;
    const l = throttle.check(key);
    if (l.locked) return res.status(429).json({ error: 'too_many_attempts', retryAfter: l.retryAfter });
    throttle.hit(key, CLAIMS.STATUS_IP);
    const row = findByCode(req, res);
    if (!row) return;
    res.set('Cache-Control', 'no-store');
    // Solo el estado y lo que se le dice a quien reclamo: nada de nombre, DNI, contacto ni datos de cuentas.
    const out = { status: row.status, submittedAt: row.submitted_at, resolvedAt: row.resolved_at };
    if (['approved', 'rejected', 'superseded', 'expired'].includes(row.status)) {
      out.reason = { code: row.reason_code, text: reasonText(row.reason_code), note: row.reason_note };
    }
    if (row.status === 'approved') out.reservedUntil = row.reserved_until;
    if (row.status === 'draft') out.draftExpiresAt = row.created_at + CLAIMS.DRAFT_TTL;
    if (row.status === 'pending') out.expiresAt = row.submitted_at + CLAIMS.PENDING_TTL;
    res.json(out);
  });

  // ═════════════ administracion (solo central) ═════════════
  // Mientras algun admin central conserve la contrasena de demostracion, todo queda bloqueado.
  const demoCache = new Map(); // password_hash -> bool
  const hasDemoPassword = async () => {
    for (const { password_hash: h } of q.adminHashes.all()) {
      if (!demoCache.has(h)) {
        if (demoCache.size > 50) demoCache.clear();
        demoCache.set(h, await verifyPassword(DEMO_PASSWORD, h));
      }
      if (demoCache.get(h)) return true;
    }
    return false;
  };
  const demoGate = async (_req, res, next) => {
    if (await hasDemoPassword()) return res.status(403).json({ error: 'demo_password' });
    return next();
  };

  const adminRouter = express.Router();
  adminRouter.use(loadSession, requireAuth, requireTier('central'), (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); }, demoGate);

  const listItem = (c) => ({
    id: c.id, name: c.name, dniHint: c.dni_hint, status: c.status, submittedAt: c.submitted_at, resolvedAt: c.resolved_at,
    reasonCode: c.reason_code, files: q.filesOf.all(c.id).filter((f) => f.delete_state === 'stored').length,
    othersOpen: q.openOthers.all(c.dni_hash, c.id).length,
  });

  adminRouter.get('/', (req, res) => {
    sweep();
    const which = req.query.status;
    const sql = which === 'resolved'
      ? `SELECT * FROM claims WHERE status IN ('approved','rejected','superseded','expired') ORDER BY resolved_at DESC, id DESC LIMIT 100`
      : which === 'all'
        ? `SELECT * FROM claims WHERE status != 'draft' ORDER BY COALESCE(resolved_at, submitted_at) DESC, id DESC LIMIT 100`
        : `SELECT * FROM claims WHERE status = 'pending' ORDER BY submitted_at ASC, id ASC LIMIT 100`;
    res.json({ claims: db.prepare(sql).all().map(listItem), pendingDeletes: q.pendingFiles.all().length });
  });

  const idParam = (req, res) => {
    const id = Number(req.params.id);
    const row = Number.isInteger(id) && id > 0 ? q.claimById.get(id) : null;
    if (!row || row.status === 'draft') { res.status(404).json({ error: 'not_found' }); return null; }
    return row;
  };

  const targetOf = (claim) => {
    const u = q.userByDni.get(claim.dni_hash);
    if (!u) return null;
    return {
      id: u.id, name: u.name, emailMasked: maskEmail(u.email), role: u.role, status: u.status,
      createdAt: u.created_at ?? null, lastLogin: u.last_login ?? null, orders: q.ordersOf.get(u.id).c,
    };
  };

  adminRouter.get('/:id', (req, res) => {
    const c = idParam(req, res);
    if (!c) return;
    const pending = c.status === 'pending';
    const target = pending ? targetOf(c) : null;
    const warnings = [];
    if (pending) {
      if (!target) warnings.push('no_target');
      else {
        if (target.role !== 'customer') warnings.push('target_is_staff');
        if (target.status === 'active') warnings.push('target_active');
        if (target.orders > 0) warnings.push('target_has_orders');
        const a = new Set(fold(c.name)), b = fold(target.name);
        if (b.length && b.every((t) => a.has(t))) warnings.push('name_matches');
      }
      const em = q.userByEmail.get(c.email), ph = q.userByPhone.get(c.phone);
      if (em && em.id !== target?.id) warnings.push('email_in_use');
      if (ph && ph.id !== target?.id) warnings.push('phone_in_use');
    }
    const others = pending ? q.openOthers.all(c.dni_hash, c.id).filter((o) => o.status === 'pending') : [];
    res.json({
      id: c.id, status: c.status, name: c.name, dni: pending ? c.dni_plain : null, dniHint: c.dni_hint,
      email: c.email, phone: c.phone, submittedAt: c.submitted_at, resolvedAt: c.resolved_at,
      reasonCode: c.reason_code, reasonNote: c.reason_note, reservedUntil: c.reserved_until, expiresAt: c.submitted_at ? c.submitted_at + CLAIMS.PENDING_TTL : null,
      files: pending ? uploaded(c.id).map((f) => ({ kind: f.kind, size: f.size, mime: f.mime })) : [],
      deletePending: claimHasPendingDelete(c.id),
      target, warnings, requiresAck: Boolean(target && target.role === 'customer' && target.status === 'active'),
      otherOpenClaims: others.map((o) => ({ id: o.id, name: o.name, submittedAt: o.submitted_at })),
      reasons: { approve: Object.keys(REASONS.approve), reject: Object.keys(REASONS.reject) },
    });
  });

  adminRouter.get('/:id/files/:kind', (req, res) => {
    const c = idParam(req, res);
    if (!c || c.status !== 'pending' || !CLAIMS.KINDS.includes(req.params.kind)) return res.status(404).json({ error: 'not_found' });
    const f = q.fileOf.get(c.id, req.params.kind);
    if (!f || f.delete_state !== 'stored') return res.status(404).json({ error: 'not_found' });
    let data;
    try { data = store.read(f.stored_name); } catch { return res.status(404).json({ error: 'not_found' }); }
    const ext = f.mime === 'image/png' ? 'png' : f.mime === 'image/webp' ? 'webp' : 'jpg';
    res.set({
      'Content-Type': f.mime,
      'Content-Length': String(data.length),
      'Content-Disposition': `${req.query.download ? 'attachment' : 'inline'}; filename="reclamo-${c.id}-${f.kind}.${ext}"`,
      'Cache-Control': 'no-store',
      Pragma: 'no-cache',
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cross-Origin-Resource-Policy': 'same-origin',
      'Referrer-Policy': 'no-referrer',
    });
    res.end(data);
  });

  const cleanNote = (v) => (typeof v === 'string' ? v.trim().replace(/\s+/g, ' ').slice(0, CLAIMS.NOTE_MAX) : '');

  adminRouter.post('/:id/reject', (req, res) => {
    const c = idParam(req, res);
    if (!c) return;
    const reason = req.body?.reasonCode;
    const note = cleanNote(req.body?.note);
    if (typeof reason !== 'string' || !REASONS.reject[reason]) return res.status(400).json({ error: 'reason_required' });
    if (reason === 'other' && !note) return res.status(400).json({ error: 'note_required' });
    const now = clock();
    const ok = db.transaction(() => {
      const r = q.resolve.run({ id: c.id, status: 'rejected', now, by: req.user.id, reason, note: note || null, target: null, reserved: null, contact: null });
      if (r.changes !== 1) return false;
      markClaimFiles(c.id);
      return true;
    })();
    if (!ok) return res.status(409).json({ error: 'not_pending' });
    const left = purgeMarked();
    res.json({ status: 'rejected', filesPurged: left === 0 });
  });

  adminRouter.post('/:id/approve', (req, res) => {
    const c = idParam(req, res);
    if (!c) return;
    if (req.body?.confirm !== true) return res.status(400).json({ error: 'confirm_required' });
    const note = cleanNote(req.body?.note);
    const now = clock();
    let result;
    try {
      result = db.transaction(() => {
        const fresh = q.claimById.get(c.id);
        if (fresh.status !== 'pending') throw Object.assign(new Error('x'), { claim: 'not_pending', status: 409 });
        const target = q.userByDni.get(fresh.dni_hash);
        if (target && target.role !== 'customer') throw Object.assign(new Error('x'), { claim: 'target_is_staff', status: 409 });
        if (target && target.status === 'active' && req.body?.ackActiveAccount !== true) {
          throw Object.assign(new Error('x'), { claim: 'ack_required', status: 409 });
        }
        let tombstoned = [];
        if (target) {
          q.suspend.run(target.id);
          q.dropSessions.run(target.id);
          // El titular legitimo (misma persona que la cuenta) podra registrarse de nuevo con su correo y celular.
          if (target.email && target.email.toLowerCase() === fresh.email) {
            q.tombEmail.run(`suspendida-${target.id}@cinerama.invalid`, target.id); tombstoned.push('email');
          }
          if (target.phone && target.phone === fresh.phone) { q.tombPhone.run(target.id); tombstoned.push('phone'); }
        }
        const reserved = now + CLAIMS.RESERVE_TTL;
        q.resolve.run({
          id: fresh.id, status: 'approved', now, by: req.user.id, reason: 'verified', note: note || null,
          target: target?.id ?? null, reserved, contact: fresh.contact_hash,
        });
        markClaimFiles(fresh.id);
        // P11: los demas reclamos abiertos por el mismo DNI quedan cerrados.
        const others = q.openOthers.all(fresh.dni_hash, fresh.id);
        for (const o of others) closeSilently(o.id, 'superseded', 'superseded', now);
        return { target: target?.id ?? null, suspended: Boolean(target), tombstoned, superseded: others.length, reservedUntil: reserved };
      })();
    } catch (e) {
      if (e.claim) return res.status(e.status).json({ error: e.claim });
      throw e;
    }
    const left = purgeMarked();
    res.json({ status: 'approved', targetSuspended: result.suspended, tombstoned: result.tombstoned, superseded: result.superseded, reservedUntil: result.reservedUntil, filesPurged: left === 0 });
  });

  const timer = setInterval(() => { try { sweep(); } catch { log.error('[claims] fallo el barrido de mantenimiento'); } }, CLAIMS.SWEEP_EVERY);
  timer.unref();
  try { sweep(); } catch { log.error('[claims] fallo el barrido inicial'); }

  return { router, adminRouter, sweep, claimsDir, stop: () => clearInterval(timer) };
}
