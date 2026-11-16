import { test } from 'node:test';
import assert from 'node:assert/strict';
import { layoutSizes, hasMeasures, pricePer100ml, PHONE, PX_PER_CM } from '../../src/shared/sizeScale.js';

const V = (id, h, top, bottom, extra = {}) => ({ id, heightCm: h, topDiamCm: top, bottomDiamCm: bottom, price: 10, volumeMl: 500, ...extra });

test('comparador: una sola escala y proporciones correctas entre figuras y celular', () => {
  const lay = layoutSizes([V(1, 22, 14, 10), V(2, 31, 20, 14)]);
  const phone = lay.figures.find((f) => f.kind === 'phone');
  const [a, b] = lay.figures.filter((f) => f.kind === 'size');
  assert.equal(phone.h, PHONE.heightCm * PX_PER_CM);
  assert.equal(a.h / phone.h, 22 / 15);
  assert.equal(b.h / phone.h, 31 / 15);
  assert.equal(b.h / a.h, 31 / 22);
  assert.equal(phone.w / phone.h, 7 / 15);
  // todas apoyadas en la misma base
  for (const f of lay.figures) assert.ok(Math.abs(f.y + f.h - lay.baseY) < 1e-9);
  // el trapecio usa los diámetros reales a la misma escala
  const xs = b.points.split(' ').map((p) => Number(p.split(',')[0]));
  assert.ok(Math.abs((xs[1] - xs[0]) - 20 * PX_PER_CM) < 1e-9);
  assert.ok(Math.abs((xs[2] - xs[3]) - 14 * PX_PER_CM) < 1e-9);
});

test('comparador: tamaños sin medidas completas quedan fuera y con menos de dos no hay dibujo', () => {
  assert.equal(hasMeasures({ heightCm: 10, topDiamCm: 5, bottomDiamCm: null }), false);
  const lay = layoutSizes([V(1, 22, 14, 10), V(2, null, 20, 14), V(3, 31, 20, 14)]);
  assert.deepEqual(lay.figures.filter((f) => f.kind === 'size').map((f) => f.id), [1, 3]);
  assert.equal(layoutSizes([V(1, 22, 14, 10), V(2, 31, 20, null)]), null);
  assert.equal(layoutSizes([V(1, 22, 14, 10)]), null);
  assert.equal(layoutSizes([]), null);
});

test('comparador: las figuras no se solapan y caben en el viewBox', () => {
  const lay = layoutSizes([V(1, 22, 14, 10), V(2, 26, 17, 12), V(3, 31, 20, 14)]);
  for (let i = 1; i < lay.figures.length; i++) assert.ok(lay.figures[i].x >= lay.figures[i - 1].x + lay.figures[i - 1].w);
  const last = lay.figures.at(-1);
  assert.ok(last.x + last.w <= lay.width);
  assert.ok(Math.min(...lay.figures.map((f) => f.y)) >= 0);
});

test('precio por 100 ml', () => {
  assert.equal(pricePer100ml({ price: 9.9, volumeMl: 1400 }).toFixed(2), '0.71');
  assert.equal(pricePer100ml({ price: 9.9, volumeMl: null }), null);
});
