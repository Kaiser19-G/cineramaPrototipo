import express from 'express';
import { AUTH, HOUR } from './config.js';
import {
  hashPassword, verifyPassword, dummyVerify, sha256, randomToken, randomCode, safeEqualHex, dniHash, loadPepper, contactHash,
} from './crypto.js';
import { createThrottle } from './throttle.js';
import {
  validateRegistration, normalizeName, normalizeEmail, normalizeDni, normalizePhone,
} from '../../src/shared/validators.js';
import { PERMS, tierOf, isStaffTier } from '../../src/shared/permissions.js';

// Notas de privacidad: este modulo nunca escribe DNI, correo ni celular en consola.
// Con SMS simulado solo se registra "usuario #id" y el codigo de prueba.

const limaStamp = (ms) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(new Date(ms)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
};

const CLAIM_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const initials = (name) => name.split(' ').filter(Boolean).slice(0, 2).map((w) => w[0]).join('').toUpperCase();

export function parseCookies(header = '') {
  const out = {};
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = part.slice(i + 1).trim();
  }
  return out;
}

export function createAuth(db, opts = {}) {
  const {
    clock = Date.now,
    simulateSms = process.env.SIMULATE_SMS !== '0' && process.env.NODE_ENV !== 'production',
    cookieSecure = process.env.COOKIE_SECURE === '1',
    dbFile,
    log = console,
  } = opts;
  const pepper = loadPepper(dbFile);
  const throttle = createThrottle(db, clock);

  const q = {
    userById: db.prepare('SELECT * FROM users WHERE id = ?'),
    userByEmail: db.prepare('SELECT * FROM users WHERE lower(email) = ?'),
    userByDni: db.prepare('SELECT id FROM users WHERE dni_hash = ?'),
    userByPhone: db.prepare('SELECT id FROM users WHERE phone = ?'),
    userByPending: db.prepare(`SELECT * FROM users WHERE pending_token_hash = ? AND status = 'pending_verification'`),
    insertUser: db.prepare(`INSERT INTO users
      (name,email,role,branch_id,status,avatar,password_hash,dni_hash,dni_hint,phone,consent_at,consent_version,created_at,pending_token_hash)
      VALUES (@name,@email,'customer',NULL,'pending_verification',@avatar,@password_hash,@dni_hash,@dni_hint,@phone,@now,@policy,@now,@token_hash)`),
    deleteUser: db.prepare('DELETE FROM users WHERE id = ?'),
    purgePending: db.prepare(`DELETE FROM users WHERE status = 'pending_verification' AND created_at < ?`),
    setPendingToken: db.prepare('UPDATE users SET pending_token_hash = ? WHERE id = ?'),
    activate: db.prepare(`UPDATE users SET status='active', phone_verified_at=?, pending_token_hash=NULL WHERE id = ?`),
    touchLogin: db.prepare('UPDATE users SET last_login = ? WHERE id = ?'),
    insertCode: db.prepare(`INSERT INTO verification_codes (user_id,code_hash,salt,expires_at,created_at) VALUES (?,?,?,?,?)`),
    latestCode: db.prepare('SELECT * FROM verification_codes WHERE user_id = ? ORDER BY id DESC LIMIT 1'),
    codesSince: db.prepare('SELECT created_at FROM verification_codes WHERE user_id = ? AND created_at > ? ORDER BY created_at'),
    bumpAttempts: db.prepare('UPDATE verification_codes SET attempts = attempts + 1 WHERE id = ?'),
    consumeCode: db.prepare('UPDATE verification_codes SET consumed_at = ? WHERE id = ?'),
    insertSession: db.prepare('INSERT INTO sessions (token_hash,user_id,created_at,last_seen_at,expires_at) VALUES (?,?,?,?,?)'),
    sessionByHash: db.prepare(`SELECT s.token_hash, s.created_at AS s_created, s.last_seen_at, s.expires_at, u.*
      FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token_hash = ?`),
    touchSession: db.prepare('UPDATE sessions SET last_seen_at = ? WHERE token_hash = ?'),
    deleteSession: db.prepare('DELETE FROM sessions WHERE token_hash = ?'),
    purgeSessions: db.prepare('DELETE FROM sessions WHERE expires_at < ? OR last_seen_at < ?'),
  };

  // ── utilidades de cookies ──
  const cookieAttrs = (maxAgeSec, path) =>
    `Path=${path}; HttpOnly; SameSite=Lax; Max-Age=${maxAgeSec}${cookieSecure ? '; Secure' : ''}`;
  const setCookie = (res, name, value, maxAgeSec, path = '/') =>
    res.append('Set-Cookie', `${name}=${value}; ${cookieAttrs(maxAgeSec, path)}`);
  const clearCookie = (res, name, path = '/') => setCookie(res, name, '', 0, path);
  const VERIFY_PATH = '/api/auth';

  // ── forma publica del usuario ──
  const publicUser = (u) => ({
    id: u.id, name: u.name, email: u.email, role: u.role, tier: tierOf(u.role),
    branchId: u.branch_id ?? null, avatar: u.avatar || initials(u.name), perms: PERMS[u.role] ?? [],
  });

  // ── sesiones ──
  const createSession = (res, userId) => {
    const now = clock();
    q.purgeSessions.run(now, now - AUTH.SESSION_IDLE);
    const token = randomToken();
    q.insertSession.run(sha256(token), userId, now, now, now + AUTH.SESSION_ABSOLUTE);
    setCookie(res, AUTH.SESSION_COOKIE, token, AUTH.SESSION_ABSOLUTE / 1000);
  };

  const loadSession = (req, _res, next) => {
    req.user = null;
    const token = parseCookies(req.headers.cookie)[AUTH.SESSION_COOKIE];
    if (!token) return next();
    const hash = sha256(token);
    const row = q.sessionByHash.get(hash);
    if (!row) return next();
    const now = clock();
    if (now >= row.expires_at || now - row.last_seen_at >= AUTH.SESSION_IDLE || row.status !== 'active') {
      q.deleteSession.run(hash);
      return next();
    }
    if (now - row.last_seen_at > 60 * 1000) q.touchSession.run(now, hash);
    req.user = publicUser(row);
    req.sessionHash = hash;
    next();
  };

  const requireAuth = (req, res, next) =>
    req.user ? next() : res.status(401).json({ error: 'unauthenticated' });
  const requireTier = (...tiers) => (req, res, next) =>
    tiers.includes(req.user?.tier) ? next() : res.status(403).json({ error: 'forbidden' });

  // ── CSRF: Origin debe coincidir con Host (+ JSON obligatorio) ──
  const csrf = (req, res, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return next();
    const origin = req.headers.origin;
    if (origin) {
      let host = null;
      try { host = new URL(origin).host; } catch { /* origen invalido */ }
      if (host !== req.headers.host) return res.status(403).json({ error: 'bad_origin' });
    }
    if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: 'bad_origin' });
    // Unica excepcion: subir UNA imagen cruda de un reclamo de DNI (PUT /api/claims/files/:kind). Un formulario
    // de otro sitio no puede enviar este tipo de contenido, y Origin y Sec-Fetch-Site se comprobaron arriba.
    if (req.method === 'PUT' && /^\/claims\/files\/[a-z_]+$/.test(req.path) && req.is(CLAIM_IMAGE_TYPES)) return next();
    if (!req.is('application/json')) return res.status(415).json({ error: 'json_required' });
    next();
  };

  // ── registros pendientes y codigos ──
  const purgeExpiredPending = () => q.purgePending.run(clock() - AUTH.PENDING_TTL);

  const maskPhone = (p) => `${p[0]}** *** ${p.slice(-3)}`;

  // Crea un codigo nuevo para el usuario pendiente. Respeta enfriamiento y tope por hora.
  const issueCode = (user, { force = false } = {}) => {
    const now = clock();
    if (!force) {
      const recent = q.codesSince.all(user.id, now - HOUR);
      const last = recent.at(-1) ?? q.latestCode.get(user.id);
      if (last && now - last.created_at < AUTH.RESEND_COOLDOWN) {
        return { error: 'resend_too_soon', retryAfter: Math.ceil((AUTH.RESEND_COOLDOWN - (now - last.created_at)) / 1000) };
      }
      if (recent.length >= AUTH.RESEND_MAX_PER_HOUR + 1) {
        return { error: 'resend_limit', retryAfter: Math.ceil((recent[0].created_at + HOUR - now) / 1000) };
      }
    }
    const code = randomCode();
    const salt = randomToken().slice(0, 16);
    q.insertCode.run(user.id, sha256(salt + code), salt, now + AUTH.CODE_TTL, now);
    if (simulateSms) log.log(`[SMS simulado] usuario #${user.id}: codigo ${code}`);
    return { code, createdAt: now, expiresAt: now + AUTH.CODE_TTL, resendAvailableAt: now + AUTH.RESEND_COOLDOWN };
  };

  const verificationBody = (user, issued) => ({
    status: 'pending_verification',
    phoneMasked: user.phone ? maskPhone(user.phone) : null,
    pendingExpiresAt: user.created_at + AUTH.PENDING_TTL,
    codeExpiresAt: issued.expiresAt ?? null,
    resendAvailableAt: issued.resendAvailableAt ?? (clock() + (issued.retryAfter ?? 0) * 1000),
    simulated: simulateSms,
    ...(simulateSms && issued.code ? { simulation: { code: issued.code } } : {}),
  });

  const pendingFromCookie = (req) => {
    const t = parseCookies(req.headers.cookie)[AUTH.VERIFY_COOKIE];
    if (!t) return null;
    const u = q.userByPending.get(sha256(t));
    if (!u) return null;
    if (clock() - u.created_at >= AUTH.PENDING_TTL) { q.deleteUser.run(u.id); return null; }
    return u;
  };

  const startVerifyCookie = (res, userId) => {
    const token = randomToken();
    q.setPendingToken.run(sha256(token), userId);
    setCookie(res, AUTH.VERIFY_COOKIE, token, AUTH.PENDING_TTL / 1000, VERIFY_PATH);
  };

  const duplicates = (dniH, email, phone, exceptId = null) => {
    const e = {};
    const d = q.userByDni.get(dniH); if (d && d.id !== exceptId) e.dni = 'dni_taken';
    const m = q.userByEmail.get(email); if (m && m.id !== exceptId) e.email = 'email_taken';
    const p = q.userByPhone.get(phone); if (p && p.id !== exceptId) e.phone = 'phone_taken';
    return e;
  };

  const reservation = db.prepare(`SELECT contact_hash FROM claims WHERE dni_hash = ? AND status = 'approved' AND reserved_until > ? AND contact_hash IS NOT NULL`);
  const isReservedForOther = (dniH, email) => {
    const rows = reservation.all(dniH, clock());
    return rows.length > 0 && !rows.some((r) => r.contact_hash === contactHash(pepper, email));
  };

  // ── rutas ──
  const router = express.Router();
  router.use(loadSession);

  router.post('/register', async (req, res) => {
    const body = req.body && typeof req.body === 'object' ? req.body : {};
    const errors = validateRegistration(body);
    if (Object.keys(errors).length) return res.status(400).json({ error: 'validation', errors });

    const key = `register:ip:${req.ip}`;
    const lock = throttle.check(key);
    if (lock.locked) return res.status(429).json({ error: 'too_many_attempts', retryAfter: lock.retryAfter });
    throttle.hit(key, AUTH.REGISTER_IP);

    purgeExpiredPending();
    // Quien reenvia el formulario desde el mismo navegador reemplaza su propio registro pendiente.
    const own = pendingFromCookie(req);
    if (own) q.deleteUser.run(own.id);

    const name = normalizeName(body.name);
    const email = normalizeEmail(body.email);
    const dni = normalizeDni(body.dni);
    const phone = normalizePhone(body.phone);
    const dniH = dniHash(pepper, dni);

    const dup = duplicates(dniH, email, phone);
    // DNI liberado por un reclamo aprobado: reservado 7 dias para el correo del reclamo.
    if (!dup.dni && isReservedForOther(dniH, email)) dup.dni = 'dni_reserved';
    if (Object.keys(dup).length) return res.status(409).json({ error: 'conflict', errors: dup });

    const password_hash = await hashPassword(body.password);
    const now = clock();
    const token = randomToken();
    let user;
    try {
      db.transaction(() => {
        const info = q.insertUser.run({
          name, email, avatar: initials(name), password_hash, dni_hash: dniH, dni_hint: dni.slice(-3), phone,
          now, policy: AUTH.POLICY_VERSION, token_hash: sha256(token),
        });
        user = q.userById.get(info.lastInsertRowid);
      })();
    } catch (err) {
      if (String(err.code).startsWith('SQLITE_CONSTRAINT')) {
        const again = duplicates(dniH, email, phone);
        if (!again.dni && isReservedForOther(dniH, email)) again.dni = 'dni_reserved';
        return res.status(409).json({ error: 'conflict', errors: Object.keys(again).length ? again : { email: 'email_taken' } });
      }
      throw err;
    }
    const issued = issueCode(user, { force: true });
    setCookie(res, AUTH.VERIFY_COOKIE, token, AUTH.PENDING_TTL / 1000, VERIFY_PATH);
    res.status(201).json(verificationBody(user, issued));
  });

  router.post('/verify-phone', (req, res) => {
    const user = pendingFromCookie(req);
    if (!user) return res.status(410).json({ error: 'registration_expired' });
    const code = typeof req.body?.code === 'string' ? req.body.code.replace(/\s/g, '') : '';
    if (!/^\d{6}$/.test(code)) return res.status(400).json({ error: 'code_format' });

    const row = q.latestCode.get(user.id);
    const now = clock();
    if (!row || row.consumed_at) return res.status(410).json({ error: 'code_expired' });
    if (now >= row.expires_at) return res.status(410).json({ error: 'code_expired' });
    if (row.attempts >= AUTH.CODE_MAX_ATTEMPTS) return res.status(429).json({ error: 'too_many_attempts', attemptsLeft: 0 });

    if (!safeEqualHex(sha256(row.salt + code), row.code_hash)) {
      q.bumpAttempts.run(row.id);
      const left = AUTH.CODE_MAX_ATTEMPTS - (row.attempts + 1);
      return left > 0
        ? res.status(400).json({ error: 'code_invalid', attemptsLeft: left })
        : res.status(429).json({ error: 'too_many_attempts', attemptsLeft: 0 });
    }
    db.transaction(() => {
      q.consumeCode.run(now, row.id);
      q.activate.run(now, user.id);
      q.touchLogin.run(limaStamp(now), user.id);
    })();
    clearCookie(res, AUTH.VERIFY_COOKIE, VERIFY_PATH);
    createSession(res, user.id);
    res.json({ user: publicUser(q.userById.get(user.id)) });
  });

  router.post('/resend-code', (req, res) => {
    const user = pendingFromCookie(req);
    if (!user) return res.status(410).json({ error: 'registration_expired' });
    const issued = issueCode(user);
    if (issued.error) return res.status(429).json({ error: issued.error, retryAfter: issued.retryAfter });
    res.json(verificationBody(user, issued));
  });

  router.post('/login', async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const password = req.body?.password;
    if (!email || typeof password !== 'string' || !password || password.length > 1024) {
      return res.status(400).json({ error: 'validation' });
    }
    const kEmail = `login:email:${sha256(email)}`;
    const kIp = `login:ip:${req.ip}`;
    for (const k of [kEmail, kIp]) {
      const l = throttle.check(k);
      if (l.locked) return res.status(429).json({ error: 'locked', retryAfter: l.retryAfter });
    }
    purgeExpiredPending();
    const user = q.userByEmail.get(email);
    const ok = user?.password_hash ? await verifyPassword(password, user.password_hash) : await dummyVerify(password);
    if (!user || !ok) {
      throttle.hit(kEmail, AUTH.LOGIN);
      throttle.hit(kIp, AUTH.LOGIN_IP);
      return res.status(401).json({ error: 'invalid_credentials' });
    }
    if (user.status === 'pending_verification') {
      const issued = issueCode(user);
      startVerifyCookie(res, user.id);
      return res.status(403).json({ error: 'phone_not_verified', ...verificationBody(user, issued) });
    }
    // Solo se llega aqui con la contrasena correcta: se puede decir el motivo sin filtrar nada.
    if (user.status === 'suspended') return res.status(403).json({ error: 'account_suspended' });
    if (user.status !== 'active') return res.status(403).json({ error: 'account_disabled' });

    throttle.reset(kEmail);
    q.touchLogin.run(limaStamp(clock()), user.id);
    createSession(res, user.id);
    res.json({ user: publicUser(user) });
  });

  router.post('/logout', (req, res) => {
    if (req.sessionHash) q.deleteSession.run(req.sessionHash);
    clearCookie(res, AUTH.SESSION_COOKIE);
    res.status(204).end();
  });

  router.get('/me', (req, res) => {
    res.set('Cache-Control', 'no-store');
    res.json({ user: req.user });
  });

  // ── esqueleto de las rutas de administracion (futuras) ──
  const adminRouter = express.Router();
  adminRouter.use(loadSession, requireAuth, requireTier('central', 'branch'));
  adminRouter.get('/ping', (req, res) => res.json({ ok: true, role: req.user.role, tier: req.user.tier, branchId: req.user.branchId }));
  adminRouter.get('/central/ping', requireTier('central'), (_req, res) => res.json({ ok: true, scope: 'central' }));

  return { router, adminRouter, csrf, loadSession, requireAuth, requireTier, isStaffTier, hashPassword, pepper, clock };
}
