import { useState, useRef, useEffect, useId } from 'react';
import { Accessibility, Check, X, Sun, Moon } from 'lucide-react';
import { useA11yPrefs, VISION_MODES } from '../../hooks/useA11yPrefs';
import { useMediaQuery } from '../../hooks/useMediaQuery';
import './PanelAccessibility.css';

// Control de accesibilidad del PANEL (barra superior): tema, tamaño de letra y
// visión de color. Usa las mismas preferencias que el botón flotante del sitio
// público (hook useA11yPrefs, clave cinerama-a11y). Es un popover NO modal:
// se abre con el botón, se cierra con Esc, con un clic fuera o con su botón de
// cerrar, y devuelve el foco al botón al cerrarse con teclado.
const TEMAS = [
  { value: 'dark', label: 'Oscuro', icon: Moon },
  { value: 'light', label: 'Claro', icon: Sun },
];

// El panel nunca aplica más de 130 % por debajo de este ancho (ver App.css / index.css).
const ANGOSTO = '(max-width: 768px)';
const TOPE_ANGOSTO = 130;

export default function PanelAccessibility() {
  const { prefs, setTheme, setVision, stepFont, resetFont, resetAll, fontIdx } = useA11yPrefs();
  const [open, setOpen] = useState(false);
  const [aviso, setAviso] = useState('');
  const angosto = useMediaQuery(ANGOSTO);
  const rootRef = useRef(null);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const uid = useId();
  const popId = `${uid}-pop`;
  const titleId = `${uid}-title`;

  // Al abrir, el foco pasa a la opción de tema marcada.
  useEffect(() => {
    if (open) popRef.current?.querySelector('input[name$="-tema"]:checked')?.focus();
  }, [open]);

  // Esc cierra y devuelve el foco al botón; un clic fuera cierra sin robar el foco.
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setOpen(false); btnRef.current?.focus(); } };
    const onDown = (e) => { if (!rootRef.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [open]);

  // Si el foco sale del control con Tab, el popover se cierra.
  const onBlur = (e) => { if (open && e.relatedTarget && !rootRef.current?.contains(e.relatedTarget)) setOpen(false); };

  const capado = angosto && prefs.fontScale > TOPE_ANGOSTO;

  return (
    <div className="pa11y" ref={rootRef} onBlur={onBlur}>
      <button
        type="button" ref={btnRef} className="pa11y-btn" id={`${uid}-btn`}
        aria-label="Accesibilidad" aria-haspopup="dialog" aria-expanded={open} aria-controls={popId}
        onClick={() => setOpen((o) => !o)}
      >
        <Accessibility size={18} aria-hidden="true" />
        <span className="pa11y-btn-text" aria-hidden="true">Accesibilidad</span>
      </button>

      {/* Región viva discreta: anuncia cada cambio sin mover el foco. */}
      <div className="sr-only" role="status" aria-live="polite">{aviso}</div>

      {open && (
        <div className="pa11y-pop" id={popId} ref={popRef} role="dialog" aria-modal="false" aria-labelledby={titleId}>
          <div className="pa11y-head">
            <h2 id={titleId} className="pa11y-title">Opciones de accesibilidad</h2>
            <button type="button" className="pa11y-close" aria-label="Cerrar opciones de accesibilidad" onClick={() => { setOpen(false); btnRef.current?.focus(); }}>
              <X size={16} aria-hidden="true" />
            </button>
          </div>

          <fieldset className="pa11y-group">
            <legend className="pa11y-legend">Tema</legend>
            <div className="pa11y-seg">
              {TEMAS.map(({ value, label, icon: Icon }) => (
                <label key={value}>
                  <input
                    type="radio" name={`${uid}-tema`} value={value} checked={prefs.theme === value}
                    onChange={() => { setTheme(value); setAviso(`Tema ${label.toLowerCase()} activado`); }}
                  />
                  <Icon size={15} aria-hidden="true" />
                  <span>{label}</span>
                  {prefs.theme === value && <Check size={14} aria-hidden="true" className="pa11y-check" />}
                </label>
              ))}
            </div>
          </fieldset>

          <div className="pa11y-group" role="group" aria-labelledby={`${uid}-letra`}>
            <div className="pa11y-legend" id={`${uid}-letra`}>Tamaño de letra</div>
            <div className="pa11y-font">
              <button
                type="button" className="pa11y-step" aria-label="Reducir tamaño de letra" disabled={fontIdx === 0}
                onClick={() => { const n = [100, 115, 130, 150][Math.max(fontIdx - 1, 0)]; stepFont(-1); setAviso(`Tamaño de letra ${n} %`); }}
              >A−</button>
              <span className="pa11y-level">{prefs.fontScale} %</span>
              <button
                type="button" className="pa11y-step" aria-label="Aumentar tamaño de letra" disabled={fontIdx === 3}
                onClick={() => { const n = [100, 115, 130, 150][Math.min(fontIdx + 1, 3)]; stepFont(1); setAviso(`Tamaño de letra ${n} %`); }}
              >A+</button>
              <button type="button" className="pa11y-mini" onClick={() => { resetFont(); setAviso('Tamaño de letra 100 %'); }}>Restablecer</button>
            </div>
            {capado && (
              <p className="pa11y-note">
                En pantallas angostas el panel usa como máximo {TOPE_ANGOSTO} %. Tu preferencia de {prefs.fontScale} % se conserva y se aplica en pantallas más anchas.
              </p>
            )}
          </div>

          <fieldset className="pa11y-group">
            <legend className="pa11y-legend">Visión de color</legend>
            <div className="pa11y-vision-list">
              {VISION_MODES.map((m) => (
                <label key={m.value} className="pa11y-vision">
                  <input
                    type="radio" name={`${uid}-vision`} value={m.value} checked={prefs.vision === m.value}
                    onChange={() => { setVision(m.value); setAviso(`Visión de color: ${m.label}`); }}
                  />
                  <span className="pa11y-swatch" aria-hidden="true">
                    <span style={{ background: m.swatches[0] }} />
                    <span style={{ background: m.swatches[1] }} />
                  </span>
                  <span className="pa11y-vision-text">
                    <strong>{m.label}</strong>
                    <small>{m.desc}</small>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          <button type="button" className="pa11y-reset" onClick={() => { resetAll(); setAviso('Opciones de accesibilidad restablecidas'); }}>
            Restablecer todo
          </button>
        </div>
      )}
    </div>
  );
}
