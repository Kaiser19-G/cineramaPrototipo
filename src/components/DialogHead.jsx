import { X } from 'lucide-react';
import './DialogHead.css';

// Cabecera común de los diálogos-formulario del panel: título a la izquierda y botón "Cerrar" (X) arriba a la derecha.
// Queda fija arriba mientras se desplaza el cuerpo; la barra de acciones (.mv-dialog-actions / .claims-dialog-actions)
// queda fija abajo (ver DialogHead.css). `onClose` hace lo mismo que "Cancelar" (normalmente `dialog.close()`).
// El título recibe el foco al abrir (atributo autofocus) para que se lea primero y no el botón de cerrar.
export default function DialogHead({ id, title, onClose, disabled = false }) {
  return (
    <div className="mv-dialog-head">
      <h2 id={id} tabIndex={-1} ref={(el) => { el?.setAttribute('autofocus', ''); }}>{title}</h2>
      <button type="button" className="mv-dialog-x" onClick={onClose} disabled={disabled} aria-label="Cerrar">
        <X size={20} aria-hidden="true" />
      </button>
    </div>
  );
}
