import { useRef, useState } from 'react';

// Patrón de grilla accesible (roving tabindex), igual que en el mapa de
// butacas: un solo Tab entra/sale del grupo completo; las flechas mueven el
// foco entre los elementos. Se usa SOLO en grupos de elementos repetidos del
// mismo tipo (pósters, tarjetas de cine) — nunca para reemplazar Tab en la
// navegación general del sitio, que seguiría rompiendo el modo de lectura
// nativo de los lectores de pantalla.
//
// `columns` asume el número de columnas del layout de escritorio: en
// pantallas angostas donde el CSS reduce las columnas, Arriba/Abajo pueden
// saltar una fila de más — una simplificación razonable porque la
// combinación teclado físico + viewport muy angosto es poco común.
export function useGridKeyboardNav(itemCount, columns) {
  const [focusedIndex, setFocusedIndex] = useState(0);
  const itemRefs = useRef([]);

  const registerItemRef = (index) => (el) => { itemRefs.current[index] = el; };

  const focusIndex = (next) => {
    setFocusedIndex(next);
    itemRefs.current[next]?.focus();
  };

  const handleGridKeyDown = (e) => {
    const idx = parseInt(e.target.dataset.gridIndex, 10);
    if (Number.isNaN(idx) || itemCount === 0) return;
    let next = idx;
    if (e.key === 'ArrowRight') next = Math.min(idx + 1, itemCount - 1);
    else if (e.key === 'ArrowLeft') next = Math.max(idx - 1, 0);
    else if (e.key === 'ArrowDown') next = Math.min(idx + columns, itemCount - 1);
    else if (e.key === 'ArrowUp') next = Math.max(idx - columns, 0);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = itemCount - 1;
    else return;
    e.preventDefault();
    focusIndex(next);
  };

  return { focusedIndex, setFocusedIndex, registerItemRef, handleGridKeyDown };
}
