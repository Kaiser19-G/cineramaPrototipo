import { todayInLima, addDaysToDate } from './limaDate.js';

// Fuente única de fechas para toda la web pública (resuelve H-04: antes cada
// pantalla tenía su propio arreglo fijo de fechas que no coincidía con las
// demás — "Hoy Lunes" en un filtro, "Hoy Miércoles 20" en otro).
export function getNextDays(count = 3, now = new Date()) {
  const days = [];
  const start = todayInLima(now);
  for (let i = 0; i < count; i++) {
    const value = addDaysToDate(start, i); // YYYY-MM-DD, igual que screenings.date
    const d = new Date(`${value}T12:00:00Z`);
    const weekday = new Intl.DateTimeFormat('es-PE', { weekday: 'long', timeZone: 'UTC' }).format(d);
    const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const label = i === 0 ? `Hoy ${weekdayCap}` : `${weekdayCap} ${d.getUTCDate()}`;
    days.push({ value, label });
  }
  return days;
}

// "10 de diciembre de 2026" a partir de una fecha de calendario YYYY-MM-DD (sin zona horaria).
export function formatDateLong(ymd) {
  if (!ymd) return '';
  return new Intl.DateTimeFormat('es-PE', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' })
    .format(new Date(`${ymd}T12:00:00Z`));
}
