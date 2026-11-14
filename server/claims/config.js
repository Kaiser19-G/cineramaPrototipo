// Parametros de los reclamos de DNI (fase 2b, valores aprobados).
const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

export const CLAIMS = {
  MAX_FILE: 5 * 1024 * 1024,      // 5 MB por archivo
  MIN_FILE: 2048,                 // menos que esto no es una foto de un documento
  KINDS: ['dni_front', 'dni_back', 'letter', 'selfie'],
  REQUIRED: ['dni_front', 'dni_back', 'letter'],
  DRAFT_TTL: HOUR,                // un borrador sin enviar caduca y se borra
  PENDING_TTL: 30 * DAY,          // un reclamo sin resolver caduca y se borra
  RESERVE_TTL: 7 * DAY,           // DNI liberado: reservado para el correo del reclamo
  ORPHAN_AGE: HOUR,               // archivos sin fila en la BD se borran pasada esta edad
  MAX_OPEN_PER_DNI: 3,
  MAX_OPEN_TOTAL: 200,
  UPLOAD_CONCURRENCY: 4,          // subidas simultaneas (acota la memoria: ~4 x 5 MB)
  NOTE_MAX: 300,
  CREATE_IP: { max: 3, windowMs: DAY, lockMs: DAY },            // reclamos nuevos por IP
  PROBE_IP: { max: 10, windowMs: 15 * MIN, lockMs: 15 * MIN },  // intentos de crear (oraculo de DNI)
  UPLOAD_IP: { max: 60, windowMs: 15 * MIN, lockMs: 15 * MIN },
  CODE_FAIL_IP: { max: 10, windowMs: 15 * MIN, lockMs: 15 * MIN }, // codigos desconocidos
  STATUS_IP: { max: 30, windowMs: 15 * MIN, lockMs: 15 * MIN },
  SWEEP_EVERY: HOUR,
};

// Motivos predefinidos (los ve quien reclamo). 'other' exige nota.
export const REASONS = {
  approve: {
    verified: 'Verificamos que eres el titular del DNI. Ya puedes registrarte con tu DNI.',
  },
  reject: {
    illegible: 'Las fotos o la carta no se leen con claridad.',
    mismatch: 'Los datos del reclamo no coinciden con el documento.',
    incomplete: 'Falta información: revisa que la carta esté firmada y que se vean las dos caras del DNI.',
    not_verifiable: 'No pudimos comprobar que seas el titular del DNI.',
    other: 'Otro motivo (ver la nota).',
  },
  system: {
    superseded: 'Se cerró porque otro reclamo por el mismo DNI ya fue resuelto.',
    expired: 'El reclamo venció sin ser resuelto.',
  },
};
export const reasonText = (code) => REASONS.approve[code] ?? REASONS.reject[code] ?? REASONS.system[code] ?? null;
export { MIN, HOUR, DAY };
