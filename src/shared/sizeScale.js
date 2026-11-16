// Geometría del comparador de tamaños de confitería. Función pura (sin React) para poder probarla con node --test.
// Una sola escala para todas las figuras: PX_PER_CM unidades del viewBox por centímetro. No se inventa ninguna medida:
// un tamaño sin alto, diámetro superior y diámetro de la base completos queda fuera del dibujo (pero sí va en la tabla).

export const PX_PER_CM = 10;
export const PHONE = { label: 'Celular de 15 cm', heightCm: 15, widthCm: 7 };
const GAP_CM = 3;
const MARGIN_LEFT_CM = 2.5; // espacio de la regla
const MARGIN_RIGHT_CM = 1;
const MARGIN_TOP_CM = 1;
const MARGIN_BOTTOM_CM = 0.8;

const isPos = (n) => typeof n === 'number' && Number.isFinite(n) && n > 0;
export const hasMeasures = (v) => isPos(v?.heightCm) && isPos(v?.topDiamCm) && isPos(v?.bottomDiamCm);

// Devuelve null si menos de dos tamaños tienen medidas completas (no hay nada que comparar a escala).
// Cada figura: { id, kind: 'phone' | 'size', x, y, w, h, points (solo tamaños: trapecio), cx (centro, en % del ancho) }.
export function layoutSizes(variants) {
  const measured = (variants ?? []).filter(hasMeasures);
  if (measured.length < 2) return null;
  const S = PX_PER_CM;
  const items = [
    { id: 'phone', kind: 'phone', wCm: PHONE.widthCm, hCm: PHONE.heightCm },
    ...measured.map((v) => ({
      id: v.id, kind: 'size', wCm: Math.max(v.topDiamCm, v.bottomDiamCm), hCm: v.heightCm, topCm: v.topDiamCm, bottomCm: v.bottomDiamCm,
    })),
  ];
  const tallest = Math.max(...items.map((i) => i.hCm));
  const width = (MARGIN_LEFT_CM + MARGIN_RIGHT_CM + GAP_CM * (items.length - 1) + items.reduce((s, i) => s + i.wCm, 0)) * S;
  const height = (MARGIN_TOP_CM + MARGIN_BOTTOM_CM + tallest) * S;
  const baseY = height - MARGIN_BOTTOM_CM * S;
  let cursor = MARGIN_LEFT_CM * S;
  const figures = items.map((i) => {
    const w = i.wCm * S;
    const h = i.hCm * S;
    const x = cursor;
    const y = baseY - h;
    const mid = x + w / 2;
    cursor += w + GAP_CM * S;
    const fig = { id: i.id, kind: i.kind, x, y, w, h, cx: (mid / width) * 100 };
    if (i.kind === 'size') {
      const t = (i.topCm * S) / 2;
      const b = (i.bottomCm * S) / 2;
      fig.points = `${mid - t},${y} ${mid + t},${y} ${mid + b},${baseY} ${mid - b},${baseY}`;
    }
    return fig;
  });
  const rulerTicks = [];
  for (let cm = 0; cm <= Math.floor(tallest); cm += 5) rulerTicks.push({ cm, y: baseY - cm * S, long: cm % 10 === 0 });
  return { scale: S, width, height, baseY, figures, rulerTicks, rulerX: MARGIN_LEFT_CM * S - S };
}

// Precio por 100 ml (null si no hay volumen).
export const pricePer100ml = (v) => (isPos(v?.volumeMl) && isPos(v?.price) ? (v.price / v.volumeMl) * 100 : null);
