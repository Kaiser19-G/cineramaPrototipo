// Parametros de cuentas y sesiones (valores aprobados en la fase 2).
import { POLICY_VERSION } from '../../src/shared/policy.js';

const MIN = 60 * 1000;
const HOUR = 60 * MIN;

export const AUTH = {
  PENDING_TTL: 30 * MIN,          // un registro sin verificar caduca y libera DNI/correo/celular
  CODE_TTL: 10 * MIN,
  CODE_MAX_ATTEMPTS: 5,
  RESEND_COOLDOWN: 60 * 1000,
  RESEND_MAX_PER_HOUR: 3,         // reenvios (ademas del codigo inicial)
  LOGIN: { max: 5, windowMs: 15 * MIN, lockMs: 15 * MIN },
  LOGIN_IP: { max: 30, windowMs: 15 * MIN, lockMs: 15 * MIN },
  REGISTER_IP: { max: 10, windowMs: 15 * MIN, lockMs: 15 * MIN },
  SESSION_IDLE: 12 * HOUR,
  SESSION_ABSOLUTE: 7 * 24 * HOUR,
  SESSION_COOKIE: 'cinerama_sid',
  VERIFY_COOKIE: 'cinerama_verify',
  POLICY_VERSION,
};
export { HOUR, MIN };
