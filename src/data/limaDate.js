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
