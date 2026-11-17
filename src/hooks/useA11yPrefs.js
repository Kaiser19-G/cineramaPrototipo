import { useState, useEffect, useCallback } from 'react';

// Preferencias de accesibilidad COMPARTIDAS entre el sitio público (botón
// flotante, AccessibilityWidget) y el panel de administración (control de la
// barra superior): una persona, una configuración, una sola clave.
// El estado se guarda en localStorage y se aplica como tres atributos de <html>
// (data-theme, data-font-scale, data-vision); el script de index.html los
// aplica antes del primer pintado para evitar el parpadeo.

export const A11Y_STORAGE_KEY = 'cinerama-a11y';
export const FONT_SCALES = [100, 115, 130, 150];
export const DEFAULT_PREFS = { theme: 'dark', fontScale: 100, vision: 'default' };

export const VISION_MODES = [
  { value: 'default', label: 'Normal', swatches: ['#E50914', '#2EC771'], desc: 'Paleta de marca original.' },
  { value: 'protan-deutan', label: 'Protanopia / Deuteranopia', swatches: ['#0072B2', '#E69F00'], desc: 'Azul para acción y éxito, naranja para error.' },
  { value: 'tritan', label: 'Tritanopia', swatches: ['#C2185B', '#00695C'], desc: 'Magenta para acción, verde azulado para éxito.' },
  { value: 'mono', label: 'Monocromático', swatches: ['#111111', '#9A9A9A'], desc: 'Escala de grises de alto contraste, con borde e ícono reforzados.' },
];

export function loadPrefs() {
  try {
    const saved = JSON.parse(localStorage.getItem(A11Y_STORAGE_KEY) || 'null');
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
    localStorage.setItem(A11Y_STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* modo privado u otra restricción: la preferencia solo dura la sesión */
  }
}

export function useA11yPrefs() {
  const [prefs, setPrefs] = useState(loadPrefs);

  useEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-theme', prefs.theme);
    html.setAttribute('data-font-scale', String(prefs.fontScale));
    html.setAttribute('data-vision', prefs.vision);
    savePrefs(prefs);
  }, [prefs]);

  const setTheme = useCallback((theme) => setPrefs((p) => ({ ...p, theme })), []);
  const setVision = useCallback((vision) => setPrefs((p) => ({ ...p, vision })), []);
  const stepFont = useCallback((dir) => setPrefs((p) => {
    const idx = FONT_SCALES.indexOf(p.fontScale);
    const nextIdx = Math.min(Math.max(idx + dir, 0), FONT_SCALES.length - 1);
    return { ...p, fontScale: FONT_SCALES[nextIdx] };
  }), []);
  const resetFont = useCallback(() => setPrefs((p) => ({ ...p, fontScale: 100 })), []);
  const resetAll = useCallback(() => setPrefs({ ...DEFAULT_PREFS }), []);

  return { prefs, setTheme, setVision, stepFont, resetFont, resetAll, fontIdx: FONT_SCALES.indexOf(prefs.fontScale) };
}
