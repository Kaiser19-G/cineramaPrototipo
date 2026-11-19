import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Plus, ShieldAlert, CheckCircle2, Ban, Trash2 } from 'lucide-react';
import { useCinema } from '../context/CinemaContext';
import { useAuth } from '../context/AuthContext';
import { adminApi } from '../api/admin';
import FieldError from '../components/FieldError';
import DialogHead from '../components/DialogHead';
import ProductArt from '../components/ProductArt';
import {
  PRODUCT_CATEGORIES, CATEGORY_LABELS, ART_KEYS, ART_LABELS, VARIANT_LABELS, STOCK_LABELS, TEXT_LIMITS, MAX_PRODUCT_PRICE,
  MAX_VARIANTS_PER_PRODUCT, MAX_COMBO_LINES, MAX_COMBO_QTY, MAX_SERVES, validateProduct,
} from '../shared/menu';
import './MovieManagement.css';
import './MenuManagement.css';

const money = (n) => `S/ ${Number(n).toFixed(2)}`;

// Medidas de un tamaño en una línea de texto ("2300 ml (78 oz) · 26 cm de alto · Ideal para 2 personas").
const measuresText = (v) => [
  v.volumeMl ? `${v.volumeMl} ml (${v.volumeOz} oz)` : null,
  v.heightCm ? `${v.heightCm} cm de alto` : null,
  v.topDiamCm ? `${v.topDiamCm} cm de diámetro superior` : null,
  v.bottomDiamCm ? `${v.bottomDiamCm} cm de base` : null,
  v.servesText,
].filter(Boolean).join(' · ');

const ERROR_TEXT = {
  required: 'Este campo es obligatorio.',
  too_long: 'Es demasiado largo.',
  invalid: 'El valor no es válido.',
  invalid_option: 'Elige una opción de la lista.',
  out_of_range: 'Está fuera del rango permitido.',
  invalid_decimals: 'Tiene demasiados decimales.',
  duplicate: 'Está repetido.',
  too_many: 'Hay demasiados elementos.',
  combo_single: 'Un combo tiene un solo tamaño.',
  combo_change: 'Un combo no puede cambiar de categoría, ni un producto convertirse en combo.',
  combo_in_combo: 'Un combo no puede incluir otro combo.',
  not_allowed: 'Solo los combos tienen contenido.',
};
const FIELD_ERROR = {
  price: { out_of_range: `Escribe un precio mayor que 0 y hasta S/ ${MAX_PRODUCT_PRICE}.00.`, invalid_decimals: 'Usa como máximo 2 decimales.' },
  volumeMl: { out_of_range: 'Escribe un número entero de 1 a 5000.' },
  heightCm: { out_of_range: 'Escribe un número mayor que 0 y hasta 100.', invalid_decimals: 'Usa como máximo 1 decimal.' },
  topDiamCm: { out_of_range: 'Escribe un número mayor que 0 y hasta 100.', invalid_decimals: 'Usa como máximo 1 decimal.' },
  bottomDiamCm: { out_of_range: 'Escribe un número mayor que 0 y hasta 100.', invalid_decimals: 'Usa como máximo 1 decimal.' },
  serves: { out_of_range: `Escribe un número entero de 1 a ${MAX_SERVES}.` },
  qty: { out_of_range: `Escribe un número entero de 1 a ${MAX_COMBO_QTY}.` },
  variantId: { invalid: 'Elige un producto de la lista.' },
};
const errText = (field, code) => FIELD_ERROR[field]?.[code] ?? ERROR_TEXT[code] ?? ERROR_TEXT.invalid;

const FIELD_LABEL = {
  name: 'Nombre', category: 'Categoría', artKey: 'Ilustración', description: 'Descripción', variants: 'Tamaños', includes: 'Contenido del combo',
  label: 'Tamaño', price: 'Precio', volumeMl: 'Volumen', heightCm: 'Alto', topDiamCm: 'Diámetro superior', bottomDiamCm: 'Diámetro de la base',
  serves: 'Personas', variantId: 'Producto', qty: 'Cantidad', id: 'Tamaño',
};

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;
const blankVariant = (label = 'Único') => ({ key: nextKey(), label, price: '', volumeMl: '', heightCm: '', topDiamCm: '', bottomDiamCm: '', serves: '1', active: true });
const EMPTY_FORM = { name: '', category: 'snack', description: '', artKey: 'candy', active: true, variants: [blankVariant()], includes: [] };

const s = (v) => (v === null || v === undefined ? '' : String(v));
const fromProduct = (p) => ({
  name: p.name, category: p.category, description: p.description ?? '', artKey: p.artKey, active: p.active,
  variants: p.variants.map((v) => ({
    key: nextKey(), id: v.id, label: v.label, price: s(v.price), volumeMl: s(v.volumeMl), heightCm: s(v.heightCm), topDiamCm: s(v.topDiamCm),
    bottomDiamCm: s(v.bottomDiamCm), serves: s(v.serves), active: v.active,
  })),
  includes: (p.variants[0]?.includes ?? []).map((i) => ({ key: nextKey(), variantId: String(i.variantId), qty: String(i.qty) })),
});

// Texto -> número; si no es un número válido se deja el texto (la validación lo marca) y vacío = undefined.
const num = (t) => {
  const x = String(t).trim();
  if (x === '') return undefined;
  return /^\d+([.,]\d+)?$/.test(x) ? Number(x.replace(',', '.')) : x;
};
const optNum = (t) => { const x = num(t); return x === undefined ? null : x; };

const toPayload = (f, editing) => {
  const body = {
    name: f.name.trim(), category: f.category, description: f.description.trim(), artKey: f.artKey, active: f.active,
    variants: f.variants.map((v) => ({
      ...(v.id ? { id: v.id } : {}), label: v.label, price: num(v.price), volumeMl: optNum(v.volumeMl), heightCm: optNum(v.heightCm),
      topDiamCm: optNum(v.topDiamCm), bottomDiamCm: optNum(v.bottomDiamCm), serves: num(v.serves), active: v.active,
    })),
  };
  if (f.category === 'combo') body.includes = f.includes.map((i) => ({ variantId: i.variantId ? Number(i.variantId) : null, qty: num(i.qty) }));
  else if (!editing) body.includes = [];
  return body;
};
const ALL_KEYS = new Set(['name', 'category', 'artKey', 'description', 'active', 'variants', 'includes']);

// Errores {campo:código, variants:{i:{campo:código}}, includes:{i:{...}}} -> lista plana con el id del control.
function flatten(errors) {
  const out = [];
  for (const [k, v] of Object.entries(errors)) {
    if (k === 'variants' || k === 'includes') {
      const p = k === 'variants' ? 'v' : 'i';
      if (typeof v === 'string') { out.push({ id: `mn-${k}`, label: FIELD_LABEL[k], code: v, field: k }); continue; }
      for (const [i, fe] of Object.entries(v)) {
        for (const [f, code] of Object.entries(fe)) {
          out.push({ id: `mn-${p}${i}-${f === 'id' ? 'label' : f}`, label: `${k === 'variants' ? 'Tamaño' : 'Contenido'} ${Number(i) + 1}: ${FIELD_LABEL[f] ?? f}`, code, field: f });
        }
      }
    } else out.push({ id: `mn-${k}`, label: FIELD_LABEL[k] ?? k, code: v, field: k });
  }
  return out;
}

// ───────────────────────── Diálogo de producto ─────────────────────────
function ProductDialog({ product, products, onClose, onSaved }) {
  const ref = useRef(null);
  const summaryRef = useRef(null);
  const editing = !!product;
  const [form, setForm] = useState(() => (product ? fromProduct(product) : EMPTY_FORM));
  const [version, setVersion] = useState(product?.version ?? null);
  const [errors, setErrors] = useState({});
  const [message, setMessage] = useState('');
  const [conflict, setConflict] = useState(null);
  const [busy, setBusy] = useState(false);
  const isCombo = form.category === 'combo';
  const comboLocked = editing;   // la categoría combo no se puede cambiar (el servidor lo rechaza igual)

  useEffect(() => { ref.current?.showModal(); }, []);

  const set = (k, v) => { setForm((p) => ({ ...p, [k]: v })); setErrors((p) => { if (!p[k]) return p; const n = { ...p }; delete n[k]; return n; }); };
  const setVariant = (i, k, v) => {
    setForm((p) => ({ ...p, variants: p.variants.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
    setErrors((p) => {
      if (!p.variants?.[i]?.[k]) return p;
      const n = { ...p, variants: { ...p.variants } };
      n.variants[i] = { ...n.variants[i] }; delete n.variants[i][k];
      return n;
    });
  };
  const setInclude = (i, k, v) => {
    setForm((p) => ({ ...p, includes: p.includes.map((x, j) => (j === i ? { ...x, [k]: v } : x)) }));
    setErrors((p) => {
      if (!p.includes?.[i]?.[k]) return p;
      const n = { ...p, includes: { ...p.includes } };
      n.includes[i] = { ...n.includes[i] }; delete n.includes[i][k];
      return n;
    });
  };
  const changeCategory = (c) => {
    setForm((p) => ({
      ...p, category: c,
      artKey: c === 'combo' ? 'combo' : p.artKey === 'combo' ? 'candy' : p.artKey,
      variants: c === 'combo' ? [{ ...p.variants[0], label: 'Único' }] : p.variants,
      includes: c === 'combo' && p.includes.length === 0 ? [{ key: nextKey(), variantId: '', qty: '1' }] : p.includes,
    }));
    setErrors({});
  };

  const showErrors = (errs, msg = '') => {
    setErrors(errs); setMessage(msg);
    requestAnimationFrame(() => summaryRef.current?.focus());
  };
  const focusField = (id) => document.getElementById(id)?.focus();

  // Componentes elegibles de un combo: tamaños activos de productos que no son combos (más los ya elegidos).
  const componentOptions = useMemo(() => {
    const chosen = new Set(form.includes.map((i) => i.variantId));
    return products.filter((p) => p.category !== 'combo').flatMap((p) => p.variants
      .filter((v) => (p.active && v.active) || chosen.has(String(v.id)))
      .map((v) => ({ id: String(v.id), text: `${p.name} (${v.label})` })));
  }, [products, form.includes]);

  const submit = async (e, overrideVersion) => {
    e?.preventDefault();
    setConflict(null); setMessage('');
    const payload = toPayload(form, editing);
    const local = validateProduct({ ...payload, includes: payload.includes ?? [] }, ALL_KEYS);
    if (Object.keys(local).length) { showErrors(local); return; }
    setBusy(true);
    const res = editing
      ? await adminApi.products.update(product.id, { ...payload, version: overrideVersion ?? version })
      : await adminApi.products.create(payload);
    setBusy(false);
    if (res.ok) { onSaved(res.data.product); ref.current?.close(); return; }
    if (res.status === 409 && res.error === 'stale') { setConflict({ current: res.data.current }); requestAnimationFrame(() => summaryRef.current?.focus()); return; }
    if (res.status === 400 && res.data.errors) { showErrors(res.data.errors); return; }
    showErrors({}, res.error === 'forbidden' ? 'No tienes permiso para hacer este cambio.'
      : res.status === 401 ? 'Tu sesión terminó. Inicia sesión de nuevo.'
        : res.error === 'network' ? 'No hay conexión con el servidor. Inténtalo de nuevo.' : 'No se pudo guardar. Inténtalo de nuevo.');
  };

  const list = flatten(errors);
  const fp = (id, code, hintId) => ({
    id, 'aria-invalid': code ? 'true' : undefined,
    'aria-describedby': [code ? `${id}-err` : null, hintId].filter(Boolean).join(' ') || undefined,
  });

  return (
    <dialog ref={ref} className="mv-dialog mn-dialog" aria-labelledby="mn-dialog-title" onClose={onClose}>
      <form onSubmit={submit} noValidate>
        <DialogHead id="mn-dialog-title" title={editing ? `Editar ${product.name}` : 'Nuevo producto'} onClose={() => ref.current?.close()} />
        <div ref={summaryRef} tabIndex={-1} className="mn-summary-wrap">
          {list.length > 0 && (
            <div className="mv-summary" role="alert">
              <h3>{list.length === 1 ? 'Hay 1 dato por corregir' : `Hay ${list.length} datos por corregir`}</h3>
              <ul>
                {list.map((x) => (
                  <li key={x.id}><a href={`#${x.id}`} onClick={(ev) => { ev.preventDefault(); focusField(x.id); }}>{x.label}</a>: {errText(x.field, x.code)}</li>
                ))}
              </ul>
            </div>
          )}
          {message && <p className="mv-summary mv-error-text" role="alert">{message}</p>}
          {conflict && (
            <div className="mv-conflict" role="alert">
              <h3>Otra persona cambió este producto mientras lo editabas</h3>
              <p>Lo que escribiste sigue aquí; no se perdió nada.</p>
              <div className="mv-dialog-actions" style={{ justifyContent: 'flex-start', marginTop: 0 }}>
                <button type="button" className="btn btn-primary btn-sm" disabled={busy}
                  onClick={() => { const v = conflict.current.version; setVersion(v); setConflict(null); submit(null, v); }}>
                  Guardar mis cambios encima
                </button>
                <button type="button" className="btn btn-secondary btn-sm" disabled={busy}
                  onClick={() => { setForm(fromProduct(conflict.current)); setVersion(conflict.current.version); setConflict(null); setErrors({}); }}>
                  Descartar los míos y cargar lo actual
                </button>
              </div>
            </div>
          )}
        </div>

        <fieldset className="mv-fieldset">
          <legend>Producto</legend>
          <div className="mv-field">
            <label htmlFor="mn-name">Nombre (obligatorio)</label>
            <input className="input" {...fp('mn-name', errors.name)} value={form.name} maxLength={TEXT_LIMITS.name + 10} autoComplete="off"
              onChange={(e) => set('name', e.target.value)} />
            {errors.name && <FieldError id="mn-name-err" message={errText('name', errors.name)} />}
          </div>
          <div className="mv-row">
            <div className="mv-field">
              <label htmlFor="mn-category">Categoría (obligatorio)</label>
              <select className="select" {...fp('mn-category', errors.category, comboLocked ? 'mn-category-hint' : undefined)} value={form.category}
                onChange={(e) => changeCategory(e.target.value)} disabled={comboLocked && isCombo}>
                {PRODUCT_CATEGORIES.filter((c) => !comboLocked || c !== 'combo' || isCombo).map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
              {editing && <p id="mn-category-hint" className="mv-hint">{isCombo ? 'Un combo no cambia de categoría.' : 'Un producto no se convierte en combo.'}</p>}
              {errors.category && <FieldError id="mn-category-err" message={errText('category', errors.category)} />}
            </div>
            <div className="mv-field">
              <label htmlFor="mn-artKey">Ilustración</label>
              <select className="select" {...fp('mn-artKey', errors.artKey)} value={form.artKey} onChange={(e) => set('artKey', e.target.value)}>
                {ART_KEYS.map((k) => <option key={k} value={k}>{ART_LABELS[k]}</option>)}
              </select>
              {errors.artKey && <FieldError id="mn-artKey-err" message={errText('artKey', errors.artKey)} />}
            </div>
          </div>
          <div className="mn-art-preview">
            <ProductArt artKey={form.artKey} className="mn-art-sm" />
            <p className="mv-hint">Vista previa de la ilustración. Son dibujos propios: no se suben fotos.</p>
          </div>
          <div className="mv-field">
            <label htmlFor="mn-description">Descripción</label>
            <textarea {...fp('mn-description', errors.description, 'mn-description-hint')} rows={3} value={form.description} onChange={(e) => set('description', e.target.value)} />
            <p id="mn-description-hint" className="mv-hint">Máximo {TEXT_LIMITS.description} caracteres. Texto simple.</p>
            {errors.description && <FieldError id="mn-description-err" message={errText('description', errors.description)} />}
          </div>
          <label className="mv-check" htmlFor="mn-active">
            <input type="checkbox" id="mn-active" aria-describedby="mn-active-hint" checked={form.active} onChange={(e) => set('active', e.target.checked)} />
            <span>Activo (se muestra en el menú)</span>
          </label>
          <p id="mn-active-hint" className="mv-hint">Un producto inactivo no se muestra al público. No se borra: puedes activarlo de nuevo.</p>
        </fieldset>

        <fieldset className="mv-fieldset" id="mn-variants" tabIndex={-1}>
          <legend>{isCombo ? 'Precio y personas' : 'Tamaños y precios'}</legend>
          <p className="mv-hint mn-block-hint">El precio es el mismo en todas las sedes. Las medidas reales sirven para comparar tamaños; si un tamaño no las tiene, déjalas vacías.</p>
          {typeof errors.variants === 'string' && <FieldError id="mn-variants-err" message={errText('variants', errors.variants)} />}
          {form.variants.map((v, i) => {
            const ve = errors.variants?.[i] ?? {};
            const id = (k) => `mn-v${i}-${k}`;
            const num1 = (k, label, hint) => (
              <div className="mv-field">
                <label htmlFor={id(k)}>{label}</label>
                <input className="input" {...fp(id(k), ve[k], hint ? `${id(k)}-hint` : undefined)} inputMode="decimal" value={v[k]} autoComplete="off"
                  onChange={(e) => setVariant(i, k, e.target.value)} />
                {hint && <p id={`${id(k)}-hint`} className="mv-hint">{hint}</p>}
                {ve[k] && <FieldError id={`${id(k)}-err`} message={errText(k, ve[k])} />}
              </div>
            );
            return (
              <fieldset key={v.key} className="mn-variant">
                <legend>{isCombo ? 'Combo' : `Tamaño ${i + 1}`}{v.label ? ` · ${v.label}` : ''}</legend>
                <div className="mv-row">
                  <div className="mv-field">
                    <label htmlFor={id('label')}>Tamaño</label>
                    <select className="select" {...fp(id('label'), ve.label)} value={v.label} disabled={isCombo}
                      onChange={(e) => setVariant(i, 'label', e.target.value)}>
                      {VARIANT_LABELS.map((l) => <option key={l} value={l}>{l}</option>)}
                    </select>
                    {ve.label && <FieldError id={`${id('label')}-err`} message={errText('label', ve.label)} />}
                  </div>
                  {num1('price', 'Precio en soles (obligatorio)', `Hasta 2 decimales, máximo S/ ${MAX_PRODUCT_PRICE}.00.`)}
                </div>
                {!isCombo && (
                  <div className="mn-measures">
                    {num1('volumeMl', 'Volumen (ml)')}
                    {num1('heightCm', 'Alto (cm)')}
                    {num1('topDiamCm', 'Diámetro superior (cm)')}
                    {num1('bottomDiamCm', 'Diámetro de la base (cm)')}
                  </div>
                )}
                <div className="mv-row">
                  {num1('serves', `Ideal para (personas, 1 a ${MAX_SERVES})`)}
                  <div className="mn-variant-tools">
                    <label className="mv-check" htmlFor={id('active')}>
                      <input type="checkbox" id={id('active')} checked={v.active} onChange={(e) => setVariant(i, 'active', e.target.checked)} />
                      <span>Tamaño activo</span>
                    </label>
                    {!v.id && form.variants.length > 1 && (
                      <button type="button" className="btn btn-secondary btn-sm" onClick={() => {
                        setForm((p) => ({ ...p, variants: p.variants.filter((x) => x.key !== v.key) }));
                        setErrors((p) => { const n = { ...p }; delete n.variants; return n; });
                        requestAnimationFrame(() => document.getElementById('mn-variants-add')?.focus());
                      }}>
                        <Trash2 size={14} aria-hidden="true" /> Quitar este tamaño<span className="sr-only"> ({v.label})</span>
                      </button>
                    )}
                  </div>
                </div>
              </fieldset>
            );
          })}
          {!isCombo && (
            <>
              <button type="button" id="mn-variants-add" className="btn btn-secondary btn-sm" aria-disabled={form.variants.length >= MAX_VARIANTS_PER_PRODUCT}
                aria-describedby="mn-variants-add-hint"
                onClick={() => {
                  if (form.variants.length >= MAX_VARIANTS_PER_PRODUCT) return;
                  const used = new Set(form.variants.map((x) => x.label));
                  const label = VARIANT_LABELS.find((l) => !used.has(l)) ?? 'Único';
                  const nv = blankVariant(label);
                  setForm((p) => ({ ...p, variants: [...p.variants, nv] }));
                  requestAnimationFrame(() => document.getElementById(`mn-v${form.variants.length}-label`)?.focus());
                }}>
                <Plus size={14} aria-hidden="true" /> Agregar un tamaño
              </button>
              <p id="mn-variants-add-hint" className="mv-hint" style={{ marginTop: 6 }}>
                {form.variants.length >= MAX_VARIANTS_PER_PRODUCT ? `Máximo ${MAX_VARIANTS_PER_PRODUCT} tamaños.` : 'Un tamaño ya guardado no se borra: desmárcalo como activo.'}
              </p>
            </>
          )}
        </fieldset>

        {isCombo && (
          <fieldset className="mv-fieldset" id="mn-includes" tabIndex={-1}>
            <legend>Contenido del combo</legend>
            <p className="mv-hint mn-block-hint">Elige los productos sueltos que incluye (un combo no puede incluir otro combo). Si alguno se agota en una sede, el combo también.</p>
            {typeof errors.includes === 'string' && <FieldError id="mn-includes-err" message={errText('includes', errors.includes)} />}
            {form.includes.map((it, i) => {
              const ie = errors.includes?.[i] ?? {};
              return (
                <div key={it.key} className="mn-include-row">
                  <div className="mv-field">
                    <label htmlFor={`mn-i${i}-variantId`}>Producto {i + 1}</label>
                    <select className="select" {...fp(`mn-i${i}-variantId`, ie.variantId)} value={it.variantId} onChange={(e) => setInclude(i, 'variantId', e.target.value)}>
                      <option value="">Elige un producto</option>
                      {componentOptions.map((o) => <option key={o.id} value={o.id}>{o.text}</option>)}
                    </select>
                    {ie.variantId && <FieldError id={`mn-i${i}-variantId-err`} message={errText('variantId', ie.variantId)} />}
                  </div>
                  <div className="mv-field mn-qty">
                    <label htmlFor={`mn-i${i}-qty`}>Cantidad {i + 1}</label>
                    <input className="input" {...fp(`mn-i${i}-qty`, ie.qty)} inputMode="numeric" value={it.qty} autoComplete="off" onChange={(e) => setInclude(i, 'qty', e.target.value)} />
                    {ie.qty && <FieldError id={`mn-i${i}-qty-err`} message={errText('qty', ie.qty)} />}
                  </div>
                  <button type="button" className="btn btn-secondary btn-sm mn-include-remove" onClick={() => {
                    setForm((p) => ({ ...p, includes: p.includes.filter((x) => x.key !== it.key) }));
                    setErrors((p) => { const n = { ...p }; delete n.includes; return n; });
                    requestAnimationFrame(() => document.getElementById('mn-includes-add')?.focus());
                  }}>
                    <Trash2 size={14} aria-hidden="true" /> Quitar<span className="sr-only"> producto {i + 1}</span>
                  </button>
                </div>
              );
            })}
            <button type="button" id="mn-includes-add" className="btn btn-secondary btn-sm" aria-disabled={form.includes.length >= MAX_COMBO_LINES}
              onClick={() => {
                if (form.includes.length >= MAX_COMBO_LINES) return;
                setForm((p) => ({ ...p, includes: [...p.includes, { key: nextKey(), variantId: '', qty: '1' }] }));
                requestAnimationFrame(() => document.getElementById(`mn-i${form.includes.length}-variantId`)?.focus());
              }}>
              <Plus size={14} aria-hidden="true" /> Agregar un producto al combo
            </button>
          </fieldset>
        )}

        <div className="mv-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()} disabled={busy}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear producto'}</button>
        </div>
      </form>
    </dialog>
  );
}

// ───────────────────────── Tarjeta de producto ─────────────────────────
function ProductCard({ product, branch, canManage, canStock, onEdit, onStock, busyKey }) {
  const statusOf = (v) => v.availability.find((a) => a.branchId === branch?.id)?.status ?? 'available';
  return (
    <article className={`mn-card card${product.active ? '' : ' mn-inactive'}`} aria-labelledby={`mn-p${product.id}`}>
      <div className="mn-card-head">
        <ProductArt artKey={product.artKey} />
        <div className="mn-card-title">
          <h3 id={`mn-p${product.id}`} className="mv-title">{product.name}</h3>
          <div className="mv-sub">{CATEGORY_LABELS[product.category]}</div>
          {!product.active && <span className="badge badge-muted mn-badge"><Ban size={12} aria-hidden="true" /> Inactivo: no se muestra al público</span>}
        </div>
      </div>
      {product.description && <p className="mn-desc">{product.description}</p>}
      <ul className="mn-variants">
        {product.variants.map((v) => {
          const st = statusOf(v);
          const soldOut = st === 'sold_out';
          const k = `${product.id}:${v.id}`;
          return (
            <li key={v.id} className="mn-variant-row">
              <div className="mn-variant-info">
                <div><strong>{v.label}</strong> · <span className="mn-price">{money(v.price)}</span>{!v.active && <span className="mv-sub"> · Tamaño inactivo</span>}</div>
                {measuresText(v) && <div className="mv-sub">{measuresText(v)}</div>}
                {v.includes.length > 0 && (
                  <div className="mv-sub">Incluye: {v.includes.map((i) => `${i.qty} × ${i.name} (${i.label})`).join(', ')}</div>
                )}
              </div>
              <div className="mn-variant-state">
                {branch && (
                  <span className={`mn-stock ${soldOut ? 'mn-stock-out' : 'mn-stock-ok'}`}>
                    {soldOut ? <Ban size={14} aria-hidden="true" /> : <CheckCircle2 size={14} aria-hidden="true" />}
                    {STOCK_LABELS[st]}<span className="sr-only"> en {branch.name}</span>
                  </span>
                )}
                {canStock && branch && (
                  <button type="button" className="btn btn-secondary btn-sm" aria-disabled={busyKey === k ? 'true' : undefined}
                    aria-label={`${soldOut ? 'Marcar disponible' : 'Marcar agotado'}: ${product.name}, ${v.label}, en ${branch.name}`}
                    onClick={() => { if (busyKey !== k) onStock(product, v, soldOut ? 'available' : 'sold_out'); }}>
                    {soldOut ? 'Marcar disponible' : 'Marcar agotado'}
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {canManage && (
        <div className="mv-actions mn-card-actions">
          <button type="button" className="btn btn-secondary btn-sm" onClick={() => onEdit(product)}>
            Editar<span className="sr-only"> {product.name}</span>
          </button>
        </div>
      )}
    </article>
  );
}

// ───────────────────────── Página ─────────────────────────
export default function MenuManagement() {
  const { can, isAdminCentral, branches } = useCinema();
  const { user } = useAuth();
  const canManage = can('manage_products');
  const canStock = can('manage_stock');
  const [products, setProducts] = useState(null);
  const [loadError, setLoadError] = useState(false);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [status, setStatus] = useState('');
  const [branchChoice, setBranchChoice] = useState(null);
  const [dialog, setDialog] = useState(null);       // { product } | { product: null }
  const [flash, setFlash] = useState({ text: '', error: false });
  const [busyKey, setBusyKey] = useState('');
  const headingRef = useRef(null);

  const load = useCallback(async () => {
    const res = await adminApi.products.list();
    if (res.ok) { setProducts(res.data.products); setLoadError(false); } else setLoadError(true);
  }, []);
  useEffect(() => {
    document.title = 'Confitería · Cinerama';
    headingRef.current?.focus();
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  // Sede cuya disponibilidad se ve y se cambia: el gerente, la suya; el admin central, la que elija.
  const branch = useMemo(() => {
    if (!isAdminCentral) return branches.find((b) => b.id === user?.branchId) ?? null;
    return branches.find((b) => b.id === branchChoice) ?? branches[0] ?? null;
  }, [isAdminCentral, branches, branchChoice, user?.branchId]);

  const rows = useMemo(() => (products ?? []).filter((p) => {
    if (search && !p.name.toLowerCase().includes(search.toLowerCase())) return false;
    if (category && p.category !== category) return false;
    if (status === 'active' && !p.active) return false;
    if (status === 'inactive' && p.active) return false;
    return true;
  }), [products, search, category, status]);

  const say = (text, error = false) => setFlash({ text, error });
  const replace = (p) => setProducts((list) => (list ?? []).map((x) => (x.id === p.id ? p : x)));

  const onSaved = (p) => { load(); say(`Producto «${p.name}» guardado.`); };

  const onStock = async (p, v, next) => {
    const k = `${p.id}:${v.id}`;
    setBusyKey(k);
    const res = await adminApi.products.setStock(p.id, branch.id, { status: next, variantId: v.id });
    setBusyKey('');
    if (res.ok) {
      replace(res.data.product);
      say(`${p.name} (${v.label}): ${next === 'sold_out' ? 'agotado' : 'disponible'} en ${branch.name}.`);
    } else {
      say(res.status === 404 ? 'No se encontró el producto o la sede. La lista se actualizó.' : 'No se pudo cambiar la disponibilidad. Inténtalo de nuevo.', true);
      load();
    }
  };

  const groups = PRODUCT_CATEGORIES.map((c) => [c, rows.filter((p) => p.category === c)]).filter(([, l]) => l.length);
  const soldOutCount = branch ? (products ?? []).reduce((n, p) => n + p.variants.filter((v) => v.availability.find((a) => a.branchId === branch.id)?.status === 'sold_out').length, 0) : 0;

  return (
    <div className="mv-page mn-page">
      <div className="page-header">
        <div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>Confitería</h1>
          <p className="page-subtitle">
            {isAdminCentral ? 'Productos, tamaños, precios y disponibilidad por sede' : `Disponibilidad de la confitería — ${branch?.name ?? 'mi sede'}`}
          </p>
        </div>
        {canManage && (
          <button type="button" className="btn btn-primary" onClick={() => setDialog({ product: null })} disabled={!products}>
            <Plus size={16} aria-hidden="true" /> Nuevo producto
          </button>
        )}
      </div>

      {!canManage && (
        <div className="perm-notice" role="note">
          <ShieldAlert size={14} aria-hidden="true" />
          <span>Puedes marcar productos como agotados o disponibles en tu sede. Para crear o editar productos y precios, contacta al <strong>administrador central</strong>.</span>
        </div>
      )}

      <p className={`mv-flash${flash.error ? ' mv-error-text' : ''}`} role="status" hidden={!flash.text}>{flash.text}</p>

      {loadError && !products && (
        <div role="alert" className="mv-flash mv-error-text">
          No se pudo cargar la confitería. <button type="button" className="btn btn-secondary btn-sm" onClick={load}>Reintentar</button>
        </div>
      )}
      {!products && !loadError && <p role="status">Cargando confitería…</p>}

      {products && (
        <>
          <div className="mv-toolbar" role="search" aria-label="Filtrar productos">
            {isAdminCentral && (
              <div className="mv-filter">
                <label htmlFor="mn-branch">Sede de la disponibilidad</label>
                <select id="mn-branch" className="select" value={branch?.id ?? ''} onChange={(e) => setBranchChoice(Number(e.target.value))}>
                  {branches.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
                </select>
              </div>
            )}
            <div className="mv-filter mv-filter-grow">
              <label htmlFor="mn-search">Buscar por nombre</label>
              <input id="mn-search" className="input" type="search" value={search} onChange={(e) => setSearch(e.target.value)} autoComplete="off" />
            </div>
            <div className="mv-filter">
              <label htmlFor="mn-f-cat">Categoría</label>
              <select id="mn-f-cat" className="select" value={category} onChange={(e) => setCategory(e.target.value)}>
                <option value="">Todas las categorías</option>
                {PRODUCT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
              </select>
            </div>
            <div className="mv-filter">
              <label htmlFor="mn-f-status">Estado</label>
              <select id="mn-f-status" className="select" value={status} onChange={(e) => setStatus(e.target.value)}>
                <option value="">Activos e inactivos</option>
                <option value="active">Solo activos</option>
                <option value="inactive">Solo inactivos</option>
              </select>
            </div>
          </div>

          {branch && (
            <p className="mn-count" role="status">
              {rows.length === 1 ? '1 producto' : `${rows.length} productos`} · {soldOutCount === 1 ? '1 tamaño agotado' : `${soldOutCount} tamaños agotados`} en {branch.name}
            </p>
          )}

          {rows.length === 0 ? (
            <div className="empty-state"><p>No hay productos con esos filtros.</p></div>
          ) : groups.map(([c, list]) => (
            <section key={c} className="mn-group" aria-labelledby={`mn-g-${c}`}>
              <h2 id={`mn-g-${c}`} className="mn-group-title">{CATEGORY_LABELS[c]}</h2>
              <div className="mn-grid">
                {list.map((p) => (
                  <ProductCard key={p.id} product={p} branch={branch} canManage={canManage} canStock={canStock}
                    onEdit={(prod) => setDialog({ product: prod })} onStock={onStock} busyKey={busyKey} />
                ))}
              </div>
            </section>
          ))}
        </>
      )}

      {dialog && (
        <ProductDialog key={dialog.product?.id ?? 'new'} product={dialog.product} products={products ?? []} onClose={() => setDialog(null)} onSaved={onSaved} />
      )}
    </div>
  );
}
