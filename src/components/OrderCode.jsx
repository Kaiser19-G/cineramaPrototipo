import { useState, useRef } from 'react';

// Codigo de orden en texto grande y copiable. El boton nombra el codigo y el resultado se anuncia (role="status").
export default function OrderCode({ code, large = false }) {
  const [msg, setMsg] = useState('');
  const codeRef = useRef(null);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setMsg('Código copiado al portapapeles.');
    } catch {
      const range = document.createRange(); range.selectNodeContents(codeRef.current);
      const sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range);
      setMsg('Código seleccionado: pulsa Ctrl+C para copiarlo.');
    }
  };

  return (
    <div className={`order-code-block${large ? ' is-large' : ''}`}>
      <p className="order-code-caption">Código de la orden</p>
      <p className="order-code-row">
        <code className="order-code-text" ref={codeRef}>{code}</code>
        <button type="button" className="btn-outline order-copy-btn" onClick={copy} aria-label={`Copiar código ${code}`}>Copiar</button>
      </p>
      <span className="order-copy-status" role="status">{msg}</span>
    </div>
  );
}
