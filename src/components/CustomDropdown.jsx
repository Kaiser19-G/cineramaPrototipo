import { useState, useRef, useEffect } from 'react';

export default function CustomDropdown({ label, placeholder, options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handler = (e) => {
      if (ref.current && !ref.current.contains(e.target)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  return (
    <div className="custom-dd-wrapper" ref={ref}>
      <button 
        type="button"
        className={`custom-dd-btn ${open ? 'open' : ''}`} 
        onClick={() => setOpen(o => !o)}
      >
        <div className="custom-dd-inner">
          <span className="custom-dd-label">{label}</span>
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
        >
          <polyline points="6 9 12 15 18 9"/>
        </svg>
      </button>
      {open && (
        <ul className="custom-dd-menu">
          {value && (
            <li 
              className="custom-dd-item clear-item" 
              onClick={() => { onChange(null); setOpen(false); }}
            >
              — Todos —
            </li>
          )}
          {options.map(opt => (
            <li
              key={opt}
              className={`custom-dd-item ${value === opt ? 'selected' : ''}`}
              onClick={() => { onChange(opt); setOpen(false); }}
            >
              {opt}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
