// Catalogo de confiteria: lectura (modelo compartido por el panel y por el menu publico) y API publica de solo lectura.
// Las escrituras viven en server/admin/products.js. Precio global; la disponibilidad es por sede y binaria
// (disponible / agotado, sin conteo de inventario). Sin fila en branch_variants = disponible.
import express from 'express';
import { PRODUCT_CATEGORIES, CATEGORY_LABELS, servesText, mlToOz } from '../src/shared/menu.js';
import { MAX_ITEM_QTY, MAX_FOOD_UNITS_PER_ORDER, MAX_FOOD_LINES } from '../src/shared/purchase.js';

const CATEGORY_RANK = Object.fromEntries(PRODUCT_CATEGORIES.map((c, i) => [c, i]));

export function createMenuModel(db) {
  const q = {
    products: db.prepare('SELECT * FROM products ORDER BY id'),
    productById: db.prepare('SELECT * FROM products WHERE id = ?'),
    variants: db.prepare('SELECT * FROM product_variants ORDER BY product_id, sort, id'),
    variantsOf: db.prepare('SELECT * FROM product_variants WHERE product_id = ? ORDER BY sort, id'),
    includes: db.prepare(`SELECT ci.combo_variant_id, ci.item_variant_id, ci.qty, v.label, v.active, p.name, p.id AS product_id
      FROM combo_items ci JOIN product_variants v ON v.id = ci.item_variant_id JOIN products p ON p.id = v.product_id
      ORDER BY ci.combo_variant_id, ci.rowid`),
    stock: db.prepare('SELECT branch_id, variant_id, status FROM branch_variants'),
    branch: db.prepare('SELECT id, name, city FROM branches WHERE id = ?'),
    branches: db.prepare('SELECT id FROM branches ORDER BY id'),
  };

  // Carga todo en memoria (catalogo pequeno): { products, variantsByProduct, includesByVariant, soldOut:Set('branch:variant') }.
  function load() {
    const variantsByProduct = new Map();
    for (const v of q.variants.all()) {
      if (!variantsByProduct.has(v.product_id)) variantsByProduct.set(v.product_id, []);
      variantsByProduct.get(v.product_id).push(v);
    }
    const includesByVariant = new Map();
    for (const r of q.includes.all()) {
      if (!includesByVariant.has(r.combo_variant_id)) includesByVariant.set(r.combo_variant_id, []);
      includesByVariant.get(r.combo_variant_id).push(r);
    }
    const soldOut = new Set(q.stock.all().filter((s) => s.status === 'sold_out').map((s) => `${s.branch_id}:${s.variant_id}`));
    return { products: q.products.all(), variantsByProduct, includesByVariant, soldOut };
  }

  const variantFields = (v) => ({
    volumeMl: v.volume_ml, volumeOz: v.volume_ml ? mlToOz(v.volume_ml) : null, heightCm: v.height_cm,
    topDiamCm: v.top_diam_cm, bottomDiamCm: v.bottom_diam_cm, serves: v.serves, servesText: servesText(v.serves),
  });

  // Un combo esta agotado en una sede si cualquiera de sus componentes lo esta (o fue desactivado).
  const isAvailable = (cat, branchId, v) => {
    if (cat.soldOut.has(`${branchId}:${v.id}`)) return false;
    return (cat.includesByVariant.get(v.id) ?? []).every((c) => c.active && !cat.soldOut.has(`${branchId}:${c.item_variant_id}`));
  };

  // Orden publico: combos primero, luego por categoria, luego sort e id.
  const sortProducts = (a, b) => CATEGORY_RANK[a.category] - CATEGORY_RANK[b.category] || a.sort - b.sort || a.id - b.id;

  // Menu publico de una sede: solo productos y tamanos activos; los agotados se muestran como agotados.
  function publicMenu(branchId) {
    const branch = q.branch.get(branchId);
    if (!branch) return null;
    const cat = load();
    const products = [];
    for (const p of cat.products.filter((x) => x.active).sort(sortProducts)) {
      const variants = (cat.variantsByProduct.get(p.id) ?? []).filter((v) => v.active).map((v) => ({
        id: v.id, label: v.label, price: v.price, available: isAvailable(cat, branchId, v), ...variantFields(v),
        includes: (cat.includesByVariant.get(v.id) ?? []).map((c) => ({ name: c.name, label: c.label, qty: c.qty })),
      }));
      if (!variants.length) continue;
      products.push({ id: p.id, name: p.name, category: p.category, categoryLabel: CATEGORY_LABELS[p.category],
        description: p.description, artKey: p.art_key, variants });
    }
    return {
      branch: { id: branch.id, name: branch.name },
      limits: { maxQty: MAX_ITEM_QTY, maxUnits: MAX_FOOD_UNITS_PER_ORDER, maxLines: MAX_FOOD_LINES },
      products,
    };
  }

  // Catalogo del panel: todo (activos e inactivos) con la disponibilidad de las sedes pedidas (null = todas).
  function adminProducts(branchIds = null) {
    const cat = load();
    const ids = branchIds ?? q.branches.all().map((b) => b.id);
    return cat.products.slice().sort(sortProducts).map((p) => adminShape(cat, p, ids));
  }
  function adminProduct(id, branchIds = null) {
    const p = q.productById.get(id);
    if (!p) return null;
    const cat = load();
    return adminShape(cat, p, branchIds ?? q.branches.all().map((b) => b.id));
  }
  function adminShape(cat, p, branchIds) {
    return {
      id: p.id, name: p.name, category: p.category, description: p.description, artKey: p.art_key, active: !!p.active,
      sort: p.sort, version: p.version,
      variants: (cat.variantsByProduct.get(p.id) ?? []).map((v) => ({
        id: v.id, label: v.label, price: v.price, active: !!v.active, ...variantFields(v),
        includes: (cat.includesByVariant.get(v.id) ?? []).map((c) => ({ variantId: c.item_variant_id, productId: c.product_id, name: c.name, label: c.label, qty: c.qty })),
        availability: branchIds.map((b) => ({ branchId: b, status: cat.soldOut.has(`${b}:${v.id}`) ? 'sold_out' : 'available' })),
      })),
    };
  }

  return { publicMenu, adminProducts, adminProduct, categories: PRODUCT_CATEGORIES };
}

// API publica de solo lectura. Sin sesion; `no-store` porque la disponibilidad cambia.
export function createMenu(db) {
  const model = createMenuModel(db);
  const router = express.Router();
  const screening = db.prepare('SELECT branch_id, status FROM screenings WHERE id = ?');

  // GET /api/menu?branchId=N
  router.get('/menu', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const n = Number(req.query.branchId);
    if (!Number.isInteger(n) || n <= 0) return res.status(400).json({ error: 'validation', errors: { branchId: 'invalid' } });
    const menu = model.publicMenu(n);
    if (!menu) return res.status(404).json({ error: 'not_found' });
    res.json(menu);
  });

  // GET /api/screenings/:id/menu -- el menu de la sede de la funcion. 404 si no existe o no se ofrece (igual que /seats).
  router.get('/screenings/:id/menu', (req, res) => {
    res.set('Cache-Control', 'no-store');
    const id = Number(req.params.id);
    const s = Number.isInteger(id) && id > 0 ? screening.get(id) : null;
    if (!s || s.status === 'draft' || s.status === 'cancelled') return res.status(404).json({ error: 'not_found' });
    res.json(model.publicMenu(s.branch_id));
  });

  return { router, model };
}
