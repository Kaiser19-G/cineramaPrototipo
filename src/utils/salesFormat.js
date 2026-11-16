// Textos y formatos de Pagos, Reportes y Dashboard.
export const CHANNEL_LABELS = { web: 'Web', counter: 'Taquilla' };
export const pctText = (n) => `${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 1 }).format(n)} %`;
export const dayLabel = (ymd) => {
  const t = new Intl.DateTimeFormat('es-PE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));
  return t.charAt(0).toUpperCase() + t.slice(1);
};
export const shortDay = (ymd) => new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', timeZone: 'UTC' }).format(new Date(`${ymd}T12:00:00Z`));
