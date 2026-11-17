import { useState, useEffect, useRef } from 'react';
import { useA11yPrefs, FONT_SCALES, VISION_MODES } from '../hooks/useA11yPrefs';
import './AccessibilityWidget.css';

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const { prefs, setTheme, setVision, stepFont, resetFont, resetAll, fontIdx } = useA11yPrefs();
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  // Foco atrapado + Esc para cerrar
  useEffect(() => {
    if (!open) return;
    const panel = panelRef.current;
    const focusables = panel.querySelectorAll(
      'button:not([disabled]), [href], input:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first?.focus();

    const onKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpen(false);
        buttonRef.current?.focus();
      } else if (e.key === 'Tab' && focusables.length > 0) {
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [open]);

  const closeAndReturnFocus = () => {
    setOpen(false);
    buttonRef.current?.focus();
  };

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        className="a11y-fab"
        aria-label="Opciones de accesibilidad"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
      >
        <svg width="26" height="26" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
          <circle cx="12" cy="12" r="11" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="12" cy="6.2" r="1.8" />
          <path d="M12 9.2c-2.9 0-6 .7-6 1.9v1.1c1.1-.5 2.4-.8 3.5-.9l.6 2.8-2 4.8h2l1.6-4 .3-1 .3 1 1.6 4h2l-2-4.8.6-2.8c1.1.1 2.4.4 3.5.9v-1.1c0-1.2-3.1-1.9-6-1.9Z" />
        </svg>
      </button>

      {open && (
        <div className="a11y-overlay" onMouseDown={closeAndReturnFocus}>
          <div
            className="a11y-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="a11y-title"
            ref={panelRef}
            onMouseDown={(e) => e.stopPropagation()}
          >
            <div className="a11y-panel-header">
              <h2 id="a11y-title">Opciones de accesibilidad</h2>
              <button type="button" className="a11y-close" aria-label="Cerrar panel de accesibilidad" onClick={closeAndReturnFocus}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden="true">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </button>
            </div>

            <section className="a11y-section">
              <h3 className="a11y-section-title">Tema</h3>
              <div className="a11y-segment" role="group" aria-label="Tema">
                <button
                  type="button"
                  aria-pressed={prefs.theme === 'dark'}
                  className={prefs.theme === 'dark' ? 'active' : ''}
                  onClick={() => setTheme('dark')}
                >
                  Oscuro
                </button>
                <button
                  type="button"
                  aria-pressed={prefs.theme === 'light'}
                  className={prefs.theme === 'light' ? 'active' : ''}
                  onClick={() => setTheme('light')}
                >
                  Claro
                </button>
              </div>
            </section>

            <section className="a11y-section">
              <h3 className="a11y-section-title">Tamaño de letra</h3>
              <div className="a11y-font-row">
                <button
                  type="button"
                  className="a11y-font-btn"
                  aria-label="Reducir tamaño de letra"
                  onClick={() => stepFont(-1)}
                  disabled={fontIdx === 0}
                >
                  A−
                </button>
                <span className="a11y-font-level" aria-live="polite">{prefs.fontScale}%</span>
                <button
                  type="button"
                  className="a11y-font-btn"
                  aria-label="Aumentar tamaño de letra"
                  onClick={() => stepFont(1)}
                  disabled={fontIdx === FONT_SCALES.length - 1}
                >
                  A+
                </button>
                <button type="button" className="a11y-mini-reset" onClick={resetFont}>
                  Restablecer
                </button>
              </div>
            </section>

            <section className="a11y-section">
              <h3 className="a11y-section-title">Visión de color</h3>
              <div className="a11y-vision-list" role="radiogroup" aria-label="Visión de color">
                {VISION_MODES.map((m) => (
                  <label key={m.value} className={`a11y-vision-option ${prefs.vision === m.value ? 'active' : ''}`}>
                    <input
                      type="radio"
                      name="a11y-vision"
                      value={m.value}
                      checked={prefs.vision === m.value}
                      onChange={() => setVision(m.value)}
                    />
                    <span className="a11y-vision-swatch" aria-hidden="true">
                      <span style={{ background: m.swatches[0] }} />
                      <span style={{ background: m.swatches[1] }} />
                    </span>
                    <span className="a11y-vision-text">
                      <strong>{m.label}</strong>
                      <small>{m.desc}</small>
                    </span>
                  </label>
                ))}
              </div>
            </section>

            <button type="button" className="a11y-reset-all" onClick={resetAll}>
              Restablecer todo
            </button>
          </div>
        </div>
      )}
    </>
  );
}
