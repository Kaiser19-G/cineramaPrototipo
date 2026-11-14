// Fecha de calendario en America/Lima (UTC-5, sin horario de verano).
// Compartido por el cliente y el servidor: "hoy" no depende de la zona
// horaria de la maquina ni del navegador.
const LIMA_FMT = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit',
});

// 'YYYY-MM-DD' del instante `now` visto en Lima.
export function todayInLima(now = new Date()) {
  return LIMA_FMT.format(now);
}

// Suma `n` dias a una fecha de calendario 'YYYY-MM-DD' (aritmetica en UTC
// sobre la fecha, sin horas, asi no cruza mal la medianoche).
export function addDaysToDate(ymd, n) {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

// "Ahora" en America/Lima: { date: 'YYYY-MM-DD', minutes: minutos desde la medianoche, abs: minutos absolutos }.
// `abs` permite comparar instantes de calendario de Lima (fecha + hora) sin zonas horarias: ver absMinutes().
const LIMA_PARTS = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Lima', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});
// Minutos transcurridos desde 1970-01-01 00:00 hasta la fecha-hora de calendario dada (sin zona).
export function absMinutes(ymd, minutesOfDay = 0) {
  const [y, m, d] = ymd.split('-').map(Number);
  return Date.UTC(y, m - 1, d) / 60000 + minutesOfDay;
}
export function nowInLima(now = new Date()) {
  const p = Object.fromEntries(LIMA_PARTS.formatToParts(now).map((x) => [x.type, x.value]));
  const date = `${p.year}-${p.month}-${p.day}`;
  const minutes = Number(p.hour) * 60 + Number(p.minute);
  return { date, minutes, abs: absMinutes(date, minutes) };
}
