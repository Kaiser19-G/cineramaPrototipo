// Fuente única de fechas para toda la web pública (resuelve H-04: antes cada
// pantalla tenía su propio arreglo fijo de fechas que no coincidía con las
// demás — "Hoy Lunes" en un filtro, "Hoy Miércoles 20" en otro).
export function getNextDays(count = 3) {
  const days = [];
  const today = new Date();
  for (let i = 0; i < count; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() + i);
    const weekday = new Intl.DateTimeFormat('es-PE', { weekday: 'long' }).format(d);
    const weekdayCap = weekday.charAt(0).toUpperCase() + weekday.slice(1);
    const value = d.toISOString().split('T')[0]; // YYYY-MM-DD, igual que screenings.date
    const label = i === 0 ? `Hoy ${weekdayCap}` : `${weekdayCap} ${d.getDate()}`;
    days.push({ value, label });
  }
  return days;
}
