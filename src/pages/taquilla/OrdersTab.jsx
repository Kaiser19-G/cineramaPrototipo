import { useEffect, useRef, useState } from 'react';
import { CheckCircle, XCircle, RotateCcw, Clock, Ban, AlertTriangle } from 'lucide-react';
import { useCinema } from '../../context/CinemaContext';
import { adminApi } from '../../api/admin';
import { useAdminQuery } from '../../hooks/useAdminQuery';
import { QueryGate, Pager } from '../../components/SalesParts';
import { CHANNEL_LABELS, dayLabel } from '../../utils/salesFormat';
import { COUNTER_PAY_METHODS, STAFF_REFUND_REASONS } from '../../shared/purchase';
import { formatSol } from './common';

const STATUS = {
  approved: { label: 'Aprobado', icon: CheckCircle },
  rejected: { label: 'Rechazado', icon: XCircle },
  refunded: { label: 'Reembolsado (simulado)', icon: RotateCcw },
  cancelled: { label: 'Cancelado', icon: Ban },
  pending: { label: 'Pendiente', icon: Clock },
};
const REFUND_ERRORS = {
  not_refundable: 'Esa orden ya no se puede reembolsar (no está aprobada).',
  screening_finished: 'La función ya terminó: no se puede reembolsar.',
  already_checked_in: 'La orden ya tiene butacas con ingreso registrado: no se puede reembolsar. Si entró una parte, la orden se mantiene completa.',
  not_found: 'No se encontró la orden en tu alcance.',
  demo_password: 'Reembolsar está bloqueado mientras el administrador central conserve la contraseña de demostración.',
  forbidden: 'Tu rol no puede reembolsar.',
  unauthenticated: 'Tu sesión terminó. Inicia sesión de nuevo.',
  validation: 'Elige un motivo de la lista.',
  network: 'No pudimos conectar con el servidor. Inténtalo de nuevo: el reembolso no se duplica.',
};

function RefundDialog({ order, onClose, onDone }) {
  const ref = useRef(null);
  const [reason, setReason] = useState('');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { ref.current?.showModal(); }, []);
  const missing = touched && !reason;

  const submit = async (e) => {
    e.preventDefault();
    setTouched(true);
    if (!reason || busy) return;
    setBusy(true); setError('');
    const r = await adminApi.counter.refund(order.code, reason);
    setBusy(false);
    if (r.ok) { onDone(order); ref.current?.close(); return; }
    setError(REFUND_ERRORS[r.error] ?? 'No se pudo reembolsar. Inténtalo de nuevo.');
  };
  const sc = order.screening;
  return (
    <dialog ref={ref} className="mv-dialog" style={{ width: 'min(560px, calc(100vw - 32px))' }} aria-labelledby="tq-refund-title" onClose={onClose}>
      <h2 id="tq-refund-title">Reembolsar la orden {order.code}</h2>
      <dl className="sl-dl">
        <dt>Película</dt><dd>{sc.movieTitle}</dd>
        <dt>Función</dt><dd>{dayLabel(sc.date)}, {sc.startTime} · {sc.hallName}</dd>
        <dt>Butacas</dt><dd>{order.seats.join(', ')}</dd>
        <dt>Monto</dt><dd>{formatSol(order.amount)}</dd>
      </dl>
      <p>
        <strong>Qué pasa al confirmar:</strong> las butacas quedan libres y se pueden vender de nuevo, la orden pasa a «Reembolsada (simulado)»,
        el cliente la verá así en Mis entradas con el motivo que elijas y el código deja de servir en la puerta. El reembolso es simulado: no se devuelve dinero real.
        No se puede deshacer.
      </p>
      <form onSubmit={submit} noValidate>
        <div className="mv-field">
          <label htmlFor="tq-reason">Motivo del reembolso</label>
          <select id="tq-reason" className="select" value={reason} required aria-invalid={missing || undefined} aria-describedby={missing ? 'tq-reason-err' : undefined}
            onChange={(e) => setReason(e.target.value)}>
            <option value="">Elige un motivo</option>
            {Object.entries(STAFF_REFUND_REASONS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
          {missing && <p className="mv-field-error" id="tq-reason-err">Elige el motivo del reembolso.</p>}
        </div>
        <div role="alert">{error && <p className="mv-field-error"><AlertTriangle size={14} aria-hidden="true" /> {error}</p>}</div>
        <div className="mv-dialog-actions">
          <button type="button" className="btn btn-secondary" onClick={() => ref.current?.close()}>No reembolsar</button>
          <button type="submit" className="btn btn-primary" disabled={busy}>{busy ? 'Reembolsando…' : `Reembolsar ${formatSol(order.amount)}`}</button>
        </div>
      </form>
    </dialog>
  );
}

// Ordenes de la sede y reembolso individual.
export default function OrdersTab({ canRefund }) {
  const { currentCinemaId, isAdminCentral } = useCinema();
  const [draft, setDraft] = useState({ q: '', status: '' });
  const [applied, setApplied] = useState({ q: '', status: '' });
  const [pageState, setPageState] = useState({ n: 1, scope: null });
  const [refunding, setRefunding] = useState(null);
  const [flash, setFlash] = useState('');
  const [version, setVersion] = useState(0);
  const branchId = isAdminCentral && currentCinemaId !== 'all' ? currentCinemaId : '';
  const page = pageState.scope === branchId ? pageState.n : 1;
  const setPage = (n) => setPageState({ n, scope: branchId });
  const params = { ...applied, branchId, page, pageSize: 20 };
  const query = useAdminQuery(() => adminApi.sales.orders(params), `${JSON.stringify(params)}#${version}`);
  const data = query.data;
  const submit = (e) => { e.preventDefault(); setApplied(draft); setPage(1); };

  return (
    <div className="tq-orders">
      <p className="tq-lead">Órdenes recientes{isAdminCentral ? '' : ' de tu sede'}. {canRefund ? 'Desde aquí puedes reembolsar una orden aprobada con un motivo.' : 'Tu rol puede consultarlas, pero no reembolsar.'}</p>
      <QueryGate query={query} what="las órdenes"
        demoBlockText="La lista de órdenes muestra nombres de clientes y desde ella se reembolsa, así que no se abre mientras el administrador central conserve la contraseña de demostración. Vender y validar entradas siguen disponibles." />
      {flash && <p className="mv-flash" role="status">{flash}</p>}
      {query.status !== 'error' && (
        <>
          <form className="mv-toolbar" role="search" aria-label="Filtrar órdenes" onSubmit={submit}>
            <div className="mv-filter mv-filter-grow">
              <label htmlFor="tq-q">Código o cliente</label>
              <input id="tq-q" className="input" type="search" value={draft.q} maxLength={80} placeholder="CIN-… o nombre" onChange={(e) => setDraft((d) => ({ ...d, q: e.target.value }))} />
            </div>
            <div className="mv-filter">
              <label htmlFor="tq-status">Estado</label>
              <select id="tq-status" className="select" value={draft.status} onChange={(e) => setDraft((d) => ({ ...d, status: e.target.value }))}>
                <option value="">Todos</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-secondary">Aplicar filtros</button>
          </form>
          {data && (data.orders.length === 0 ? (
            <div className="sl-empty"><p><strong>No hay órdenes que mostrar.</strong></p><p>Cuando haya ventas aparecerán aquí.</p></div>
          ) : (
            <>
              <div className="sl-table-wrap">
                <table className="table sl-table">
                  <caption className="tq-caption">Órdenes recientes (página {data.page} de {data.pages})</caption>
                  <thead>
                    <tr><th scope="col">Código</th><th scope="col">Función</th><th scope="col">Butacas</th><th scope="col">Cliente</th><th scope="col">Canal y pago</th><th scope="col">Monto</th><th scope="col">Estado</th><th scope="col"><span className="sr-only">Acciones</span></th></tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o) => {
                      const st = STATUS[o.status] ?? { label: o.status, icon: Clock };
                      const Icon = st.icon;
                      return (
                        <tr key={o.code}>
                          <th scope="row"><code className="sl-code">{o.code}</code></th>
                          <td>{o.screening.movieTitle}<br /><span className="mv-sub">{dayLabel(o.screening.date)}, {o.screening.startTime} · {o.screening.hallName}</span></td>
                          <td>{o.seats.length ? o.seats.join(', ') : '—'}</td>
                          <td>{o.customerName}</td>
                          <td>{CHANNEL_LABELS[o.channel] ?? o.channel}<br /><span className="mv-sub">{COUNTER_PAY_METHODS[o.payment.method] ?? 'Tarjeta'} (simulado)</span></td>
                          <td className="sl-money">{formatSol(o.amount)}</td>
                          <td>
                            <span className={`sl-status sl-status-${o.status}`}><Icon size={13} aria-hidden="true" />{st.label}</span>
                            {o.refund?.reason && <><br /><span className="mv-sub">{o.refund.reason}</span></>}
                            {o.checkedInCount > 0 && <><br /><span className="mv-sub">{o.checkedInCount} {o.checkedInCount === 1 ? 'butaca ingresó' : 'butacas ingresaron'}</span></>}
                          </td>
                          <td>
                            {canRefund && o.status === 'approved' && (o.checkedInCount > 0
                              ? <span className="mv-sub">No reembolsable: ya hubo ingreso</span>
                              : <button type="button" className="btn btn-secondary btn-sm" onClick={() => { setFlash(''); setRefunding(o); }}>Reembolsar<span className="sr-only"> la orden {o.code}</span></button>)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} label="órdenes" />
            </>
          ))}
        </>
      )}
      {refunding && (
        <RefundDialog order={refunding} onClose={() => setRefunding(null)}
          onDone={(o) => { setFlash(`La orden ${o.code} se reembolsó (simulado): sus butacas quedaron libres.`); setVersion((v) => v + 1); }} />
      )}
    </div>
  );
}
