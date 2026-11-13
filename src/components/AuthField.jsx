import FieldError from './FieldError';

// Campo de formulario de cuentas: etiqueta, ayuda visible (aria-describedby) y error en linea.
export default function AuthField({ id, label, hint, error, inputRef, required = true, ...inputProps }) {
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const describedBy = [hint && hintId, error && errId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="form-group">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        name={id}
        ref={inputRef}
        aria-required={required || undefined}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        {...inputProps}
      />
      {hint && <p className="field-hint" id={hintId}>{hint}</p>}
      {error && <FieldError id={errId} message={error} />}
    </div>
  );
}
