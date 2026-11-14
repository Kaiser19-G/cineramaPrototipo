// Importes del panel en soles. Solo formato de texto: no hay lógica de cobro.
const FMT = new Intl.NumberFormat('es-PE', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
export const money = (n) => `S/ ${FMT.format(Number(n) || 0)}`;
