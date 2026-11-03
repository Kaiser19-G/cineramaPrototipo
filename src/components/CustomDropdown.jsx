import { useState, useRef, useEffect, useId } from 'react';

export default function CustomDropdown({ label, placeholder, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const btnRef = useRef(null);
  const menuRef = useRef(null);
  const listId = useId();

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Al abrir, mueve el foco a la opción seleccionada (o a la primera) para
  // que las flechas funcionen de inmediato — patrón ARIA listbox.
  useEffect(() => {
    if (open && menuRef.current) {
      const selected = menuRef.current.querySelector('[aria-selected="true"]');
      (selected || menuRef.current.querySelector('[role="option"]'))?.focus();
    }
  }, [open]);

  const closeAndReturnFocus = () => {
    setOpen(false);
    btnRef.current?.focus();
  };

  const handleMenuKeyDown = (e) => {
    const items = Array.from(menuRef.current.querySelectorAll('[role="option"]'));
    const currentIndex = items.indexOf(document.activeElement);
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      items[(currentIndex + 1) % items.length]?.focus();
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      items[(currentIndex - 1 + items.length) % items.length]?.focus();
    } else if (e.key === 'Home') {
      e.preventDefault();
      items[0]?.focus();
    } else if (e.key === 'End') {
      e.preventDefault();
      items[items.length - 1]?.focus();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      closeAndReturnFocus();
    } else if (e.key === 'Tab') {
      setOpen(false);
    }
  };

  return (
    <div className="custom-dd-wrapper" ref={ref}>
      <button
        type="button"
        ref={btnRef}
        className={`custom-dd-btn ${open ? 'open' : ''}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen(o => !o)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            setOpen(true);
          }
        }}
      >
        <div className="custom-dd-inner">
          <span className="custom-dd-label" id={listId}>{label}</span>
          <span className="custom-dd-value">{value || placeholder}</span>
        </div>
        <svg
          className={`custom-dd-chevron ${open ? 'rotated' : ''}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <ul
          className="custom-dd-menu"
          role="listbox"
          aria-labelledby={listId}
          ref={menuRef}
          onKeyDown={handleMenuKeyDown}
        >
          {value && (
            <li role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={false}
                className="custom-dd-item clear-item"
                onClick={() => { onChange(null); closeAndReturnFocus(); }}
              >
                — Todos —
              </button>
            </li>
          )}
          {options.map(opt => (
            <li key={opt} role="presentation">
              <button
                type="button"
                role="option"
                aria-selected={value === opt}
                className={`custom-dd-item ${value === opt ? 'selected' : ''}`}
                onClick={() => { onChange(opt); closeAndReturnFocus(); }}
              >
                {opt}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
