// Carrito de confitería del flujo de compra. Vive en el estado del navegador (no en el servidor): es un mapa
// variantId -> cantidad. Los precios y la disponibilidad salen SIEMPRE del último menú recibido; el servidor
// vuelve a calcular todo al pagar y manda si algo cambió.
const round2 = (n) => Math.round(n * 100) / 100;

// "Canchita salada mediano"; los productos de tamaño único se nombran solo por su nombre.
export const variantName = (name, label) => (label === 'Único' ? name : `${name} ${String(label).toLowerCase()}`);

// Todas las variantes del menú en orden de aparición: [{ product, variant, fullName }].
export function menuVariants(menu) {
  const out = [];
  for (const p of menu?.products ?? []) {
    for (const v of p.variants) out.push({ product: p, variant: v, fullName: variantName(p.name, v.label) });
  }
  return out;
}

// Líneas del carrito que existen en el menú, en el orden del menú.
export function cartLines(menu, cart) {
  return menuVariants(menu)
    .filter(({ variant }) => (cart[variant.id] ?? 0) > 0)
    .map(({ product, variant, fullName }) => {
      const qty = cart[variant.id];
      return { variantId: variant.id, productName: product.name, label: variant.label, fullName, qty, unitPrice: variant.price,
        lineTotal: round2(variant.price * qty), available: variant.available, includes: variant.includes ?? [] };
    });
}

export const cartTotals = (lines) => ({
  food: round2(lines.reduce((a, l) => a + l.lineTotal, 0)),
  units: lines.reduce((a, l) => a + l.qty, 0),
  count: lines.length,
});

// Quita del carrito lo que ya no existe o está agotado y recorta a los topes. Devuelve el carrito nuevo y lo quitado.
export function reconcileCart(menu, cart) {
  const byId = new Map(menuVariants(menu).map((x) => [x.variant.id, x]));
  const limits = menu?.limits ?? {};
  const next = {}; const removed = [];
  let units = 0; let lines = 0;
  for (const [key, raw] of Object.entries(cart)) {
    const id = Number(key);
    const found = byId.get(id);
    if (!found) { removed.push({ variantId: id, fullName: 'Un producto', reason: 'gone' }); continue; }
    if (!found.variant.available) { removed.push({ variantId: id, fullName: found.fullName, reason: 'sold_out' }); continue; }
    const qty = Math.min(Math.floor(Number(raw)) || 0, limits.maxQty ?? 10);
    if (qty < 1) continue;
    if (lines + 1 > (limits.maxLines ?? 12) || units + qty > (limits.maxUnits ?? 20)) { removed.push({ variantId: id, fullName: found.fullName, reason: 'limit' }); continue; }
    next[id] = qty; units += qty; lines += 1;
  }
  return { cart: next, removed };
}

// Productos del carrito cuyo precio cambió entre dos versiones del menú.
export function priceChanges(prevMenu, nextMenu, cart) {
  if (!prevMenu) return [];
  const before = new Map(menuVariants(prevMenu).map((x) => [x.variant.id, x.variant.price]));
  return menuVariants(nextMenu)
    .filter(({ variant }) => (cart[variant.id] ?? 0) > 0 && before.has(variant.id) && before.get(variant.id) !== variant.price)
    .map(({ variant, fullName }) => ({ variantId: variant.id, fullName, before: before.get(variant.id), after: variant.price }));
}

// Hora "HH:MM" menos N minutos (dentro del mismo día; solo para anunciar cuándo empieza la preparación).
export function minusMinutes(hhmm, minutes) {
  const [h, m] = String(hhmm).split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return hhmm;
  const t = (((h * 60 + m - minutes) % 1440) + 1440) % 1440;
  return `${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

// Persistencia de la sesión de navegador (sin datos personales): el carrito sobrevive a un reinicio de sesión.
const KEY = (id) => `cinerama-food-${id}`;
export function readFood(id) {
  try {
    const v = JSON.parse(sessionStorage.getItem(KEY(id)) || 'null');
    if (!v || typeof v !== 'object') return { cart: {}, timing: 'on_arrival' };
    const cart = {};
    for (const [k, q] of Object.entries(v.cart ?? {})) if (/^\d+$/.test(k) && Number.isInteger(q) && q > 0) cart[k] = q;
    return { cart, timing: v.timing === 'at_showtime' ? 'at_showtime' : 'on_arrival' };
  } catch { return { cart: {}, timing: 'on_arrival' }; }
}
export function writeFood(id, cart, timing) {
  try {
    if (Object.keys(cart).length) sessionStorage.setItem(KEY(id), JSON.stringify({ cart, timing }));
    else sessionStorage.removeItem(KEY(id));
  } catch { /* sin almacenamiento */ }
}
