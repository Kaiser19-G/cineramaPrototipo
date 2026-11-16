import { useCallback, useEffect, useRef, useState } from 'react';
import { Clock, ChefHat, PackageCheck, CheckCircle, Ban, XCircle, AlertTriangle, RefreshCw, Search } from 'lucide-react';
import { adminApi } from '../../api/admin';
import { dayLabel } from '../../utils/salesFormat';
import { PICKUP_POINT_LABEL } from '../../shared/purchase';
import { plural } from './common';

// Cola de pedidos de confitería de la sede. Nunca muestra datos del cliente: solo la referencia (últimos 5 caracteres del
// código). Para ENTREGAR hay que escribir o escanear el código completo; el servidor lo valida contra ese pedido.
const POLL_MS = 30000;
const STATUS = {
  ordered: { label: 'Pedido recibido', Icon: Clock },
  preparing: { label: 'En preparación', Icon: ChefHat },
  ready: { label: 'Listo para recoger', Icon: PackageCheck },
  delivered: { label: 'Entregado', Icon: CheckCircle },
  not_collected: { label: 'No recogido', Icon: Ban },
  cancelled: { label: 'Cancelado', Icon: XCircle },
};
const ACTIONS = {
  start: { label: 'Empezar a preparar', done: 'en preparación' },
  ready: { label: 'Marcar como listo', done: 'listo para recoger' },
  revert: { label: 'Volver a preparación', done: 'otra vez en preparación' },
  deliver: { label: 'Entregar', done: 'entregado' },
};
const BLOCKED = {
  too_early: (p) => `Todavía no es hora: se prepara desde las ${p.prepareAt}.`,
  wrong_day: () => 'La función es de otro día: este pedido no se opera hoy.',
  not_approved: () => 'La orden no está aprobada.',
  delivered: () => 'Ya se entregó.',
  not_collected: () => 'La función terminó y no se recogió: ya no se puede entregar.',
  cancelled: () => 'El pedido se canceló (reembolso o función cancelada).',
};
const ERRORS = {
  forbidden: 'Tu rol no puede operar la cola de pedidos.',
  unauthenticated: 'Tu sesión terminó. Inicia sesión de nuevo.',
  not_found: 'No se encontró el pedido en tu sede.',
  code_mismatch: 'Ese código no corresponde a este pedido. No se entregó nada.',
  validation: 'Escribe el código completo del pedido.',
};
const failText = (r) => (r.status === 429
  ? `Demasiados intentos fallidos. Espera ${Math.max(1, Math.ceil((r.data?.retryAfter || 60) / 60))} minuto(s) antes de seguir.`
  : ERRORS[r.error] ?? 'No pudimos conectar con el servidor. Vuelve a intentarlo.');

// Un pedido. `onAct(pickup, action)` ejecuta una transición; `knownCode` (resultado de búsqueda) permite entregar sin pedirlo otra vez.
function PickupCard({ p, onAct, busyId, headingLevel = 4 }) {
  const H = `h${headingLevel}`;
  const st = STATUS[p.status] ?? { label: p.statusLabel, Icon: Clock };
  const name = `pedido ${p.ref}`;
  const busy = busyId === p.id;
  const blockedText = p.blocked ? (BLOCKED[p.blocked]?.(p) ?? null) : null;
  return (
    <li className="tq-pickup">
      <div className="tq-pickup-head">
        <H id={`pk-title-${p.id}`} className="tq-pickup-title" tabIndex={-1}>Pedido <code className="sl-code">{p.ref}</code></H>
        <span className={`sl-status tq-pk-${p.status}`}><st.Icon size={13} aria-hidden="true" />{st.label}</span>
      </div>
      <ul className="tq-pickup-lines" aria-label={`Productos del ${name}`}>
        {p.items.map((i) => (
          <li key={`${i.name}-${i.variantLabel}`}>
            <strong>{i.qty} ×</strong> {i.name} <span className="mv-sub">({i.variantLabel})</span>
            {i.includes ? <span className="tq-pickup-includes">Incluye: {i.includes}</span> : null}
          </li>
        ))}
      </ul>
      <dl className="sl-dl tq-pickup-dl">
        <dt>Momento elegido</dt>
        <dd>{p.timingLabel}{p.timing === 'at_showtime' && p.prepareAt ? ` (desde las ${p.prepareAt})` : ''}{p.arrivedAt ? ` · llegó a las ${p.arrivedAt}` : ''}</dd>
        <dt>Función</dt>
        <dd>{p.screening.movieTitle} · {dayLabel(p.screening.date)}, {p.screening.startTime} · {p.screening.hallName}</dd>
      </dl>
      {blockedText && <p className="tq-pickup-note">{blockedText}</p>}
      {p.actions.length > 0 && (
        <div className="tq-pickup-actions">
          {p.actions.map((a) => (
            <button key={a} type="button" className={`btn btn-sm ${a === 'deliver' ? 'btn-primary' : 'btn-secondary'}`} aria-disabled={busy || undefined}
              onClick={() => onAct(p, a)}>
              {ACTIONS[a].label}<span className="sr-only"> el {name}</span>
            </button>
          ))}
        </div>
      )}
    </li>
  );
}

// Diálogo para entregar desde la lista: pide el código COMPLETO.
function DeliverDialog({ p, onClose, onDone }) {
  const ref = useRef(null);
  const input = useRef(null);
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); input.current?.focus(); }, []);
  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (!value.trim()) { setError('Escribe o escanea el código completo del pedido.'); input.current?.focus(); return; }
    setBusy(true); setError('');
    const r = await adminApi.pickups.act(p.id, 'deliver', value);
    setBusy(false);
    if (r.ok) { onDone(r.data.pickup); ref.current?.close(); return; }
    if (r.status === 409) { onDone(r.data?.pickup ?? null, `El pedido ya cambió de estado (${r.data?.statusLabel ?? 'otro estado'}). No se entregó desde aquí.`); ref.current?.close(); return; }
    setError(failText(r)); setValue(''); input.current?.focus();
  };
  return (
    <dialog ref={ref} className="mv-dialog" style={{ width: 'min(520px, calc(100vw - 32px))' }} aria-labelledby="pk-deliver-title" onClose={onClose}>
      <h2 id="pk-deliver-title">Entregar el pedido {p.ref}</h2>
      <p>Pídele al cliente el código de su entrada o escanéalo. Hay que escribir el código <strong>completo</strong>; no basta con la referencia de 5 caracteres.</p>
      <form onSubmit={submit} noValidate>
        <div className="mv-field">
          <label htmlFor="pk-deliver-code">Código completo del pedido {p.ref}</label>
          <input id="pk-deliver-code" ref={input} className="input tq-code-input" type="text" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off"
            autoCapitalize="characters" spellCheck={false} maxLength={40} placeholder="CIN-XXXXX-XXXXX" aria-describedby={error ? 'pk-deliver-err' : undefined} aria-invalid={error ? true : undefined} />
        </div>
        <div role="alert" id="pk-deliver-err">{error && <p className="mv-field-error"><AlertTriangle size={14} aria-hidden="true" /> {error}</p>}</div>
        <div className="mv-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()}>Cancelar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Entregando…' : 'Entregar pedido'}<span className="sr-only"> {p.ref}</span></button>
        </div>
      </form>
    </dialog>
  );
}

const SECTIONS = [
  { key: 'toPrepare', title: 'Por preparar ahora', hint: 'Ya es la hora de prepararlos (15 minutos antes de la función).', empty: 'No hay pedidos por preparar ahora.' },
  { key: 'waitingArrival', title: 'Esperando que llegue el cliente', hint: 'Eligieron «Al llegar»: empieza a prepararlos cuando el cliente muestre su código (búscalo arriba).', empty: 'Nadie está esperando llegada.' },
  { key: 'preparing', title: 'En preparación', hint: '', empty: 'No hay pedidos en preparación.' },
  { key: 'ready', title: 'Listos para recoger', hint: 'Entrégalos con el código completo del cliente.', empty: 'No hay pedidos listos.' },
];

export default function PickupsTab({ active }) {
  const [data, setData] = useState(null);           // cola
  const [loadError, setLoadError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [busyId, setBusyId] = useState(null);
  const [live, setLive] = useState('');
  const [flash, setFlash] = useState('');
  const [code, setCode] = useState('');
  const [looking, setLooking] = useState(false);
  const [found, setFound] = useState(null);         // { result, pickup?, code? } | { error }
  const [delivering, setDelivering] = useState(null);
  const lastCounts = useRef('');
  const loadedOnce = useRef(false);                 // la primera carga muestra estado; las siguientes (al volver a la pestaña) son silenciosas
  const quiet = useRef(false);                      // tras una accion propia, el siguiente sondeo no re-anuncia el cambio
  const focusAfter = useRef(null);                  // id del pedido al que devolver el foco tras una acción
  const queueRef = useRef(null);
  const searchRef = useRef(null);
  const refreshRef = useRef(null);

  const load = useCallback(async ({ silent = false } = {}) => {
    if (!silent) setRefreshing(true);
    const r = await adminApi.pickups.queue();
    if (!silent) setRefreshing(false);
    if (!r.ok) {
      if (!silent) { const t = failText(r); setLoadError(t); setLive(t); }
      return null;
    }
    setLoadError('');
    setData(r.data);
    const c = r.data.counts;
    const sig = JSON.stringify(c);
    const summary = `${plural(c.toPrepare, 'pedido por preparar', 'pedidos por preparar')}, ${plural(c.preparing, 'en preparación', 'en preparación')}, ${plural(c.ready, 'listo', 'listos')}.`;
    // Una sola vez y solo si algo cambió: el sondeo no re-anuncia la cola completa.
    if (!silent) setLive(`Cola actualizada: ${summary}`);
    else if (quiet.current) quiet.current = false;
    else if (lastCounts.current && lastCounts.current !== sig) setLive(`La cola cambió: ${summary}`);
    lastCounts.current = sig;
    return r.data;
  }, []);

  // Carga al abrir la pestaña y sondeo discreto mientras está visible (los paneles de Taquilla siguen montados aunque estén ocultos).
  useEffect(() => {
    if (!active) return undefined;
    const first = setTimeout(() => load({ silent: loadedOnce.current }), 0);
    loadedOnce.current = true;
    const id = setInterval(() => { if (document.visibilityState === 'visible') load({ silent: true }); }, POLL_MS);
    return () => { clearTimeout(first); clearInterval(id); };
  }, [active, load]);

  // Foco tras una acción: al pedido si sigue en la cola (aunque cambie de sección); si ya no está, al encabezado de la cola.
  useEffect(() => {
    if (focusAfter.current === null || !data) return;
    const id = focusAfter.current; focusAfter.current = null;
    const el = document.getElementById(`pk-title-${id}`);
    (el ?? queueRef.current)?.focus();
  }, [data, found]);

  const apply = (p, msg) => { setFlash(msg); setLive(msg); quiet.current = true; focusAfter.current = p?.id ?? 'none'; };

  const act = async (p, action) => {
    if (busyId !== null) return;
    setFlash('');
    if (action === 'deliver' && !p.knownCode) { setDelivering(p); return; }
    setBusyId(p.id);
    const r = await adminApi.pickups.act(p.id, action, action === 'deliver' ? p.knownCode : undefined);
    setBusyId(null);
    if (r.ok) {
      apply(r.data.pickup, `El pedido ${p.ref} quedó ${ACTIONS[action].done}.`);
      if (found?.pickup?.id === p.id) setFound({ ...found, pickup: { ...found.pickup, ...r.data.pickup } });
    } else if (r.status === 409) {
      const label = r.data?.statusLabel ?? 'otro estado';
      apply(r.data?.pickup ?? p, `No se hizo: el pedido ${p.ref} ya estaba en «${label}» (otro empleado lo cambió). Se actualizó la cola.`);
      if (found?.pickup?.id === p.id && r.data?.pickup) setFound({ ...found, pickup: { ...found.pickup, ...r.data.pickup } });
    } else { const t = failText(r); setFlash(t); setLive(t); }
    await load({ silent: true });
  };

  const lookup = async (e) => {
    e.preventDefault();
    if (looking) return;
    setFlash('');
    if (!code.trim()) { setFound({ error: 'Escribe o escanea el código completo del cliente.' }); setLive('Escribe o escanea el código completo del cliente.'); searchRef.current?.focus(); return; }
    setLooking(true);
    const r = await adminApi.pickups.lookup(code);
    setLooking(false);
    if (!r.ok) { const t = failText(r); setFound({ error: t }); setLive(t); searchRef.current?.focus(); return; }
    if (r.data.result === 'found') {
      const entered = code;
      setFound({ result: 'found', pickup: { ...r.data.pickup, knownCode: entered } });
      setLive(`Pedido encontrado ${r.data.pickup.ref}: ${r.data.pickup.statusLabel}.`);
      focusAfter.current = r.data.pickup.id;
    } else {
      const t = r.data.result === 'no_food' ? 'Esa orden no tiene pedido de confitería.' : 'Código no encontrado en esta sede. Revisa el código: no se muestran datos de otras sedes.';
      setFound({ result: r.data.result, error: t }); setLive(t);
      searchRef.current?.focus();
    }
  };
  const clearSearch = () => { setFound(null); setCode(''); setTimeout(() => searchRef.current?.focus(), 0); };

  const counts = data?.counts;
  return (
    <div className="tq-pickups">
      <p className="tq-lead">
        Pedidos de confitería de tu sede para hoy, que se recogen en el <strong>{PICKUP_POINT_LABEL}</strong>. Aquí no se muestran datos del cliente: cada pedido se reconoce por los
        últimos 5 caracteres de su código, y para entregarlo hay que escribir o escanear el código completo.
      </p>

      <form className="tq-code-form" role="search" aria-label="Buscar un pedido por el código del cliente" onSubmit={lookup} noValidate>
        <div className="mv-field">
          <label htmlFor="pk-code">Código del cliente que llegó</label>
          <input id="pk-code" ref={searchRef} className="input tq-code-input" type="text" value={code} onChange={(e) => setCode(e.target.value)} autoComplete="off" autoCapitalize="characters"
            spellCheck={false} maxLength={40} placeholder="CIN-XXXXX-XXXXX" aria-describedby="pk-code-hint" />
          <p className="mv-hint" id="pk-code-hint">Con o sin guiones y en minúsculas. Úsalo para registrar la llegada de quien eligió «Al llegar».</p>
        </div>
        <button type="submit" className="btn btn-primary" disabled={looking}><Search size={16} aria-hidden="true" /> {looking ? 'Buscando…' : 'Buscar pedido'}</button>
      </form>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{live}</p>
      {flash && <p className="mv-flash">{flash}</p>}

      {found?.error && <div className="tq-result tq-tone-bad" role="alert"><p className="tq-result-title"><AlertTriangle size={24} aria-hidden="true" /> {found.error}</p></div>}
      {found?.pickup && (
        <section className="tq-pk-found" aria-labelledby="pk-found-title">
          <h3 id="pk-found-title" className="tq-pk-section-title">Resultado de la búsqueda</h3>
          <ul className="tq-pickup-list"><PickupCard p={found.pickup} onAct={act} busyId={busyId} headingLevel={4} /></ul>
          <button type="button" className="btn btn-secondary btn-sm" onClick={clearSearch}>Cerrar resultado y buscar otro código</button>
        </section>
      )}

      <div className="tq-pk-bar">
        <h3 id="pk-queue-title" ref={queueRef} tabIndex={-1} className="tq-pk-section-title">Cola de hoy{data ? ` · ${dayLabel(data.date)}` : ''}</h3>
        <button type="button" ref={refreshRef} className="btn btn-secondary btn-sm" onClick={() => load()} disabled={refreshing} aria-describedby="pk-refresh-note">
          <RefreshCw size={14} aria-hidden="true" /> {refreshing ? 'Actualizando…' : 'Actualizar'}
        </button>
      </div>
      <p className="mv-hint" id="pk-refresh-note">La cola se actualiza sola cada 30 segundos mientras esta pestaña está abierta.{counts?.later ? ` Hay ${plural(counts.later, 'pedido', 'pedidos')} para más tarde (entran 15 minutos antes de su función).` : ''}</p>

      {loadError && <div className="tq-result tq-tone-bad" role="alert"><p className="tq-result-title"><AlertTriangle size={24} aria-hidden="true" /> {loadError}</p></div>}
      {!data && !loadError && <p role="status">Cargando la cola…</p>}
      {data && SECTIONS.map((s) => {
        const list = data.sections[s.key];
        return (
          <section key={s.key} className="tq-pk-section" aria-labelledby={`pk-sec-${s.key}`}>
            <h3 id={`pk-sec-${s.key}`} className="tq-pk-section-title">{s.title} <span className="tq-pk-count">({list.length})</span></h3>
            {s.hint && <p className="mv-hint">{s.hint}</p>}
            {list.length === 0 ? <p className="tq-pk-empty">{s.empty}</p> : (
              <ul className="tq-pickup-list">{list.map((p) => <PickupCard key={p.id} p={p} onAct={act} busyId={busyId} />)}</ul>
            )}
          </section>
        );
      })}

      {delivering && (
        <DeliverDialog p={delivering} onClose={() => { setDelivering(null); }}
          onDone={(pk, msg) => {
            const text = msg ?? `El pedido ${delivering.ref} quedó entregado.`;
            apply(pk ?? delivering, text);
            if (found?.pickup?.id === delivering.id && pk) setFound({ ...found, pickup: { ...found.pickup, ...pk } });
            load({ silent: true });
          }} />
      )}
    </div>
  );
}
