import { useState, useEffect, useRef } from 'react';
import './AccessibilityWidget.css';

const STORAGE_KEY = 'cinerama-a11y';
const FONT_SCALES = [100, 115, 130, 150];
const DEFAULT_PREFS = { theme: 'dark', fontScale: 100, vision: 'default' };

const VISION_MODES = [
  { value: 'default', label: 'Normal', swatches: ['#E50914', '#2EC771'], desc: 'Paleta de marca original.' },
  { value: 'protan-deutan', label: 'Protanopia / Deuteranopia', swatches: ['#0072B2', '#E69F00'], desc: 'Azul para acción y éxito, naranja para error.' },
  { value: 'tritan', label: 'Tritanopia', swatches: ['#C2185B', '#00695C'], desc: 'Magenta para acción, verde azulado para éxito.' },
  { value: 'mono', label: 'Monocromático', swatches: ['#111111', '#9A9A9A'], desc: 'Escala de grises de alto contraste, con borde e ícono reforzados.' },
];

function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    if (saved && saved.theme && saved.fontScale && saved.vision) return saved;
  } catch {
    /* localStorage inaccesible: se usan los valores por defecto */
  }
  const prefersLight = typeof window !== 'undefined' && window.matchMedia
    && window.matchMedia('(prefers-color-scheme: light)').matches;
  return { ...DEFAULT_PREFS, theme: prefersLight ? 'light' : 'dark' };
}

function savePrefs(prefs) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* modo privado u otra restricción: la preferencia solo dura la sesión */
  }
}

export default function AccessibilityWidget() {
  const [open, setOpen] = useState(false);
  const [prefs, setPrefs] = useState(loadPrefs);
  const buttonRef = useRef(null);
  const panelRef = useRef(null);

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-theme', prefs.theme);
    html.setAttribute('data-font-scale', String(prefs.fontScale));
    html.setAttribute('data-vision', prefs.vision);
    savePrefs(prefs);
  }, [prefs]);

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

  const setTheme = (theme) => setPrefs((p) => ({ ...p, theme }));
  const setVision = (vision) => setPrefs((p) => ({ ...p, vision }));

  const stepFont = (dir) => setPrefs((p) => {
    const idx = FONT_SCALES.indexOf(p.fontScale);
    const nextIdx = Math.min(Math.max(idx + dir, 0), FONT_SCALES.length - 1);
    return { ...p, fontScale: FONT_SCALES[nextIdx] };
  });

  const resetFont = () => setPrefs((p) => ({ ...p, fontScale: 100 }));
  const resetAll = () => setPrefs({ ...DEFAULT_PREFS });

  const fontIdx = FONT_SCALES.indexOf(prefs.fontScale);

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
