import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Printer, RefreshCw, AlertTriangle, CheckCircle } from 'lucide-react';
import { adminApi } from '../../api/admin';
import { useAdminQuery } from '../../hooks/useAdminQuery';
import { QueryGate } from '../../components/SalesParts';
import SeatMap from '../../components/SeatMap';
import { compareSeats } from '../../shared/seatLayout';
import { COUNTER_PAY_METHODS, COUNTER_NAME_MAX, COUNTER_SALE_GRACE_MINUTES } from '../../shared/purchase';
import { dayLabel } from '../../utils/salesFormat';
import SaleStatus from './SaleStatus';
import { formatSol, plural, newKey } from './common';

const POLL_MS = 15000;

const SALE_ERRORS = {
  not_on_sale: 'Esta función ya no vende en mostrador (empezó hace más de lo permitido, terminó o se canceló).',
  sold_out: 'Esta función está agotada.',
  presale_requires_account: 'Esta película está en preventa: el tope es por cuenta, así que solo se vende en la web con cuenta de cliente.',
  not_found: 'Esta función ya no está disponible.',
  forbidden: 'Tu rol no puede vender en mostrador.',
  unauthenticated: 'Tu sesión terminó. Inicia sesión de nuevo.',
  network: 'No pudimos conectar con el servidor. Revisa la conexión y vuelve a confirmar: la venta no se duplicará.',
  validation: 'Revisa los datos de la venta (butacas, pago y nombre).',
};

// Vender: elegir una funcion de hoy de la sede, butacas en el mapa compartido, pago simulado y comprobante.
export default function SellTab({ active, headingRef }) {
  const [version, setVersion] = useState(0);
  const list = useAdminQuery(() => adminApi.counter.screenings(), `list#${version}`);
  const [pickedId, setPickedId] = useState(null);
  const [receipt, setReceipt] = useState(null);
  const [flash, setFlash] = useState('');
  const panelRef = useRef(null);

  const data = list.data;
  const picked = data?.screenings.find((s) => s.id === pickedId) ?? null;

  const choose = (id) => {
    setPickedId(id); setFlash('');
  };

  if (receipt) {
    return <Receipt receipt={receipt} onNew={() => { setReceipt(null); setPickedId(null); setVersion((v) => v + 1); setTimeout(() => headingRef.current?.focus(), 0); }} />;
  }

  return (
    <div className="tq-sell">
      <p className="tq-lead">
        Funciones de hoy de tu sede{data ? ` (${dayLabel(data.date)})` : ''}. El pago es simulado: no se cobra nada.
        El mostrador vende hasta {COUNTER_SALE_GRACE_MINUTES} minutos después del inicio.
      </p>
      <QueryGate query={list} what="las funciones de hoy" />
      {flash && <p className="mv-flash" role="status">{flash}</p>}
      {data && (
        data.screenings.length === 0 ? (
          <div className="sl-empty"><p><strong>No hay funciones hoy en tu sede.</strong></p><p>Cuando haya funciones programadas para hoy aparecerán aquí.</p></div>
        ) : (
          <div className="sl-table-wrap">
            <table className="table tq-table">
              <caption className="tq-caption">Funciones de hoy</caption>
              <thead>
                <tr><th scope="col">Hora</th><th scope="col">Película</th><th scope="col">Sala</th><th scope="col">Formato</th><th scope="col">Precio</th><th scope="col">Butacas libres</th><th scope="col">Estado de la venta</th><th scope="col"><span className="sr-only">Acción</span></th></tr>
              </thead>
              <tbody>
                {data.screenings.map((s) => (
                  <tr key={s.id} className={s.id === pickedId ? 'tq-row-picked' : undefined}>
                    <th scope="row">{s.startTime}<span className="sr-only"> a {s.endTime}</span></th>
                    <td>{s.movieTitle}</td>
                    <td>{s.hallName}</td>
                    <td>{s.format} · {s.language === 'ES' ? 'Doblada' : 'Subtitulada'}</td>
                    <td className="tq-num">{formatSol(s.price)}</td>
                    <td className="tq-num">{s.freeSeats} de {s.totalSeats}</td>
                    <td><SaleStatus sale={s.sale} /></td>
                    <td>
                      <button type="button" className="btn btn-secondary btn-sm" disabled={!s.sale.open} aria-pressed={s.id === pickedId}
                        onClick={() => choose(s.id)}>
                        {s.id === pickedId ? 'Elegida' : 'Elegir'}<span className="sr-only"> la función de las {s.startTime}, {s.movieTitle}, {s.hallName}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
      <div className="tq-toolbar">
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => setVersion((v) => v + 1)}>
          <RefreshCw size={14} aria-hidden="true" /> Actualizar lista
        </button>
      </div>

      {picked && (
        <SellPanel key={picked.id} screening={picked} active={active} panelRef={panelRef}
          onSold={(order, extra) => { setReceipt({ order, ...extra }); }}
          onClosed={(text) => { setPickedId(null); setFlash(text); setVersion((v) => v + 1); }} />
      )}
    </div>
  );
}

function SellPanel({ screening, active, panelRef, onSold, onClosed }) {
  const id = screening.id;
  const [load, setLoad] = useState({ status: 'loading', data: null });
  const [selected, setSelected] = useState([]);
  const selectedRef = useRef([]);
  const [method, setMethod] = useState('cash');
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState('');
  const [alertMsg, setAlertMsg] = useState('');
  const alertRef = useRef(null);
  const mapRef = useRef(null);
  const attempt = useRef({ sig: '', key: null });

  const setSel = useCallback((next) => { selectedRef.current = next; setSelected(next); }, []);
  const map = load.data;
  const taken = useMemo(() => new Set(map?.taken ?? []), [map]);
  const price = screening.price;
  const total = selected.length * price;
  const open = !!map?.screening.sale.open;
  const maxSel = map ? map.limits.remaining : 0;

  const applyMap = useCallback((next) => {
    setLoad({ status: 'ok', data: next });
    const nowTaken = new Set(next.taken);
    const lost = selectedRef.current.filter((s) => nowTaken.has(s));
    if (lost.length) {
      setSel(selectedRef.current.filter((s) => !nowTaken.has(s)));
      setLive('');
      setAlertMsg(`${lost.length === 1 ? `La butaca ${lost[0]} ya no está disponible` : `Las butacas ${lost.join(', ')} ya no están disponibles`}: otra venta ${lost.length === 1 ? 'la tomó' : 'las tomó'}. ${lost.length === 1 ? 'La quitamos' : 'Las quitamos'} de la selección.`);
    }
    return lost;
  }, [setSel]);

  const fetchMap = useCallback(async () => {
    const r = await adminApi.counter.seats(id);
    if (r.ok) return { ok: true, data: r.data };
    return { ok: false, status: r.status, error: r.error };
  }, [id]);

  useEffect(() => {
    let off = false;
    fetchMap().then((r) => { if (!off) { if (r.ok) setLoad({ status: 'ok', data: r.data }); else setLoad({ status: r.status === 404 ? 'notfound' : 'error', data: null }); } });
    return () => { off = true; };
  }, [fetchMap]);

  // Otra venta (web o mostrador) puede tomar butacas: se vuelve a leer cada 15 s y al volver a la pestana.
  useEffect(() => {
    if (load.status !== 'ok' || !active) return undefined;
    const tick = async () => {
      if (document.visibilityState !== 'visible' || busy) return;
      const r = await fetchMap();
      if (r.ok) applyMap(r.data);
    };
    const t = setInterval(tick, POLL_MS);
    document.addEventListener('visibilitychange', tick);
    return () => { clearInterval(t); document.removeEventListener('visibilitychange', tick); };
  }, [load.status, active, busy, fetchMap, applyMap]);

  useEffect(() => { if (alertMsg) alertRef.current?.focus(); }, [alertMsg]);
  // Al elegir una funcion el foco va al titulo del panel (cuando termina de cargar el mapa).
  useEffect(() => { if (load.status !== 'loading') panelRef.current?.focus(); }, [load.status, panelRef]);

  const summary = (list) => (list.length ? `${plural(list.length, 'butaca seleccionada', 'butacas seleccionadas')}: ${list.join(', ')}. Total ${formatSol(list.length * price)}.` : 'Ninguna butaca seleccionada.');

  const toggle = (seat) => {
    if (taken.has(seat) || !open) return;
    setAlertMsg('');
    const cur = selectedRef.current;
    if (cur.includes(seat)) { const next = cur.filter((s) => s !== seat); setSel(next); setLive(summary(next)); return; }
    if (cur.length >= maxSel) {
      setLive(`Llegaste al máximo: ${plural(maxSel, 'butaca', 'butacas')} por orden en mostrador. Quita una para elegir otra.`);
      return;
    }
    const next = [...cur, seat].sort(compareSeats);
    setSel(next); setLive(summary(next));
  };

  const confirm = async () => {
    if (busy || !selected.length) return;
    setAlertMsg(''); setBusy(true);
    const customerName = name.trim();
    const sig = `${selected.join(',')}|${method}|${customerName}`;
    if (attempt.current.sig !== sig) attempt.current = { sig, key: newKey() };
    const res = await adminApi.counter.sell({ screeningId: id, seats: selected, idempotencyKey: attempt.current.key, payment: { method }, ...(customerName ? { customerName } : {}) });
    setBusy(false);
    if (res.ok) { onSold(res.data.order, { customerName, screening, replayed: !!res.data.replayed }); return; }
    const d = res.data || {};
    if (res.error === 'seats_taken') {
      const r = await fetchMap();
      const lostNow = d.seats ?? [];
      setSel(selectedRef.current.filter((s) => !lostNow.includes(s)));
      if (r.ok) setLoad({ status: 'ok', data: r.data });
      setAlertMsg(`${lostNow.length === 1 ? `La butaca ${lostNow[0]} ya no está disponible` : `Las butacas ${lostNow.join(', ')} ya no están disponibles`}: otra venta ${lostNow.length === 1 ? 'la tomó' : 'las tomó'}. ${lostNow.length === 1 ? 'La quitamos' : 'Las quitamos'} de la selección; no se registró ninguna venta.`);
      return;
    }
    if (['not_on_sale', 'sold_out', 'presale_requires_account', 'not_found'].includes(res.error)) {
      onClosed(SALE_ERRORS[res.error]); return;
    }
    setAlertMsg(SALE_ERRORS[res.error] ?? 'No pudimos registrar la venta. Inténtalo de nuevo.');
  };

  if (load.status === 'loading') return <p className="sl-status-line" role="status" ref={panelRef} tabIndex={-1}>Cargando el mapa de butacas…</p>;
  if (load.status !== 'ok') {
    return (
      <div className="us-notice sl-error" role="alert" ref={panelRef} tabIndex={-1}>
        <p><AlertTriangle size={16} aria-hidden="true" /> {load.status === 'notfound' ? 'Esa función no está disponible en tu sede.' : 'No se pudo cargar el mapa de butacas.'}</p>
        <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setLoad({ status: 'loading', data: null }); fetchMap().then((r) => setLoad(r.ok ? { status: 'ok', data: r.data } : { status: 'error', data: null })); }}>Reintentar</button>
      </div>
    );
  }
  const s = map.screening;

  return (
    <section className="tq-panel" aria-labelledby="tq-sell-title">
      <h2 id="tq-sell-title" className="tq-panel-title" tabIndex={-1} ref={panelRef}>Elegir butacas · {s.movieTitle}, {s.startTime}</h2>
      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{live}</p>
      {alertMsg && <div className="tq-alert" role="alert" tabIndex={-1} ref={alertRef}><AlertTriangle size={16} aria-hidden="true" /><p>{alertMsg}</p></div>}
      {!open && <div className="tq-alert" role="alert"><AlertTriangle size={16} aria-hidden="true" /><p>Esta función ya no vende en mostrador: <SaleStatus sale={s.sale} inline />.</p></div>}
      <div className="tq-sell-grid">
        <div className="tq-map">
          <p className="booking-note" id="tq-limit">Máximo {map.limits.perOrder} entradas por orden en mostrador. Quedan {map.limits.remaining} butacas libres que se pueden vender ahora.</p>
          <SeatMap ref={mapRef} layout={map.layout} taken={taken} selected={selected} onToggle={toggle} describedBy="tq-limit" />
        </div>
        <aside className="tq-summary" aria-labelledby="tq-summary-title">
          <h3 id="tq-summary-title">Resumen de la venta</h3>
          <dl className="sl-dl">
            <dt>Película</dt><dd>{s.movieTitle}</dd>
            <dt>Función</dt><dd>{dayLabel(s.date)}, {s.startTime} · {s.hallName}</dd>
            <dt>Precio</dt><dd>{formatSol(price)} por entrada</dd>
          </dl>
          <p className="summary-label" id="tq-seats-label">Butacas seleccionadas</p>
          <ul className="tq-chips" aria-labelledby="tq-seats-label">
            {selected.length ? selected.map((x) => <li key={x} className="seat-chip">{x}</li>) : <li className="no-seats-text">Ninguna seleccionada</li>}
          </ul>
          {selected.length > 0 && <p className="tq-calc">{plural(selected.length, 'butaca', 'butacas')} × {formatSol(price)}</p>}
          <p className="tq-total"><span>Total a cobrar</span><strong>{formatSol(total)}</strong></p>

          <form onSubmit={(e) => { e.preventDefault(); confirm(); }} noValidate>
            <fieldset className="mv-fieldset tq-pay">
              <legend>Método de pago (simulado)</legend>
              {Object.entries(COUNTER_PAY_METHODS).map(([k, label]) => (
                <label key={k} className="mv-check"><input type="radio" name="tq-method" value={k} checked={method === k} onChange={() => setMethod(k)} /> {label}</label>
              ))}
            </fieldset>
            <div className="mv-field">
              <label htmlFor="tq-name">Nombre del cliente (opcional)</label>
              <input id="tq-name" className="input" type="text" value={name} maxLength={COUNTER_NAME_MAX} autoComplete="off" aria-describedby="tq-name-hint" onChange={(e) => setName(e.target.value)} />
              <p className="mv-hint" id="tq-name-hint">Si lo dejas vacío, la venta queda como «Venta en mostrador». No pidas documento ni correo.</p>
            </div>
            <button type="submit" className="btn btn-primary tq-confirm" disabled={!selected.length || busy || !open}>
              {busy ? 'Registrando…' : `Confirmar venta simulada · ${formatSol(total)}`}
            </button>
            <p className="mv-hint" role="status">{busy ? 'Registrando la venta, espera un momento.' : ''}</p>
          </form>
        </aside>
      </div>
    </section>
  );
}

// Comprobante: codigo grande y vista de impresion (solo este bloque se imprime).
function Receipt({ receipt, onNew }) {
  const { order, customerName } = receipt;
  const titleRef = useRef(null);
  const [copied, setCopied] = useState('');
  useEffect(() => { titleRef.current?.focus(); }, []);
  const s = order.screening;
  const copy = async () => {
    try { await navigator.clipboard.writeText(order.code); setCopied('Código copiado.'); } catch { setCopied('No se pudo copiar: selecciona el código y pulsa Ctrl+C.'); }
  };
  return (
    <section className="tq-receipt tq-print" aria-labelledby="tq-receipt-title">
      <p className="tq-ok" role="status"><CheckCircle size={18} aria-hidden="true" /> Venta simulada registrada</p>
      <h2 id="tq-receipt-title" tabIndex={-1} ref={titleRef}>Comprobante de venta en mostrador</h2>
      <p className="tq-code-label">Código de la orden</p>
      <p className="tq-code" aria-label={`Código de la orden ${order.code.split('').join(' ')}`}><code>{order.code}</code></p>
      <dl className="sl-dl tq-receipt-dl">
        <dt>Película</dt><dd>{s.movieTitle}</dd>
        <dt>Sede y sala</dt><dd>{s.branchName} · {s.hallName}</dd>
        <dt>Función</dt><dd>{dayLabel(s.date)}, {s.startTime} · {s.format} · {s.language === 'ES' ? 'Doblada' : 'Subtitulada'}</dd>
        <dt>Butacas</dt><dd>{order.seats.map((x) => x.seat).join(', ')}</dd>
        <dt>Total</dt><dd>{formatSol(order.amount)}</dd>
        <dt>Pago</dt><dd>{COUNTER_PAY_METHODS[order.payment.method] ?? order.payment.method}, simulado · ref. {order.payment.ref}</dd>
        {customerName && (<><dt>Cliente</dt><dd>{customerName}</dd></>)}
      </dl>
      <p className="tq-fineprint">Pago simulado: no se cobró nada y este comprobante no tiene valor de pago real. Presenta el código en la puerta de la sala.</p>
      <div className="mv-dialog-actions tq-no-print">
        <button type="button" className="btn btn-secondary" onClick={copy}>Copiar código</button>
        <button type="button" className="btn btn-secondary" onClick={() => window.print()}><Printer size={15} aria-hidden="true" /> Imprimir comprobante</button>
        <button type="button" className="btn btn-primary" onClick={onNew}>Nueva venta</button>
      </div>
      <p className="mv-hint tq-no-print" role="status">{copied}</p>
    </section>
  );
}
