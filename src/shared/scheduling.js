import { absMinutes } from '../data/limaDate.js';

// Parámetros de programación aprobados por el negocio (se usan en el servidor y en el formulario).
export const CLEANING_MINUTES = 15;        // limpieza entre dos funciones de la misma sala
export const MIN_LEAD_MINUTES = 30;        // no se programa con menos anticipación que esta
export const START_STEP_MINUTES = 5;       // la hora de inicio va en pasos de 5 minutos
export const MAX_TICKET_PRICE = 500;       // tope razonable del precio (S/)

// Una sala 3D proyecta 2D y 3D; una sala 2D solo 2D.
export const hallSupportsFormat = (hallType, format) => format === '2D' || hallType === format;

export const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;
export const toMinutes = (hhmm) => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };
export const fromMinutes = (min) => {
  const m = ((min % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
};
// Hora de fin (HH:MM, puede cruzar la medianoche) de una función que empieza a `startTime` y dura `duration` minutos.
export const endTimeOf = (startTime, duration) => fromMinutes(toMinutes(startTime) + duration);

// Intervalo absoluto (minutos de calendario de Lima) de una función. La duración sale de start_time/end_time:
// si el fin es menor o igual que el inicio, cruza la medianoche.
export function screeningSpan(date, startTime, endTime) {
  const start = absMinutes(date, toMinutes(startTime));
  const diff = (toMinutes(endTime) - toMinutes(startTime) + 1440) % 1440;
  return { start, end: start + (diff === 0 ? 1440 : diff) };
}

export const SCREENING_STATUS_LABELS = {
  draft: 'Borrador', scheduled: 'Programada', active: 'Activa', sold_out: 'Agotada', finished: 'Finalizada', cancelled: 'Cancelada',
};

// Estado efectivo: la cancelada se mantiene; la terminada si ya acabó; la agotada si no quedan butacas.
export function effectiveStatus(row, nowAbs) {
  if (row.status === 'cancelled' || row.status === 'draft') return row.status;
  const { start, end } = screeningSpan(row.starts_on ?? row.date, row.start_time ?? row.startTime, row.end_time ?? row.endTime);
  if (end <= nowAbs || row.status === 'finished') return 'finished';
  const booked = row.booked_seats ?? row.bookedSeats; const total = row.total_seats ?? row.totalSeats;
  if (booked >= total) return 'sold_out';
  if (row.status === 'sold_out') return 'sold_out';
  return start <= nowAbs ? 'active' : row.status;
}
