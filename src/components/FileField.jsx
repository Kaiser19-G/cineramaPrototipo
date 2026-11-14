import { useEffect, useState } from 'react';
import FieldError from './FieldError';
import { formatSize } from '../utils/claimImage';
import './FileField.css';

// Solo en pantallas tactiles se ofrece "Tomar foto" (capture abre la camara; en escritorio no aporta).
const useCoarsePointer = () => {
  const [coarse, setCoarse] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches);
  useEffect(() => {
    const mq = window.matchMedia?.('(pointer: coarse)');
    if (!mq) return undefined;
    const on = () => setCoarse(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return coarse;
};

const ACCEPT = 'image/jpeg,image/png,image/webp';

// Campo de una foto: etiqueta, instrucciones, elegir o tomar, vista previa con texto alternativo, quitar, progreso y error.
// Todo es operable con teclado (inputs nativos, sin arrastrar y soltar). `value`: { name, size, url } | null.
export default function FileField({
  id, label, hint, required = true, value, busy, progress, error, onPick, onRemove, statusText,
}) {
  const coarse = useCoarsePointer();
  const titleId = `${id}-title`;
  const hintId = `${id}-hint`;
  const errId = `${id}-err`;
  const statusId = `${id}-status`;
  const describedBy = [hintId, statusText && statusId, error && errId].filter(Boolean).join(' ');

  const pick = (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // permite elegir de nuevo el mismo archivo
    if (file) onPick(file);
  };
  const input = (inputId, chooseId, chooseLabel, extra = {}) => (
    <>
      <input
        id={inputId} type="file" accept={ACCEPT} className="file-input" onChange={pick}
        aria-labelledby={`${titleId} ${chooseId}`} aria-describedby={describedBy}
        aria-required={required || undefined} aria-invalid={Boolean(error)} {...extra}
      />
      <label htmlFor={inputId} id={chooseId} className="file-btn">{chooseLabel}</label>
    </>
  );

  return (
    <div className="form-group file-field">
      <span id={titleId} className="file-title">
        {label}{' '}
        <span className="file-req">{required ? '(obligatorio)' : '(opcional)'}</span>
      </span>
      <p className="field-hint" id={hintId}>{hint}</p>
      <div className="file-actions">
        {input(id, `${id}-choose`, value ? 'Cambiar archivo' : 'Elegir archivo')}
        {coarse && input(`${id}-camera`, `${id}-camera-lbl`, 'Tomar foto', { capture: 'environment' })}
        {value && <button type="button" className="file-btn file-btn-quiet" onClick={onRemove}>Quitar<span className="sr-only"> {label}</span></button>}
      </div>
      <p className="sr-only" role="status" id={statusId}>{statusText}</p>
      {busy && <p className="field-hint" aria-hidden="true">Preparando la imagen…</p>}
      {value && (
        <div className="file-preview">
          <img src={value.url} alt={`Vista previa de ${label}: ${value.name}, ${formatSize(value.size)}`} />
          <p className="file-meta"><strong>{value.name}</strong><br />{formatSize(value.size)}</p>
        </div>
      )}
      {progress != null && (
        <div className="file-progress">
          <progress max="100" value={progress} aria-label={`Subiendo ${label}`} />
          <span aria-hidden="true">{progress} %</span>
        </div>
      )}
      {error && <FieldError id={errId} message={error} />}
    </div>
  );
}
