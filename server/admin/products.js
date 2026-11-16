// Panel: catalogo de confiteria (productos, tamanos, combos) y disponibilidad por sede.
// - Crear/editar/precios/activar: manage_products (admin central).
// - Agotado/disponible: manage_stock (admin central en cualquier sede; gerente solo en la suya, otra sede -> 404).
// - Ver el catalogo: cualquiera de los dos permisos. Cajero, operador y soporte no gestionan catalogo (403).
// Sin borrado fisico: se desactiva (active = 0). Cada cambio escribe audit_log (solo ids y nombres de campos).
import express from 'express';
import { validateProduct, STOCK_STATUSES } from '../../src/shared/menu.js';
import { createMenuModel } from '../menu.js';
import { requirePerm, branchScope, failValidation, createAudit } from './common.js';

const blank = (v) => (typeof v === 'string' && v.trim() === '' ? null : v);
const isObj = (b) => b && typeof b === 'object' && !Array.isArray(b);

const requireAnyPerm = (...perms) => (req, res, next) =>
  perms.some((p) => req.user?.perms?.includes(p)) ? next() : res.status(403).json({ error: 'forbidden' });

// Normaliza una variante recibida: campos opcionales vacios -> null; active por defecto true.
const normVariant = (v) => {
  const o = isObj(v) ? v : {};
  return {
    id: o.id, label: o.label, price: o.price, volumeMl: blank(o.volumeMl) ?? null, heightCm: blank(o.heightCm) ?? null,
    topDiamCm: blank(o.topDiamCm) ?? null, bottomDiamCm: blank(o.bottomDiamCm) ?? null, serves: o.serves ?? 1, active: o.active ?? true,
  };
};

export function createProducts(db, opts = {}) {
  const { clock = Date.now } = opts;
  const audit = createAudit(db, clock);
  const model = createMenuModel(db);

  const q = {
    byId: db.prepare('SELECT * FROM products WHERE id = ?'),
    maxSort: db.prepare('SELECT COALESCE(MAX(sort), 0) m FROM products'),
    variantsOf: db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort, id'),
    variantById: db.prepare(`SELECT v.*, p.category FROM product_variants v JOIN products p ON p.id = v.product_id WHERE v.id = ?`),
    insert: db.prepare(`INSERT INTO products (name,category,description,art_key,active,sort,version,created_at,updated_at,updated_by)
      VALUES (@name,@category,@description,@art_key,@active,@sort,1,@now,@now,@by)`),
    update: db.prepare(`UPDATE products SET name=@name,category=@category,description=@description,art_key=@art_key,active=@active,
      version=version+1,updated_at=@now,updated_by=@by WHERE id=@id AND version=@version`),
    insertVariant: db.prepare(`INSERT INTO product_variants (product_id,label,price,volume_ml,height_cm,top_diam_cm,bottom_diam_cm,serves,active,sort)
      VALUES (@product_id,@label,@price,@volume_ml,@height_cm,@top_diam_cm,@bottom_diam_cm,@serves,@active,@sort)`),
    updateVariant: db.prepare(`UPDATE product_variants SET label=@label,price=@price,volume_ml=@volume_ml,height_cm=@height_cm,
      top_diam_cm=@top_diam_cm,bottom_diam_cm=@bottom_diam_cm,serves=@serves,active=@active WHERE id=@id AND product_id=@product_id`),
    includesOf: db.prepare('SELECT item_variant_id, qty FROM combo_items WHERE combo_variant_id = ? ORDER BY rowid'),
    clearIncludes:db.prepare('DELETE FROM combo_items WHERE combo_variant_id = ?'),
    insertInclude: db.prepare('INSERT INTO combo_items (combo_variant_id,item_variant_id,qty) VALUES (?,?,?)'),
    branchExists: db.prepare('SELECT id FROM branches WHERE id = ?'),
    stockRow: db.prepare('SELECT status FROM branch_variants WHERE branch_id = ? AND variant_id = ?'),
    upsertStock: db.prepare(`INSERT INTO branch_variants (branch_id,variant_id,status,updated_at,updated_by) VALUES (@branch_id,@variant_id,@status,@now,@by)
      ON CONFLICT(branch_id,variant_id) DO UPDATE SET status=excluded.status,updated_at=excluded.updated_at,updated_by=excluded.updated_by`),
  };

  const parseId = (req) => { const n = Number(req.params.id); return Number.isInteger(n) && n > 0 ? n : null; };
  const parseVersion = (v) => (Number.isInteger(v) && v >= 1 ? v : null);
  // Disponibilidad visible: central ve todas las sedes; el personal de sede solo la suya.
  const visibleBranches = (scope) => (scope === null ? null : scope === 'none' ? [] : [scope]);
  const out = (id, scope) => model.adminProduct(id, visibleBranches(scope));

  // Los componentes de un combo deben existir y no ser combos (sin anidar). Devuelve errores por indice o null.
  const checkIncludes = (includes) => {
    const ie = {};
    includes.forEach((it, i) => {
      const v = q.variantById.get(it.variantId);
      if (!v) ie[i] = { variantId: 'invalid' };
      else if (v.category === 'combo') ie[i] = { variantId: 'combo_in_combo' };
    });
    return Object.keys(ie).length ? ie : null;
  };

  const router = express.Router();
  router.use((_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });

  router.get('/', requireAnyPerm('manage_products', 'manage_stock'), (req, res) => {
    res.json({ products: model.adminProducts(visibleBranches(branchScope(req))) });
  });

  router.get('/:id', requireAnyPerm('manage_products', 'manage_stock'), (req, res) => {
    const id = parseId(req);
    const product = id && out(id, branchScope(req));
    if (!product) return res.status(404).json({ error: 'not_found' });
    res.json({ product });
  });

  router.post('/', requirePerm('manage_products'), (req, res) => {
    const b = isObj(req.body) ? req.body : {};
    const p = {
      name: typeof b.name === 'string' ? b.name.trim() : b.name, category: b.category, description: b.description ?? '',
      artKey: b.artKey, active: b.active ?? true,
      variants: Array.isArray(b.variants) ? b.variants.map(normVariant) : b.variants,
      includes: Array.isArray(b.includes) ? b.includes : [],
    };
    const errors = validateProduct(p, new Set(['name', 'category', 'artKey', 'description', 'active', 'variants', 'includes']));
    if (!Object.keys(errors).length && p.category === 'combo') {
      const ie = checkIncludes(p.includes);
      if (ie) errors.includes = ie;
    }
    if (Object.keys(errors).length) return failValidation(res, errors);
    const now = clock();
    let id;
    db.transaction(() => {
      id = Number(q.insert.run({
        name: p.name, category: p.category, description: p.description.trim(), art_key: p.artKey, active: p.active ? 1 : 0,
        sort: q.maxSort.get().m + 1, now, by: req.user.id,
      }).lastInsertRowid);
      p.variants.forEach((v, i) => {
        const vid = Number(q.insertVariant.run({
          product_id: id, label: v.label, price: v.price, volume_ml: v.volumeMl, height_cm: v.heightCm, top_diam_cm: v.topDiamCm,
          bottom_diam_cm: v.bottomDiamCm, serves: v.serves, active: v.active ? 1 : 0, sort: i + 1,
        }).lastInsertRowid);
        if (p.category === 'combo') for (const it of p.includes) q.insertInclude.run(vid, it.variantId, it.qty);
      });
      audit(req, 'product.create', 'product', id, null, { category: p.category, variants: p.variants.length });
    }).immediate();
    res.status(201).json({ product: out(id, null) });
  });

  router.patch('/:id', requirePerm('manage_products'), (req, res) => {
    const b = isObj(req.body) ? req.body : {};
    const id = parseId(req);
    const version = parseVersion(b.version);
    if (version === null) return failValidation(res, { version: 'required' });
    const scope = branchScope(req);
    const result = db.transaction(() => {
      const row = id && q.byId.get(id);
      if (!row) return { status: 404, body: { error: 'not_found' } };
      if (row.version !== version) return { status: 409, body: { error: 'stale', current: out(id, scope) } };
      const existing = q.variantsOf.all(id);
      const cur = { name: row.name, category: row.category, description: row.description, artKey: row.art_key, active: !!row.active };
      const given = new Set();
      const m = { ...cur };
      for (const k of Object.keys(cur)) {
        if (b[k] === undefined) continue;
        given.add(k);
        m[k] = k === 'name' && typeof b[k] === 'string' ? b[k].trim() : b[k];
      }
      const errors = {};
      // Un combo no se convierte en otra categoria ni al reves (su composicion no tendria sentido).
      if (given.has('category') && m.category !== cur.category && (m.category === 'combo' || cur.category === 'combo')) errors.category = 'combo_change';
      const comboVariantId = row.category === 'combo' ? existing[0]?.id : null;
      // Sin `includes` en la peticion, un combo conserva su composicion actual.
      m.includes = Array.isArray(b.includes) ? b.includes
        : b.includes === undefined && comboVariantId ? q.includesOf.all(comboVariantId).map((r) => ({ variantId: r.item_variant_id, qty: r.qty })) : [];
      if (b.includes !== undefined) given.add('includes');
      let variantsIn = null;
      if (b.variants !== undefined) {
        given.add('variants');
        variantsIn = Array.isArray(b.variants) ? b.variants.map(normVariant) : b.variants;
        m.variants = variantsIn;
      }
      Object.assign(errors, validateProduct(m, given));
      if (Array.isArray(variantsIn) && !errors.variants) {
        const own = new Map(existing.map((v) => [v.id, v]));
        const ve = {};
        variantsIn.forEach((v, i) => {
          if (v.id !== undefined && v.id !== null && !own.has(v.id)) ve[i] = { id: 'invalid' };
        });
        const ids = variantsIn.map((v) => v.id).filter((x) => x !== undefined && x !== null);
        if (new Set(ids).size !== ids.length) ve[0] = { ...(ve[0] ?? {}), id: 'invalid' };
        // Etiquetas finales unicas (incluye los tamanos que no vinieron en la peticion).
        const finalLabel = new Map(existing.map((v) => [v.id, v.label]));
        variantsIn.forEach((v, i) => { if (v.id !== undefined && v.id !== null) finalLabel.set(v.id, v.label); else finalLabel.set(`new${i}`, v.label); });
        const byLabel = new Map();
        for (const [k, label] of finalLabel) byLabel.set(label, [...(byLabel.get(label) ?? []), k]);
        for (const keys of byLabel.values()) {
          if (keys.length < 2) continue;
          for (const k of keys) {
            const i = typeof k === 'string' ? Number(k.slice(3)) : variantsIn.findIndex((v) => v.id === k);
            if (i >= 0) ve[i] = { ...(ve[i] ?? {}), label: 'duplicate' };
          }
        }
        if (row.category === 'combo' && variantsIn.some((v) => v.id === undefined || v.id === null)) errors.variants = 'combo_single';
        else if (finalLabel.size > 6) errors.variants = 'too_many';
        else if (Object.keys(ve).length) errors.variants = ve;
      }
      if (!Object.keys(errors).length && given.has('includes')) {
        if (row.category !== 'combo') { if (m.includes.length) errors.includes = 'not_allowed'; }
        else {
          const ie = checkIncludes(m.includes);
          if (ie) errors.includes = ie;
          else if (m.includes.some((it) => it.variantId === comboVariantId)) errors.includes = { 0: { variantId: 'combo_in_combo' } };
        }
      }
      if (Object.keys(errors).length) return { status: 400, body: { error: 'validation', errors } };

      const now = clock();
      const info = q.update.run({
        id, version, name: m.name, category: m.category, description: (m.description ?? '').trim(), art_key: m.artKey,
        active: m.active ? 1 : 0, now, by: req.user.id,
      });
      if (info.changes !== 1) return { status: 409, body: { error: 'stale', current: out(id, scope) } };
      const touched = [];
      if (variantsIn) {
        const base = existing.length;
        variantsIn.forEach((v, i) => {
          const data = { product_id: id, label: v.label, price: v.price, volume_ml: v.volumeMl, height_cm: v.heightCm, top_diam_cm: v.topDiamCm,
            bottom_diam_cm: v.bottomDiamCm, serves: v.serves, active: v.active ? 1 : 0 };
          if (v.id !== undefined && v.id !== null) { q.updateVariant.run({ ...data, id: v.id }); touched.push(v.id); }
          else touched.push(Number(q.insertVariant.run({ ...data, sort: base + i + 1 }).lastInsertRowid));
        });
      }
      if (given.has('includes') && comboVariantId) {
        q.clearIncludes.run(comboVariantId);
        for (const it of m.includes) q.insertInclude.run(comboVariantId, it.variantId, it.qty);
      }
      audit(req, 'product.update', 'product', id, null, { fields: [...given].filter((k) => k !== 'version'), variantIds: touched });
      return { status: 200, body: { product: out(id, scope) } };
    }).immediate();
    res.status(result.status).json(result.body);
  });

  // Disponibilidad en una sede. Central: cualquier sede; gerente: solo la suya (otra sede -> 404, como si no existiera).
  router.put('/:id/branches/:branchId', requirePerm('manage_stock'), (req, res) => {
    const id = parseId(req);
    const branchId = Number(req.params.branchId);
    const scope = branchScope(req);
    const inScope = scope === null || (scope !== 'none' && scope === branchId);
    if (!id || !Number.isInteger(branchId) || branchId <= 0 || !inScope || !q.branchExists.get(branchId)) return res.status(404).json({ error: 'not_found' });
    const b = isObj(req.body) ? req.body : {};
    const result = db.transaction(() => {
      const row = q.byId.get(id);
      if (!row) return { status: 404, body: { error: 'not_found' } };
      const errors = {};
      if (!STOCK_STATUSES.includes(b.status)) errors.status = b.status === undefined ? 'required' : 'invalid_option';
      const variants = q.variantsOf.all(id);
      let targets = variants;
      if (b.variantId !== undefined && b.variantId !== null) {
        targets = variants.filter((v) => v.id === b.variantId);
        if (!Number.isInteger(b.variantId) || targets.length === 0) errors.variantId = 'invalid';
      }
      if (Object.keys(errors).length) return { status: 400, body: { error: 'validation', errors } };
      const now = clock();
      const changed = [];
      for (const v of targets) {
        const prev = q.stockRow.get(branchId, v.id)?.status ?? 'available';
        if (prev === b.status) continue;
        q.upsertStock.run({ branch_id: branchId, variant_id: v.id, status: b.status, now, by: req.user.id });
        changed.push(v.id);
      }
      if (changed.length) audit(req, 'product.stock', 'product', id, branchId, { status: b.status, variantIds: changed });
      return { status: 200, body: { product: out(id, scope) } };
    }).immediate();
    res.status(result.status).json(result.body);
  });

  return { router };
}
