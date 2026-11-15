// Distribucion de butacas generada a partir del total de butacas de la funcion (screenings.total_seats, una
// instantanea de la capacidad de la sala). Determinista y compartida por el servidor (valida ids) y el cliente
// (dibuja el mapa). La fila A es la mas cercana a la pantalla; la ultima fila puede quedar incompleta.
export const MAX_SEATS_PER_SCREENING = 520; // 26 filas x 20 columnas

export function columnsFor(total) {
  if (total <= 100) return 10;
  if (total <= 160) return 14;
  if (total <= 220) return 16;
  return 20;
}

// { cols, rows: [{ label: 'A', seats: n }] } | null si el total no es una capacidad valida.
export function layoutFor(total) {
  if (!Number.isInteger(total) || total < 1 || total > MAX_SEATS_PER_SCREENING) return null;
  const cols = columnsFor(total);
  const rows = [];
  for (let left = total, r = 0; left > 0; left -= cols, r++) {
    rows.push({ label: String.fromCharCode(65 + r), seats: Math.min(cols, left) });
  }
  return { cols, rows };
}

export const seatId = (rowLabel, n) => `${rowLabel}${n}`;
const SEAT_RE = /^([A-Z])([1-9]\d?)$/;

// true si `id` existe en la distribucion de `total` butacas.
export function isValidSeat(total, id) {
  const m = typeof id === 'string' ? SEAT_RE.exec(id) : null;
  const layout = m && layoutFor(total);
  if (!layout) return false;
  const row = layout.rows.find((r) => r.label === m[1]);
  return !!row && Number(m[2]) <= row.seats;
}

export function allSeatIds(total) {
  const layout = layoutFor(total);
  return layout ? layout.rows.flatMap((r) => Array.from({ length: r.seats }, (_, i) => seatId(r.label, i + 1))) : [];
}

// Orden natural de butacas (A2 antes que A10).
export const compareSeats = (a, b) => (a[0] === b[0] ? Number(a.slice(1)) - Number(b.slice(1)) : (a[0] < b[0] ? -1 : 1));
