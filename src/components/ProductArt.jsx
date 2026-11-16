import './ProductArt.css';

// Ilustraciones propias de los productos de confitería, dibujadas en SVG dentro del código: sin fotos, sin archivos
// ni recursos externos. `artKey` es una clave cerrada (ART_KEYS), nunca una URL. Solo usan tokens de color del tema,
// así que siguen el tema claro/oscuro y los modos de visión; la forma y el contorno (no solo el tono) distinguen cada pieza.
// Por defecto son decorativas (aria-hidden): el nombre del producto va siempre como texto al lado. Con `title` pasan a
// role="img" con ese nombre accesible.

const OUTLINE = { stroke: 'var(--art-line)', strokeWidth: 2.5, strokeLinejoin: 'round', strokeLinecap: 'round' };

const Popcorn = () => (
  <g>
    {/* palomitas */}
    {[[40, 44, 11], [56, 36, 13], [74, 42, 12], [48, 54, 10], [66, 54, 11], [84, 52, 8], [32, 54, 8]].map(([cx, cy, r]) => (
      <circle key={`${cx}-${cy}`} cx={cx} cy={cy} r={r} fill="var(--art-gold)" {...OUTLINE} />
    ))}
    {/* cubeta */}
    <path d="M28 58 H92 L84 108 Q83 112 79 112 H41 Q37 112 36 108 Z" fill="var(--art-surface)" {...OUTLINE} />
    <path d="M44 58 L46 112 H54 L52 58 Z" fill="var(--art-red)" />
    <path d="M68 58 L66 112 H74 L76 58 Z" fill="var(--art-red)" />
    <path d="M28 58 H92" {...OUTLINE} />
  </g>
);

const Soda = () => (
  <g>
    {/* sorbete */}
    <path d="M66 36 L72 12 H90" fill="none" stroke="var(--art-red)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
    {/* tapa */}
    <rect x="30" y="34" width="60" height="10" rx="4" fill="var(--art-surface)" {...OUTLINE} />
    {/* vaso */}
    <path d="M35 44 H85 L79 106 Q78 112 72 112 H48 Q42 112 41 106 Z" fill="var(--art-surface)" {...OUTLINE} />
    <path d="M38 62 H82 L80 88 H40 Z" fill="var(--art-red)" />
    <path d="M38 62 H82 M40 88 H80" fill="none" stroke="var(--art-line)" strokeWidth="2" />
  </g>
);

const Water = () => (
  <g>
    <rect x="50" y="8" width="20" height="12" rx="3" fill="var(--art-red)" {...OUTLINE} />
    <path d="M52 20 H68 V30 Q82 38 82 52 V104 Q82 112 74 112 H46 Q38 112 38 104 V52 Q38 38 52 30 Z" fill="var(--art-surface)" {...OUTLINE} />
    <path d="M38 62 H82 V88 H38 Z" fill="var(--art-red)" />
    <path d="M38 62 H82 M38 88 H82" fill="none" stroke="var(--art-line)" strokeWidth="2" />
    <path d="M46 46 Q53 41 60 46 T74 46" fill="none" stroke="var(--art-line)" strokeWidth="2.5" strokeLinecap="round" />
  </g>
);

const Nachos = () => (
  <g>
    {/* nachos */}
    <path d="M24 66 L40 34 L56 66 Z" fill="var(--art-gold)" {...OUTLINE} />
    <path d="M48 62 L66 28 L84 62 Z" fill="var(--art-gold)" {...OUTLINE} />
    <path d="M70 66 L84 40 L98 66 Z" fill="var(--art-gold)" {...OUTLINE} />
    {/* queso */}
    <path d="M32 62 Q44 76 58 66 Q72 78 90 62 L88 72 H34 Z" fill="var(--art-brown)" {...OUTLINE} />
    {/* bandeja */}
    <path d="M16 68 H104 L94 108 Q93 112 89 112 H31 Q27 112 26 108 Z" fill="var(--art-red)" {...OUTLINE} />
    <path d="M30 84 H90" fill="none" stroke="var(--art-surface)" strokeWidth="3" strokeLinecap="round" />
  </g>
);

const HotDog = () => (
  <g>
    <rect x="12" y="62" width="96" height="38" rx="19" fill="var(--art-brown)" {...OUTLINE} />
    <rect x="8" y="48" width="104" height="22" rx="11" fill="var(--art-red)" {...OUTLINE} />
    <path d="M18 56 L26 50 L34 56 L42 50 L50 56 L58 50 L66 56 L74 50 L82 56 L90 50 L98 56 L102 52" fill="none" stroke="var(--art-gold)" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round" />
    <rect x="12" y="72" width="96" height="28" rx="14" fill="var(--art-brown)" {...OUTLINE} />
    <path d="M12 76 Q60 66 108 76" fill="none" stroke="var(--art-line)" strokeWidth="2" />
  </g>
);

const Candy = () => (
  <g>
    <path d="M30 20 L36 14 L42 20 L48 14 L54 20 L60 14 L66 20 L72 14 L78 20 L84 14 L90 20 V108 Q90 112 86 112 H34 Q30 112 30 108 Z" fill="var(--art-red)" {...OUTLINE} />
    <circle cx="48" cy="58" r="9" fill="var(--art-gold)" {...OUTLINE} />
    <rect x="62" y="48" width="18" height="18" rx="4" fill="var(--art-surface)" {...OUTLINE} />
    <path d="M45 88 L54 74 L63 88 Z" fill="var(--art-surface)" {...OUTLINE} />
    <circle cx="74" cy="86" r="7" fill="var(--art-gold)" {...OUTLINE} />
  </g>
);

const Combo = () => (
  <g>
    <g transform="translate(-6 4) scale(0.8)"><Popcorn /></g>
    <g transform="translate(56 14) scale(0.78)"><Soda /></g>
  </g>
);

const ART = { popcorn: Popcorn, soda: Soda, water: Water, nachos: Nachos, hotdog: HotDog, candy: Candy, combo: Combo };

export default function ProductArt({ artKey, title, className = '' }) {
  const Shape = ART[artKey] ?? Combo;
  const a11y = title ? { role: 'img', 'aria-label': title } : { 'aria-hidden': 'true', focusable: 'false' };
  return (
    <svg className={`product-art ${className}`.trim()} viewBox="0 0 120 120" {...a11y}>
      {title && <title>{title}</title>}
      <Shape />
    </svg>
  );
}

