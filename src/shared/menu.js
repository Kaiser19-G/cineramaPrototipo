// Catálogo de confitería compartido entre el servidor (que valida) y el panel (que solo evita viajes inútiles).
// Los precios son números con 2 decimales en soles, igual que las entradas (screenings.price, orders.amount).

export const PRODUCT_CATEGORIES = ['combo', 'popcorn', 'drink', 'snack'];
export const CATEGORY_LABELS = { combo: 'Combos', popcorn: 'Canchita', drink: 'Bebidas', snack: 'Dulces y snacks' };

// Claves cerradas de las ilustraciones SVG (src/components/ProductArt.jsx). No son URLs ni rutas.
export const ART_KEYS = ['popcorn', 'soda', 'water', 'nachos', 'hotdog', 'candy', 'combo'];
export const ART_LABELS = {
  popcorn: 'Cubeta de canchita', soda: 'Vaso con tapa y sorbete', water: 'Botella de agua', nachos: 'Bandeja de nachos',
  hotdog: 'Hot dog', candy: 'Bolsa de confites', combo: 'Combo (cubeta y vaso)',
};

export const VARIANT_LABELS = ['Único', 'Pequeño', 'Mediano', 'Grande'];

export const MAX_PRODUCT_PRICE = 200;
export const MAX_VARIANTS_PER_PRODUCT = 6;
export const MAX_COMBO_LINES = 8;
export const MAX_COMBO_QTY = 6;
export const TEXT_LIMITS = { name: 60, description: 300 };
export const MAX_SERVES = 6;
export const STOCK_STATUSES = ['available', 'sold_out'];
export const STOCK_LABELS = { available: 'Disponible', sold_out: 'Agotado' };

export const servesText = (n) => `Ideal para ${n} ${n === 1 ? 'persona' : 'personas'}`;
export const mlToOz = (ml) => Math.round(ml / 29.5735);

// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F\u007F]/;
const hasDecimals = (v, d) => Math.abs(v * 10 ** d - Math.round(v * 10 ** d)) < 1e-6;
const isBlank = (v) => v === null || v === undefined || v === '';

export const isMenuPrice = (p) => typeof p === 'number' && Number.isFinite(p) && p > 0 && p <= MAX_PRODUCT_PRICE && hasDecimals(p, 2);

function validateVariant(v) {
  const e = {};
  if (!VARIANT_LABELS.includes(v?.label)) e.label = isBlank(v?.label) ? 'required' : 'invalid_option';
  if (!isMenuPrice(v?.price)) {
    e.price = isBlank(v?.price) ? 'required'
      : typeof v.price === 'number' && Number.isFinite(v.price) && v.price > 0 && v.price <= MAX_PRODUCT_PRICE ? 'invalid_decimals' : 'out_of_range';
  }
  if (!isBlank(v?.volumeMl) && !(Number.isInteger(v.volumeMl) && v.volumeMl >= 1 && v.volumeMl <= 5000)) e.volumeMl = 'out_of_range';
  for (const k of ['heightCm', 'topDiamCm', 'bottomDiamCm']) {
    if (isBlank(v?.[k])) continue;
    if (typeof v[k] !== 'number' || !Number.isFinite(v[k]) || v[k] <= 0 || v[k] > 100) e[k] = 'out_of_range';
    else if (!hasDecimals(v[k], 1)) e[k] = 'invalid_decimals';
  }
  if (!(Number.isInteger(v?.serves) && v.serves >= 1 && v.serves <= MAX_SERVES)) e.serves = isBlank(v?.serves) ? 'required' : 'out_of_range';
  if (v?.active !== undefined && typeof v.active !== 'boolean') e.active = 'invalid';
  return e;
}

// `p` es el estado final del producto; `given` indica qué campos vinieron (solo esos generan errores propios).
// Errores: { campo: codigo, variants: { indice: { campo: codigo } } | codigo, includes: { indice: {...} } | codigo }.
export function validateProduct(p, given) {
  const errors = {};
  const has = (k) => given.has(k);
  if (has('name')) {
    if (typeof p.name !== 'string' || !p.name.trim()) errors.name = 'required';
    else if (p.name.trim().length > TEXT_LIMITS.name) errors.name = 'too_long';
    else if (CONTROL_CHARS.test(p.name)) errors.name = 'invalid';
  }
  if (has('category') && !PRODUCT_CATEGORIES.includes(p.category)) errors.category = isBlank(p.category) ? 'required' : 'invalid_option';
  if (has('artKey') && !ART_KEYS.includes(p.artKey)) errors.artKey = isBlank(p.artKey) ? 'required' : 'invalid_option';
  if (has('description') && p.description != null) {
    if (typeof p.description !== 'string') errors.description = 'invalid';
    else if (p.description.length > TEXT_LIMITS.description) errors.description = 'too_long';
    else if (CONTROL_CHARS.test(p.description.replace(/[\n\r\t]/g, ' '))) errors.description = 'invalid';
  }
  if (has('active') && typeof p.active !== 'boolean') errors.active = 'invalid';
  if (has('variants')) {
    if (!Array.isArray(p.variants) || p.variants.length === 0) errors.variants = 'required';
    else if (p.variants.length > MAX_VARIANTS_PER_PRODUCT) errors.variants = 'too_many';
    else {
      const ve = {};
      const seen = new Set();
      p.variants.forEach((v, i) => {
        const e = validateVariant(v);
        if (!e.label) { if (seen.has(v.label)) e.label = 'duplicate'; else seen.add(v.label); }
        if (Object.keys(e).length) ve[i] = e;
      });
      if (Object.keys(ve).length) errors.variants = ve;
      else if (p.category === 'combo' && p.variants.length !== 1) errors.variants = 'combo_single';
    }
  }
  if (has('includes') || (has('category') && p.category === 'combo')) {
    if (p.category === 'combo') {
      if (!Array.isArray(p.includes) || p.includes.length === 0) errors.includes = 'required';
      else if (p.includes.length > MAX_COMBO_LINES) errors.includes = 'too_many';
      else {
        const ie = {};
        const seen = new Set();
        p.includes.forEach((it, i) => {
          const e = {};
          if (!(Number.isInteger(it?.variantId) && it.variantId > 0)) e.variantId = 'invalid';
          else if (seen.has(it.variantId)) e.variantId = 'duplicate';
          else seen.add(it.variantId);
          if (!(Number.isInteger(it?.qty) && it.qty >= 1 && it.qty <= MAX_COMBO_QTY)) e.qty = 'out_of_range';
          if (Object.keys(e).length) ie[i] = e;
        });
        if (Object.keys(ie).length) errors.includes = ie;
      }
    } else if (has('includes') && Array.isArray(p.includes) && p.includes.length) errors.includes = 'not_allowed';
  }
  return errors;
}
