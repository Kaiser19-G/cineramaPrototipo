// Utilidades compartidas por las rutas del panel de administracion.

// Permiso exigido por el servidor (el mismo PERMS que usa la interfaz para ocultar botones).
export const requirePerm = (perm) => (req, res, next) =>
  req.user?.perms?.includes(perm) ? next() : res.status(403).json({ error: 'forbidden' });

// null = alcance central (todas las sedes); numero = solo esa sede; 'none' = personal de sede sin sede asignada.
export const branchScope = (req) => {
  if (req.user?.tier === 'central') return null;
  return Number.isInteger(req.user?.branchId) ? req.user.branchId : 'none';
};

export const failValidation = (res, errors) => res.status(400).json({ error: 'validation', errors });

export const isRealDate = (v) => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)
  && !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) === v;

// Registro de auditoria. Debe llamarse DENTRO de la misma transaccion que el cambio.
// `detail` lleva solo ids y nombres de campos: nunca nombres de personas, correos, DNI ni celulares.
export const createAudit = (db, clock) => {
  const stmt = db.prepare(`INSERT INTO audit_log (at, actor_id, action, entity, entity_id, branch_id, detail_json)
    VALUES (?,?,?,?,?,?,?)`);
  return (req, action, entity, entityId, branchId = null, detail = null) =>
    stmt.run(clock(), req.user?.id ?? null, action, entity, entityId, branchId, detail ? JSON.stringify(detail) : null);
};
