import { useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, Ban, RotateCcw, Clock, CalendarX, SearchX, AlertTriangle } from 'lucide-react';
import { adminApi } from '../../api/admin';
import { dayLabel } from '../../utils/salesFormat';
import { plural } from './common';

// Resultado de validar un codigo: titulo grande con icono (no solo color), explicacion y, si procede, las butacas.
const RESULTS = {
  valid: { Icon: CheckCircle, tone: 'good', title: 'Entrada válida', text: 'Puede ingresar. Registra el ingreso de las butacas que entran ahora.' },
  used: { Icon: Ban, tone: 'bad', title: 'Entrada ya usada', text: 'Todas las butacas de esta orden ya ingresaron. No dejes pasar a nadie más con este código.' },
  refunded: { Icon: RotateCcw, tone: 'bad', title: 'Entrada reembolsada', text: 'La orden fue reembolsada: este código ya no sirve para entrar.' },
  cancelled: { Icon: XCircle, tone: 'bad', title: 'Orden cancelada', text: 'La orden fue cancelada: no hay entrada.' },
  rejected: { Icon: XCircle, tone: 'bad', title: 'Pago rechazado', text: 'El pago fue rechazado: no se compró ninguna entrada.' },
  wrong_day: { Icon: CalendarX, tone: 'warn', title: 'La función es de otro día', text: 'Solo se puede ingresar el mismo día de la función.' },
  too_early: { Icon: Clock, tone: 'warn', title: 'Todavía no abre el ingreso', text: '' },
  finished: { Icon: Clock, tone: 'bad', title: 'La función ya terminó', text: 'Ya no se puede registrar el ingreso de esta orden.' },
  not_found: { Icon: SearchX, tone: 'bad', title: 'Código no encontrado en esta sede', text: 'Revisa el código. Si es correcto, puede ser de otra sede: no se muestran datos de órdenes ajenas.' },
};

const announce = (r) => {
  const d = RESULTS[r.result];
  if (!d) return '';
  let t = `${d.title}.`;
  if (r.result === 'too_early') t += ` El ingreso abre a las ${r.opensAt}.`;
  else if (d.text) t += ` ${d.text}`;
  if (r.order?.screening && r.result !== 'not_found') {
    const s = r.order.screening;
    t += ` ${s.movieTitle}, ${s.hallName}, ${s.startTime}.`;
  }
  if (r.result === 'valid') t += ` Butacas pendientes: ${r.order.seats.filter((x) => !x.checkedIn).map((x) => x.seat).join(', ')}.`;
  if (r.result === 'refunded' && r.order?.refund?.reason) t += ` Motivo: ${r.order.refund.reason}.`;
  return t;
};

// Validar: pensado para un lector de codigos (escribe el codigo y pulsa Enter) o para escribirlo a mano.
export default function ValidateTab({ active }) {
  const [value, setValue] = useState('');
  const [busy, setBusy] = useState(false);
  const [res, setRes] = useState(null);       // { data } | { error }
  const [picked, setPicked] = useState([]);
  const [live, setLive] = useState('');
  const [flash, setFlash] = useState('');
  const inputRef = useRef(null);

  useEffect(() => { if (active) inputRef.current?.focus(); }, [active]);
  const backToField = () => { setValue(''); setTimeout(() => inputRef.current?.focus(), 0); };

  const show = (data) => {
    setRes({ data });
    setPicked(data.order ? data.order.seats.filter((x) => !x.checkedIn).map((x) => x.seat) : []);
    setLive(announce(data));
  };
  const fail = (r) => {
    const text = r.status === 429
      ? `Demasiados intentos fallidos. Espera ${Math.max(1, Math.ceil((r.data.retryAfter || 60) / 60))} minuto(s) antes de seguir validando.`
      : r.error === 'forbidden' ? 'Tu rol no puede validar entradas.'
        : r.error === 'unauthenticated' ? 'Tu sesión terminó. Inicia sesión de nuevo.'
          : r.error === 'validation' ? 'Escribe el código de la entrada.'
            : 'No pudimos conectar con el servidor. Vuelve a intentarlo.';
    setRes({ error: text });
    setLive(text);
  };

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setFlash('');
    if (!value.trim()) { setRes({ error: 'Escribe o escanea el código de la entrada.' }); setLive('Escribe o escanea el código de la entrada.'); inputRef.current?.focus(); return; }
    setBusy(true);
    const r = await adminApi.counter.lookup(value);
    setBusy(false);
    if (r.ok) show(r.data); else fail(r);
    backToField();
  };

  const togglePick = (seat) => setPicked((p) => (p.includes(seat) ? p.filter((x) => x !== seat) : [...p, seat]));

  const checkIn = async () => {
    const d = res?.data;
    if (!d?.order || busy || !picked.length) return;
    setBusy(true);
    const all = d.order.seats.filter((x) => !x.checkedIn).length === picked.length;
    const r = await adminApi.counter.checkIn(d.order.code, all ? undefined : picked);
    setBusy(false);
    if (r.ok) {
      show(r.data);
      const msg = r.data.changed === 0 ? 'No había cambios: esas butacas ya habían ingresado.' : `Ingreso registrado: ${plural(r.data.changed, 'butaca', 'butacas')}.`;
      setFlash(msg); setLive(`${msg} ${announce(r.data)}`);
    } else if (r.status === 409 && r.data?.result) { show(r.data); setFlash('No se registró el ingreso: el estado de la entrada cambió.'); }
    else fail(r);
    backToField();
  };

  const d = res?.data;
  const def = d ? RESULTS[d.result] : null;
  const o = d?.order;
  const s = o?.screening;
  const pending = o ? o.seats.filter((x) => !x.checkedIn) : [];

  return (
    <div className="tq-validate">
      <p className="tq-lead">Escanea o escribe el código de la entrada y pulsa Enter. Puedes pegarlo con o sin guiones y en minúsculas. Solo se validan órdenes de tu sede, el día de la función.</p>
      <form className="tq-code-form" onSubmit={submit} noValidate>
        <div className="mv-field">
          <label htmlFor="tq-code">Código de la entrada</label>
          <input id="tq-code" ref={inputRef} className="input tq-code-input" type="text" value={value} onChange={(e) => setValue(e.target.value)}
            autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={40} placeholder="CIN-XXXXX-XXXXX"
            aria-describedby="tq-code-hint" />
          <p className="mv-hint" id="tq-code-hint">El foco vuelve a este campo después de cada validación para encadenar entradas.</p>
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Validando…' : 'Validar'}</button>
      </form>

      <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{live}</p>

      {res?.error && <div className="tq-result tq-tone-bad"><p className="tq-result-title"><AlertTriangle size={28} aria-hidden="true" /> {res.error}</p></div>}

      {def && (
        <section className={`tq-result tq-tone-${def.tone}`} aria-labelledby="tq-result-title">
          <h2 id="tq-result-title" className="tq-result-title"><def.Icon size={32} aria-hidden="true" /> {def.title}</h2>
          <p className="tq-result-text">
            {d.result === 'too_early' ? `El ingreso abre a las ${d.opensAt} (una hora antes de la función).` : def.text}
            {d.result === 'refunded' && o.refund?.reason ? ` Motivo: ${o.refund.reason}.` : ''}
          </p>
          {flash && <p className="tq-flash">{flash}</p>}
          {o && s && (
            <>
              <dl className="sl-dl tq-result-dl">
                <dt>Película</dt><dd>{s.movieTitle}</dd>
                <dt>Función</dt><dd>{dayLabel(s.date)}, {s.startTime} · {s.hallName}</dd>
                <dt>Orden</dt><dd><code className="sl-code">{o.code}</code> · {o.channel === 'counter' ? 'Taquilla' : 'Web'}</dd>
                <dt>Butacas</dt>
                <dd>
                  <ul className="tq-seat-states">
                    {o.seats.map((x) => <li key={x.seat}><strong>{x.seat}</strong> · {x.checkedIn ? 'ya ingresó' : (d.result === 'valid' ? 'pendiente de ingreso' : 'sin ingreso')}</li>)}
                  </ul>
                </dd>
              </dl>
              {d.result === 'valid' && pending.length > 0 && (
                <fieldset className="mv-fieldset tq-pick">
                  <legend>Butacas que ingresan ahora</legend>
                  <div className="mv-checks">
                    {pending.map((x) => (
                      <label key={x.seat} className="mv-check"><input type="checkbox" checked={picked.includes(x.seat)} onChange={() => togglePick(x.seat)} /> {x.seat}</label>
                    ))}
                  </div>
                  <div className="mv-dialog-actions">
                    {pending.length > 1 && <button type="button" className="btn btn-secondary" onClick={() => setPicked(pending.map((x) => x.seat))} disabled={picked.length === pending.length}>Marcar todas</button>}
                    <button type="button" className="btn btn-primary" onClick={checkIn} disabled={busy || !picked.length}>
                      {picked.length === pending.length ? `Registrar ingreso de todas (${pending.length})` : `Registrar ingreso de ${picked.length}`}
                    </button>
                  </div>
                </fieldset>
              )}
            </>
          )}
        </section>
      )}
    </div>
  );
}
