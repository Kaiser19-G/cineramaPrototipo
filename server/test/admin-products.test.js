import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { startEnv, regBody, DEMO_PASSWORD } from './helpers.js';
import { MENU_SEED } from '../menuSeed.js';

let env;
let admin, manager, otherManager, cashier, operator, support, customer, anon;

const login = async (email) => {
  const c = env.client();
  const r = await c.post('/api/auth/login', { email, password: DEMO_PASSWORD });
  assert.equal(r.status, 200, email);
  return c;
};
const patch = (c, id, body) => c.call('PATCH', `/api/admin/products/${id}`, body);
const put = (c, url, body) => c.call('PUT', url, body);
const audit = (action) => env.db.prepare('SELECT * FROM audit_log WHERE action = ? ORDER BY id').all(action);

const variant = (over = {}) => ({ label: 'Único', price: 7.5, volumeMl: 300, heightCm: 10, topDiamCm: 7, bottomDiamCm: 5, serves: 1, active: true, ...over });
const NEW = { name: 'Helado de vainilla', category: 'snack', description: 'Copa de helado.', artKey: 'candy', variants: [variant()] };
const byName = (list, name) => list.find((p) => p.name === name);

before(async () => {
  env = await startEnv();
  admin = await login('admin@cinerama.com');
  manager = await login('sarah.mitchell@cinerama.com');      // gerente, sede 1
  otherManager = await login('emily.rodriguez@cinerama.com'); // gerente, sede 3
  cashier = await login('michael.chen@cinerama.com');        // cajero, sede 1
  operator = await login('anna.martinez@cinerama.com');      // operador, sede 2
  support = await login('james.wilson@cinerama.com');        // soporte, sede 1
  anon = env.client();
  customer = env.client();
  const reg = await customer.post('/api/auth/register', regBody({ dni: '60000055', email: 'cli-prod@example.com', phone: '991111155' }));
  await customer.post('/api/auth/verify-phone', { code: reg.json.simulation.code });
});
after(() => env.stop());

describe('permisos de /api/admin/products', () => {
  test('401 sin sesion y 403 para clientes, cajero, operador y soporte, en todas las rutas', async () => {
    for (const [c, want] of [[anon, 401], [customer, 403], [cashier, 403], [operator, 403], [support, 403]]) {
      assert.equal((await c.get('/api/admin/products')).status, want);
      assert.equal((await c.get('/api/admin/products/1')).status, want);
      assert.equal((await c.post('/api/admin/products', NEW)).status, want);
      assert.equal((await patch(c, 1, { version: 1 })).status, want);
      assert.equal((await put(c, '/api/admin/products/1/branches/1', { status: 'sold_out' })).status, want);
    }
  });

  test('el gerente lee el catalogo y marca agotado, pero no crea ni edita productos', async () => {
    assert.equal((await manager.get('/api/admin/products')).status, 200);
    assert.equal((await manager.post('/api/admin/products', NEW)).status, 403);
    assert.equal((await patch(manager, 1, { version: 1, name: 'x' })).status, 403);
  });

  test('el admin central ve la disponibilidad de todas las sedes; el gerente solo la de la suya', async () => {
    const a = await admin.get('/api/admin/products');
    assert.equal(a.status, 200);
    assert.equal(a.json.products.length, MENU_SEED.length);
    assert.equal(a.headers.get('cache-control'), 'no-store');
    const nBranches = env.db.prepare('SELECT COUNT(*) c FROM branches').get().c;
    assert.equal(a.json.products[0].variants[0].availability.length, nBranches);
    const m = await manager.get('/api/admin/products');
    for (const p of m.json.products) for (const v of p.variants) assert.deepEqual(v.availability.map((x) => x.branchId), [1]);
    const one = await manager.get(`/api/admin/products/${a.json.products[0].id}`);
    assert.equal(one.status, 200);
    assert.equal((await manager.get('/api/admin/products/99999')).status, 404);
    assert.equal((await manager.get('/api/admin/products/abc')).status, 404);
  });
});

describe('crear y editar productos', () => {
  test('crear: 201, version 1, orden al final, auditoria sin datos personales', async () => {
    const r = await admin.post('/api/admin/products', NEW);
    assert.equal(r.status, 201);
    const p = r.json.product;
    assert.equal(p.version, 1); assert.equal(p.active, true);
    assert.equal(p.variants.length, 1);
    assert.equal(p.variants[0].servesText, 'Ideal para 1 persona');
    assert.equal(p.variants[0].volumeOz, 10);
    const rows = audit('product.create').filter((a) => a.entity_id === p.id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].entity, 'product');
    assert.deepEqual(JSON.parse(rows[0].detail_json), { category: 'snack', variants: 1 });
    const list = await admin.get('/api/admin/products');
    assert.equal(list.json.products.find((x) => x.id === p.id).name, 'Helado de vainilla');
  });

  test('validaciones del alta: campos, precio, medidas, etiquetas y arreglos', async () => {
    const bad = async (over, check) => {
      const r = await admin.post('/api/admin/products', { ...NEW, ...over });
      assert.equal(r.status, 400, JSON.stringify(over));
      assert.equal(r.json.error, 'validation');
      check(r.json.errors);
    };
    await bad({ name: '   ' }, (e) => assert.equal(e.name, 'required'));
    await bad({ name: 'x'.repeat(61) }, (e) => assert.equal(e.name, 'too_long'));
    await bad({ name: 'con\u0007control' }, (e) => assert.equal(e.name, 'invalid'));
    await bad({ category: 'bebida' }, (e) => assert.equal(e.category, 'invalid_option'));
    await bad({ artKey: '../../etc/passwd' }, (e) => assert.equal(e.artKey, 'invalid_option'));
    await bad({ description: 'd'.repeat(301) }, (e) => assert.equal(e.description, 'too_long'));
    await bad({ variants: [] }, (e) => assert.equal(e.variants, 'required'));
    await bad({ variants: 'nada' }, (e) => assert.equal(e.variants, 'required'));
    await bad({ variants: [variant({ price: 0 })] }, (e) => assert.equal(e.variants[0].price, 'out_of_range'));
    await bad({ variants: [variant({ price: -3 })] }, (e) => assert.equal(e.variants[0].price, 'out_of_range'));
    await bad({ variants: [variant({ price: 201 })] }, (e) => assert.equal(e.variants[0].price, 'out_of_range'));
    await bad({ variants: [variant({ price: 7.555 })] }, (e) => assert.equal(e.variants[0].price, 'invalid_decimals'));
    await bad({ variants: [variant({ price: '7.50' })] }, (e) => assert.equal(e.variants[0].price, 'out_of_range'));
    await bad({ variants: [variant({ price: undefined })] }, (e) => assert.equal(e.variants[0].price, 'required'));
    await bad({ variants: [variant({ label: 'Gigante' })] }, (e) => assert.equal(e.variants[0].label, 'invalid_option'));
    await bad({ variants: [variant({ volumeMl: 0 })] }, (e) => assert.equal(e.variants[0].volumeMl, 'out_of_range'));
    await bad({ variants: [variant({ volumeMl: 5.5 })] }, (e) => assert.equal(e.variants[0].volumeMl, 'out_of_range'));
    await bad({ variants: [variant({ heightCm: 101 })] }, (e) => assert.equal(e.variants[0].heightCm, 'out_of_range'));
    await bad({ variants: [variant({ topDiamCm: 7.25 })] }, (e) => assert.equal(e.variants[0].topDiamCm, 'invalid_decimals'));
    await bad({ variants: [variant({ serves: 0 })] }, (e) => assert.equal(e.variants[0].serves, 'out_of_range'));
    await bad({ variants: [variant({ serves: 7 })] }, (e) => assert.equal(e.variants[0].serves, 'out_of_range'));
    await bad({ variants: [variant(), variant()] }, (e) => assert.equal(e.variants[1].label, 'duplicate'));
    await bad({ variants: Array.from({ length: 7 }, (_, i) => variant({ label: ['Único', 'Pequeño', 'Mediano', 'Grande'][i % 4] })) }, (e) => assert.equal(e.variants, 'too_many'));
    await bad({ includes: [{ variantId: 1, qty: 1 }] }, (e) => assert.equal(e.includes, 'not_allowed'));
    assert.equal((await admin.post('/api/admin/products', [1, 2])).status, 400);
  });

  test('medidas opcionales: se aceptan vacias y se guardan como null', async () => {
    const r = await admin.post('/api/admin/products', { ...NEW, name: 'Chocolate', variants: [variant({ volumeMl: '', heightCm: null, topDiamCm: undefined, bottomDiamCm: '' })] });
    assert.equal(r.status, 201);
    const v = r.json.product.variants[0];
    assert.equal(v.volumeMl, null); assert.equal(v.heightCm, null); assert.equal(v.volumeOz, null);
  });

  test('combos: una sola variante, componentes existentes y sin anidar', async () => {
    const list = (await admin.get('/api/admin/products')).json.products;
    const gaseosa = byName(list, 'Gaseosa').variants[0];
    const combo = byName(list, 'Combo pareja').variants[0];
    const body = { name: 'Combo prueba', category: 'combo', description: '', artKey: 'combo', variants: [variant({ volumeMl: null, heightCm: null, topDiamCm: null, bottomDiamCm: null, price: 20, serves: 2 })] };
    const err = async (over, check) => { const r = await admin.post('/api/admin/products', { ...body, ...over }); assert.equal(r.status, 400); check(r.json.errors); };
    await err({ includes: [] }, (e) => assert.equal(e.includes, 'required'));
    await err({ includes: [{ variantId: gaseosa.id, qty: 0 }] }, (e) => assert.equal(e.includes[0].qty, 'out_of_range'));
    await err({ includes: [{ variantId: gaseosa.id, qty: 1 }, { variantId: gaseosa.id, qty: 1 }] }, (e) => assert.equal(e.includes[1].variantId, 'duplicate'));
    await err({ includes: [{ variantId: 999999, qty: 1 }] }, (e) => assert.equal(e.includes[0].variantId, 'invalid'));
    await err({ includes: [{ variantId: combo.id, qty: 1 }] }, (e) => assert.equal(e.includes[0].variantId, 'combo_in_combo'));
    await err({ includes: [{ variantId: gaseosa.id, qty: 1 }], variants: [variant({ label: 'Pequeño' }), variant()] }, (e) => assert.equal(e.variants, 'combo_single'));
    const ok = await admin.post('/api/admin/products', { ...body, includes: [{ variantId: gaseosa.id, qty: 2 }] });
    assert.equal(ok.status, 201);
    assert.deepEqual(ok.json.product.variants[0].includes.map((i) => [i.name, i.label, i.qty]), [['Gaseosa', 'Pequeño', 2]]);
  });

  test('editar: version sube, el precio cambia, auditoria con nombres de campos; sin tocar lo no enviado', async () => {
    const created = (await admin.post('/api/admin/products', { ...NEW, name: 'Galletas' })).json.product;
    const vid = created.variants[0].id;
    const r = await patch(admin, created.id, { version: created.version, name: 'Galletas de avena', variants: [variant({ id: vid, price: 8.9 })] });
    assert.equal(r.status, 200);
    assert.equal(r.json.product.version, 2);
    assert.equal(r.json.product.name, 'Galletas de avena');
    assert.equal(r.json.product.variants[0].price, 8.9);
    assert.equal(r.json.product.description, 'Copa de helado.');
    assert.equal(r.json.product.category, 'snack');
    const row = audit('product.update').find((a) => a.entity_id === created.id);
    assert.deepEqual(JSON.parse(row.detail_json), { fields: ['name', 'variants'], variantIds: [vid] });
    assert.doesNotMatch(row.detail_json, /Galletas|avena/);
  });

  test('editar: agregar un tamano, desactivar, etiquetas repetidas y variante ajena', async () => {
    const p = (await admin.post('/api/admin/products', { ...NEW, name: 'Alfajor' })).json.product;
    const v0 = p.variants[0];
    // agregar tamano (sin id) mientras el existente no viene en la lista
    let r = await patch(admin, p.id, { version: 1, variants: [variant({ label: 'Grande', price: 12 })] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.product.variants.map((v) => v.label), ['Único', 'Grande']);
    // repetir etiqueta de un tamano existente que no viene en la lista
    r = await patch(admin, p.id, { version: 2, variants: [variant({ id: r.json.product.variants[1].id, label: 'Único' })] });
    assert.equal(r.status, 400); assert.equal(r.json.errors.variants[0].label, 'duplicate');
    // variante de otro producto
    const other = (await admin.get('/api/admin/products')).json.products.find((x) => x.name === 'Gaseosa').variants[0].id;
    r = await patch(admin, p.id, { version: 2, variants: [variant({ id: other, price: 1 })] });
    assert.equal(r.status, 400); assert.equal(r.json.errors.variants[0].id, 'invalid');
    assert.equal(env.db.prepare('SELECT price FROM product_variants WHERE id = ?').get(other).price, 6.5);
    // desactivar un tamano y el producto
    r = await patch(admin, p.id, { version: 2, active: false, variants: [{ ...variant({ id: v0.id }), active: false }] });
    assert.equal(r.status, 200);
    assert.equal(r.json.product.active, false); assert.equal(r.json.product.variants[0].active, false);
  });

  test('editar: validaciones, 404 y conversion de combo no permitida', async () => {
    const p = (await admin.post('/api/admin/products', { ...NEW, name: 'Pastel' })).json.product;
    assert.equal((await patch(admin, p.id, { name: 'x' })).status, 400);                       // sin version
    assert.equal((await patch(admin, p.id, { version: 1, name: '' })).json.errors.name, 'required');
    assert.equal((await patch(admin, p.id, { version: 1, category: 'combo' })).json.errors.category, 'combo_change');
    assert.equal((await patch(admin, p.id, { version: 1, variants: [variant({ price: 0 })] })).json.errors.variants[0].price, 'out_of_range');
    assert.equal((await patch(admin, p.id, { version: 1, category: 'drink' })).status, 200);
    assert.equal((await patch(admin, 99999, { version: 1, name: 'x' })).status, 404);
    const combo = byName((await admin.get('/api/admin/products')).json.products, 'Combo personal');
    assert.equal((await patch(admin, combo.id, { version: combo.version, category: 'snack' })).json.errors.category, 'combo_change');
    // un combo conserva su composicion si no se envia includes, y se puede cambiar
    let r = await patch(admin, combo.id, { version: combo.version, name: 'Combo personal plus', category: 'combo' });
    assert.equal(r.status, 200);
    assert.equal(r.json.product.variants[0].includes.length, 2);
    const agua = byName((await admin.get('/api/admin/products')).json.products, 'Agua mineral').variants[0].id;
    r = await patch(admin, combo.id, { version: r.json.product.version, includes: [{ variantId: agua, qty: 3 }] });
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.product.variants[0].includes.map((i) => [i.name, i.qty]), [['Agua mineral', 3]]);
  });

  test('versionado optimista: dos ediciones con la misma version -> la segunda es 409 stale con el estado actual', async () => {
    const p = (await admin.post('/api/admin/products', { ...NEW, name: 'Turron' })).json.product;
    const a = await patch(admin, p.id, { version: 1, name: 'Turron de miel' });
    assert.equal(a.status, 200);
    const b = await patch(admin, p.id, { version: 1, name: 'Turron de nuez' });
    assert.equal(b.status, 409);
    assert.equal(b.json.error, 'stale');
    assert.equal(b.json.current.name, 'Turron de miel');
    assert.equal(b.json.current.version, 2);
    assert.equal(env.db.prepare('SELECT name FROM products WHERE id = ?').get(p.id).name, 'Turron de miel');
  });
});

describe('disponibilidad por sede', () => {
  const productId = (name) => env.db.prepare('SELECT id FROM products WHERE name = ?').get(name).id;

  test('el gerente marca agotado y disponible en su sede; auditoria con sede', async () => {
    const id = productId('Hot dog clásico');
    const r = await put(manager, `/api/admin/products/${id}/branches/1`, { status: 'sold_out' });
    assert.equal(r.status, 200);
    assert.equal(r.json.product.variants[0].availability[0].status, 'sold_out');
    assert.equal(r.json.product.version, 1, 'no cambia la version del producto');
    const rows = audit('product.stock').filter((a) => a.entity_id === id);
    assert.equal(rows.length, 1);
    assert.equal(rows[0].branch_id, 1);
    assert.equal(JSON.parse(rows[0].detail_json).status, 'sold_out');
    // en otra sede sigue disponible
    const a = (await admin.get(`/api/admin/products/${id}`)).json.product.variants[0].availability;
    assert.equal(a.find((x) => x.branchId === 1).status, 'sold_out');
    assert.equal(a.find((x) => x.branchId === 2).status, 'available');
    // repetir el mismo estado no audita de nuevo
    await put(manager, `/api/admin/products/${id}/branches/1`, { status: 'sold_out' });
    assert.equal(audit('product.stock').filter((x) => x.entity_id === id).length, 1);
    const back = await put(manager, `/api/admin/products/${id}/branches/1`, { status: 'available' });
    assert.equal(back.json.product.variants[0].availability[0].status, 'available');
    assert.equal(audit('product.stock').filter((x) => x.entity_id === id).length, 2);
  });

  test('el gerente de otra sede -> 404 y no cambia nada; sede inexistente -> 404', async () => {
    const id = productId('Agua mineral');
    const before = env.db.prepare('SELECT COUNT(*) c FROM branch_variants').get().c;
    assert.equal((await put(manager, `/api/admin/products/${id}/branches/3`, { status: 'sold_out' })).status, 404);
    assert.equal((await put(otherManager, `/api/admin/products/${id}/branches/1`, { status: 'sold_out' })).status, 404);
    assert.equal((await put(admin, `/api/admin/products/${id}/branches/999`, { status: 'sold_out' })).status, 404);
    assert.equal((await put(admin, `/api/admin/products/999999/branches/1`, { status: 'sold_out' })).status, 404);
    assert.equal((await put(admin, `/api/admin/products/${id}/branches/abc`, { status: 'sold_out' })).status, 404);
    assert.equal(env.db.prepare('SELECT COUNT(*) c FROM branch_variants').get().c, before);
  });

  test('el admin central marca en cualquier sede; por tamano o todos los tamanos del producto', async () => {
    const pop = byName((await admin.get('/api/admin/products')).json.products, 'Canchita salada');
    const g = pop.variants.find((v) => v.label === 'Grande');
    let r = await put(admin, `/api/admin/products/${pop.id}/branches/2`, { status: 'sold_out', variantId: g.id });
    assert.equal(r.status, 200);
    const st = (res, label, b) => res.json.product.variants.find((v) => v.label === label).availability.find((x) => x.branchId === b).status;
    assert.equal(st(r, 'Grande', 2), 'sold_out'); assert.equal(st(r, 'Pequeño', 2), 'available');
    r = await put(admin, `/api/admin/products/${pop.id}/branches/2`, { status: 'sold_out' });
    assert.ok(['Pequeño', 'Mediano', 'Grande'].every((l) => st(r, l, 2) === 'sold_out'));
    r = await put(admin, `/api/admin/products/${pop.id}/branches/2`, { status: 'available' });
    assert.ok(['Pequeño', 'Mediano', 'Grande'].every((l) => st(r, l, 2) === 'available'));
  });

  test('validacion: estado invalido o tamano de otro producto -> 400', async () => {
    const id = productId('Agua mineral');
    let r = await put(admin, `/api/admin/products/${id}/branches/1`, { status: 'roto' });
    assert.equal(r.status, 400); assert.equal(r.json.errors.status, 'invalid_option');
    r = await put(admin, `/api/admin/products/${id}/branches/1`, {});
    assert.equal(r.json.errors.status, 'required');
    const other = env.db.prepare(`SELECT v.id FROM product_variants v JOIN products p ON p.id = v.product_id WHERE p.name = 'Gaseosa' LIMIT 1`).get().id;
    r = await put(admin, `/api/admin/products/${id}/branches/1`, { status: 'sold_out', variantId: other });
    assert.equal(r.status, 400); assert.equal(r.json.errors.variantId, 'invalid');
  });
});

describe('API publica del menu', () => {
  test('sin sesion, no-store, combos primero; solo activos; agotados se muestran como agotados', async () => {
    const r = await anon.get('/api/menu?branchId=2');
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.deepEqual(r.json.limits, { maxQty: 10, maxUnits: 20, maxLines: 12 });
    assert.equal(r.json.branch.id, 2);
    const cats = r.json.products.map((p) => p.category);
    const firstNonCombo = cats.findIndex((c) => c !== 'combo');
    assert.ok(firstNonCombo > 0 && cats.slice(firstNonCombo).every((c) => c !== 'combo'));
    const nachos = byName(r.json.products, 'Nachos con queso');
    assert.equal(nachos.variants[0].available, false);                // agotado en la sede 2 (semilla)
    assert.equal(nachos.categoryLabel, 'Dulces y snacks');
    assert.equal(nachos.artKey, 'nachos');
    // el combo familiar incluye nachos: tambien queda agotado en esa sede; otras sedes lo tienen disponible
    assert.equal(byName(r.json.products, 'Combo familiar').variants[0].available, false);
    assert.equal(byName(r.json.products, 'Combo pareja').variants[0].available, true);
    const r1 = await anon.get('/api/menu?branchId=4');
    assert.equal(byName(r1.json.products, 'Nachos con queso').variants[0].available, true);
    assert.equal(byName(r1.json.products, 'Combo familiar').variants[0].available, true);
    // datos medibles y texto de personas
    const mediano = byName(r.json.products, 'Canchita salada').variants.find((v) => v.label === 'Mediano');
    assert.deepEqual([mediano.volumeMl, mediano.volumeOz, mediano.heightCm, mediano.topDiamCm, mediano.bottomDiamCm, mediano.serves, mediano.servesText],
      [2300, 78, 26, 17, 12, 2, 'Ideal para 2 personas']);
    assert.deepEqual(byName(r.json.products, 'Combo pareja').variants[0].includes.map((i) => [i.name, i.label, i.qty]), [['Canchita salada', 'Mediano', 1], ['Gaseosa', 'Mediano', 2]]);
    // sin campos internos
    assert.equal(JSON.stringify(r.json).includes('version'), false);
    assert.equal(JSON.stringify(r.json).includes('updated'), false);
  });

  test('no expone productos ni tamanos inactivos; un tamano inactivo de un combo lo deja agotado', async () => {
    const list = (await admin.get('/api/admin/products')).json.products;
    const agua = byName(list, 'Agua mineral');
    const chicha = byName(list, 'Chicha morada');
    assert.equal((await patch(admin, agua.id, { version: agua.version, active: false })).status, 200);
    const gran = chicha.variants.find((v) => v.label === 'Grande');
    assert.equal((await patch(admin, chicha.id, { version: chicha.version, variants: [{ ...variant({ id: gran.id, label: 'Grande', price: gran.price }), active: false }] })).status, 200);
    const menu = (await anon.get('/api/menu?branchId=1')).json;
    assert.equal(byName(menu.products, 'Agua mineral'), undefined);
    assert.deepEqual(byName(menu.products, 'Chicha morada').variants.map((v) => v.label), ['Mediano']);
    // desactivar un componente deja el combo agotado (no se puede preparar)
    const gaseosa = byName((await admin.get('/api/admin/products')).json.products, 'Gaseosa');
    const peq = gaseosa.variants.find((v) => v.label === 'Mediano');
    await patch(admin, gaseosa.id, { version: gaseosa.version, variants: [{ ...variant({ id: peq.id, label: 'Mediano', price: peq.price }), active: false }] });
    const m2 = (await anon.get('/api/menu?branchId=1')).json;
    assert.equal(byName(m2.products, 'Combo pareja').variants[0].available, false);
    assert.equal(byName(m2.products, 'Gaseosa').variants.some((v) => v.label === 'Mediano'), false);
    // un producto sin tamanos activos no aparece
    const all = (await anon.get('/api/menu?branchId=1')).json.products;
    assert.ok(all.every((p) => p.variants.length > 0));
  });

  test('refleja de inmediato el agotado marcado por el gerente', async () => {
    const id = env.db.prepare('SELECT id FROM products WHERE name = ?').get('Confites surtidos').id;
    await put(manager, `/api/admin/products/${id}/branches/1`, { status: 'sold_out' });
    assert.equal(byName((await anon.get('/api/menu?branchId=1')).json.products, 'Confites surtidos').variants[0].available, false);
    assert.equal(byName((await anon.get('/api/menu?branchId=4')).json.products, 'Confites surtidos').variants[0].available, true);
  });

  test('/api/menu valida branchId; /api/screenings/:id/menu usa la sede de la funcion y da 404 si no se ofrece', async () => {
    assert.equal((await anon.get('/api/menu')).status, 400);
    assert.equal((await anon.get('/api/menu?branchId=abc')).status, 400);
    assert.equal((await anon.get('/api/menu?branchId=0')).status, 400);
    assert.equal((await anon.get('/api/menu?branchId=999')).status, 404);
    const sc = env.db.prepare(`SELECT id, branch_id FROM screenings WHERE status NOT IN ('draft','cancelled') LIMIT 1`).get();
    const r = await anon.get(`/api/screenings/${sc.id}/menu`);
    assert.equal(r.status, 200);
    assert.equal(r.json.branch.id, sc.branch_id);
    assert.equal(r.headers.get('cache-control'), 'no-store');
    assert.equal((await anon.get('/api/screenings/999999/menu')).status, 404);
    assert.equal((await anon.get('/api/screenings/abc/menu')).status, 404);
    env.db.prepare(`UPDATE screenings SET status = 'cancelled' WHERE id = ?`).run(sc.id);
    assert.equal((await anon.get(`/api/screenings/${sc.id}/menu`)).status, 404);
    env.db.prepare(`UPDATE screenings SET status = 'draft' WHERE id = ?`).run(sc.id);
    assert.equal((await anon.get(`/api/screenings/${sc.id}/menu`)).status, 404);
  });

  test('un cliente con sesion y el personal ven el mismo menu publico', async () => {
    const a = await customer.get('/api/menu?branchId=1');
    const b = await anon.get('/api/menu?branchId=1');
    assert.deepEqual(a.json, b.json);
  });
});

test('la consola no registra datos personales ni nombres de productos en el audit_log', () => {
  const all = env.db.prepare(`SELECT detail_json FROM audit_log WHERE action LIKE 'product.%'`).all().map((r) => r.detail_json ?? '').join('');
  assert.doesNotMatch(all, /@|Ana Prueba/);
});
