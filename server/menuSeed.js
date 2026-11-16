// Semilla del catalogo de confiteria (precios en soles). Solo se carga si `products` esta vacia: lo que edite el
// personal desde el panel nunca se pisa. Medidas aproximadas de envases comunes (las usara el comparador de tamanos).
// Disponibilidad: sin fila = disponible; aqui solo se siembran algunos agotados de ejemplo.

// [etiqueta, precio, ml, alto cm, diametro superior cm, diametro inferior cm, personas]
const POP = [
  ['Pequeño', 9.9, 1400, 22, 14, 10, 1],
  ['Mediano', 14.9, 2300, 26, 17, 12, 2],
  ['Grande', 19.9, 3500, 31, 20, 14, 3],
];
const SODA = [
  ['Pequeño', 6.5, 355, 14, 7.5, 5.5, 1],
  ['Mediano', 8.5, 530, 16.5, 8.5, 6, 1],
  ['Grande', 10.5, 740, 19, 9.5, 6.5, 1],
];

export const MENU_SEED = [
  { key: 'pop-salada', name: 'Canchita salada', category: 'popcorn', art: 'popcorn',
    description: 'Canchita recién reventada con sal, en cubeta.', variants: POP },
  { key: 'pop-dulce', name: 'Canchita dulce', category: 'popcorn', art: 'popcorn',
    description: 'Canchita acaramelada, crocante y dulce.', variants: POP },
  { key: 'gaseosa', name: 'Gaseosa', category: 'drink', art: 'soda',
    description: 'Gaseosa bien fría con hielo, en vaso con tapa.', variants: SODA },
  { key: 'chicha', name: 'Chicha morada', category: 'drink', art: 'soda',
    description: 'Chicha morada de la casa, sin hielo.', variants: [SODA[1].map((x, i) => (i === 1 ? 8.9 : x)), SODA[2].map((x, i) => (i === 1 ? 11.5 : x))] },
  { key: 'agua', name: 'Agua mineral', category: 'drink', art: 'water',
    description: 'Agua mineral sin gas, botella de 500 ml.', variants: [['Único', 4.5, 500, 20, 6.5, 6.5, 1]] },
  { key: 'nachos', name: 'Nachos con queso', category: 'snack', art: 'nachos',
    description: 'Nachos crocantes con salsa de queso caliente.', variants: [['Único', 12.9, 450, 6, 16, 12, 2]] },
  { key: 'hotdog', name: 'Hot dog clásico', category: 'snack', art: 'hotdog',
    description: 'Salchicha en pan suave con cremas.', variants: [['Único', 9.9, null, null, null, null, 1]] },
  { key: 'confites', name: 'Confites surtidos', category: 'snack', art: 'candy',
    description: 'Bolsa de confites y gomitas surtidas.', variants: [['Único', 5.9, null, 16, null, null, 1]] },
  // Combos: [producto, etiqueta, cantidad]
  { key: 'combo-personal', name: 'Combo personal', category: 'combo', art: 'combo',
    description: 'Una canchita pequeña salada y una gaseosa pequeña.', price: 15.9, serves: 1,
    includes: [['pop-salada', 'Pequeño', 1], ['gaseosa', 'Pequeño', 1]] },
  { key: 'combo-pareja', name: 'Combo pareja', category: 'combo', art: 'combo',
    description: 'Una canchita mediana salada y dos gaseosas medianas.', price: 27.9, serves: 2,
    includes: [['pop-salada', 'Mediano', 1], ['gaseosa', 'Mediano', 2]] },
  { key: 'combo-familiar', name: 'Combo familiar', category: 'combo', art: 'combo',
    description: 'Una canchita grande, tres gaseosas medianas y nachos con queso.', price: 54.9, serves: 4,
    includes: [['pop-salada', 'Grande', 1], ['gaseosa', 'Mediano', 3], ['nachos', 'Único', 1]] },
];

// Agotados de ejemplo: [clave de producto, etiqueta, id de sede]. El resto esta disponible en todas las sedes.
export const MENU_SOLD_OUT_SEED = [
  ['nachos', 'Único', 2],
  ['gaseosa', 'Grande', 3],
  ['pop-dulce', 'Grande', 1],
];

export function seedMenu(db) {
  const has = (t) => !!db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(t);
  if (!has('products') || db.prepare('SELECT COUNT(*) c FROM products').get().c > 0) return false;
  const now = Date.now();
  const insP = db.prepare(`INSERT INTO products (name,category,description,art_key,active,sort,version,created_at,updated_at)
    VALUES (?,?,?,?,1,?,1,?,?)`);
  const insV = db.prepare(`INSERT INTO product_variants (product_id,label,price,volume_ml,height_cm,top_diam_cm,bottom_diam_cm,serves,active,sort)
    VALUES (?,?,?,?,?,?,?,?,1,?)`);
  const insC = db.prepare('INSERT INTO combo_items (combo_variant_id,item_variant_id,qty) VALUES (?,?,?)');
  const vid = new Map();
  MENU_SEED.forEach((p, i) => {
    const pid = Number(insP.run(p.name, p.category, p.description, p.art, i + 1, now, now).lastInsertRowid);
    if (p.category === 'combo') {
      const id = Number(insV.run(pid, 'Único', p.price, null, null, null, null, p.serves, 1).lastInsertRowid);
      vid.set(`${p.key}:Único`, id);
      for (const [k, label, qty] of p.includes) insC.run(id, vid.get(`${k}:${label}`), qty);
    } else {
      p.variants.forEach(([label, price, ml, h, top, bottom, serves], j) => {
        vid.set(`${p.key}:${label}`, Number(insV.run(pid, label, price, ml, h, top, bottom, serves, j + 1).lastInsertRowid));
      });
    }
  });
  const branchIds = new Set(db.prepare('SELECT id FROM branches').all().map((b) => b.id));
  const insS = db.prepare(`INSERT INTO branch_variants (branch_id,variant_id,status,updated_at) VALUES (?,?,'sold_out',?)`);
  for (const [k, label, branchId] of MENU_SOLD_OUT_SEED) if (branchIds.has(branchId)) insS.run(branchId, vid.get(`${k}:${label}`), now);
  return true;
}
