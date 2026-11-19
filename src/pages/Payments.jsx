import { useEffect, useRef, useState } from 'react';
import { Download, CheckCircle, XCircle, RotateCcw, Clock, Ban } from 'lucide-react';
import { useCinema } from '../context/CinemaContext';
import { adminApi } from '../api/admin';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { QueryGate, Pager } from '../components/SalesParts';
import DialogHead from '../components/DialogHead';
import { CHANNEL_LABELS, dayLabel } from '../utils/salesFormat';
import { money } from '../utils/money';
import './MovieManagement.css';
import './Sales.css';

const STATUS = {
  approved: { label: 'Aprobado', icon: CheckCircle },
  rejected: { label: 'Rechazado', icon: XCircle },
  refunded: { label: 'Reembolsado (simulado)', icon: RotateCcw },
  cancelled: { label: 'Cancelado', icon: Ban },
  pending: { label: 'Pendiente', icon: Clock },
};
const EMPTY = { q: '', status: '', channel: '', from: '', to: '' };

function StatusTag({ status }) {
  const s = STATUS[status] ?? { label: status, icon: Clock };
  const Icon = s.icon;
  return <span className={`sl-status sl-status-${status}`}><Icon size={13} aria-hidden="true" />{s.label}</span>;
}

const BOM = String.fromCharCode(0xFEFF); // para que Excel lea las tildes

// Texto de una celda CSV: comillas dobles y, contra la inyección de fórmulas, un apóstrofo si empieza con = + - @.
const csvCell = (v) => {
  let t = String(v ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return `"${t.replace(/"/g, '""')}"`;
};
function downloadCsv(orders) {
  const head = ['Código', 'Fecha (Lima)', 'Sede', 'Película', 'Función', 'Butacas', 'Cliente', 'Correo (enmascarado)', 'Canal', 'Entradas (S/)', 'Confitería (S/)', 'Monto total (S/)', 'Estado'];
  const rows = orders.map((o) => [o.code, o.createdLima, o.branch.name, o.screening.movieTitle, `${o.screening.date} ${o.screening.startTime}`,
    o.seats.join(' '), o.customerName, o.emailMasked ?? '', CHANNEL_LABELS[o.channel] ?? o.channel, o.ticketAmount.toFixed(2), o.foodAmount.toFixed(2), o.amount.toFixed(2), STATUS[o.status]?.label ?? o.status]);
  const text = `${BOM}${[head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n')}\r\n`;
  const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url; a.download = 'pagos-pagina.csv'; document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function OrderDialog({ order, onClose }) {
  const ref = useRef(null);
  useEffect(() => { ref.current?.showModal(); }, []);
  const sc = order.screening;
  return (
    <dialog ref={ref} className="mv-dialog" aria-labelledby="pay-dlg-title" onClose={onClose}>
      <DialogHead id="pay-dlg-title" title={`Orden ${order.code}`} onClose={() => ref.current?.close()} />
      <dl className="sl-dl">
        <dt>Estado</dt><dd><StatusTag status={order.status} /></dd>
        <dt>Cliente</dt><dd>{order.customerName}{order.emailMasked ? ` · ${order.emailMasked}` : ' · sin correo (venta en mostrador)'}</dd>
        <dt>Película</dt><dd>{sc.movieTitle}</dd>
        <dt>Función</dt><dd>{dayLabel(sc.date)}, {sc.startTime} · {sc.format} · {sc.language === 'ES' ? 'Doblada' : 'Subtitulada'}</dd>
        <dt>Sede y sala</dt><dd>{order.branch.name} · {sc.hallName}</dd>
        <dt>Butacas</dt><dd>{order.seats.length ? order.seats.join(', ') : 'Ninguna'}{order.status === 'rejected' && ' (no se reservaron: el pago fue rechazado)'}</dd>
        <dt>Entradas</dt><dd>{money(order.ticketAmount)}</dd>
        <dt>Confitería</dt>
        <dd>
          {order.items.length === 0 ? money(0) : (
            <>
              {money(order.foodAmount)}
              <ul className="sl-items" aria-label="Productos de confitería de la orden">
                {order.items.map((i) => <li key={`${i.name}-${i.variantLabel}`}>{i.qty} × {i.name} ({i.variantLabel}) · {money(i.lineTotal)}</li>)}
              </ul>
            </>
          )}
        </dd>
        <dt>Monto total</dt><dd><strong>{money(order.amount)}</strong></dd>
        <dt>Canal</dt><dd>{CHANNEL_LABELS[order.channel] ?? order.channel}{order.presale && ' · Preventa'}</dd>
        <dt>Compra</dt><dd>{order.createdLima} (hora de Lima)</dd>
        <dt>Pago</dt><dd>{order.payment.method === 'cash' ? 'Efectivo' : 'Tarjeta'}, simulado · referencia {order.payment.ref || 'sin referencia'}</dd>
        {order.refund && (
          <>
            <dt>Reembolso</dt>
            <dd>Simulado{order.refund.reason ? `: ${order.refund.reason}` : ''}{order.refund.at ? ` · ${new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(order.refund.at))}` : ''}</dd>
          </>
        )}
      </dl>
      <div className="mv-dialog-actions">
        <button type="button" className="btn btn-primary" onClick={() => ref.current?.close()}>Cerrar</button>
      </div>
    </dialog>
  );
}

export default function Payments() {
  const { currentCinemaId, isAdminCentral } = useCinema();
  const [draft, setDraft] = useState(EMPTY);
  const [applied, setApplied] = useState(EMPTY);
  const [pageState, setPageState] = useState({ n: 1, scope: null });
  const [open, setOpen] = useState(null);
  const headingRef = useRef(null);
  useEffect(() => { document.title = 'Pagos · Cinerama'; headingRef.current?.focus(); }, []);

  const branchId = isAdminCentral && currentCinemaId !== 'all' ? currentCinemaId : '';
  // La pagina vuelve a 1 al cambiar de sede en el selector del panel.
  const page = pageState.scope === branchId ? pageState.n : 1;
  const setPage = (n) => setPageState({ n, scope: branchId });
  const params = { ...applied, branchId, page };
  const query = useAdminQuery(() => adminApi.sales.orders(params), JSON.stringify(params));
  const data = query.data;
  const set = (k) => (e) => setDraft((d) => ({ ...d, [k]: e.target.value }));
  const submit = (e) => { e.preventDefault(); setApplied(draft); setPage(1); };
  const clear = () => { setDraft(EMPTY); setApplied(EMPTY); setPage(1); };
  const hasFilters = Object.values(applied).some(Boolean);
  const dateError = draft.from && draft.to && draft.from > draft.to;

  const kpis = data && [
    { label: 'Ingresos aprobados', value: money(data.totals.revenue), note: 'Entradas y confitería' },
    { label: 'Ingresos de entradas', value: money(data.totals.ticketRevenue) },
    { label: 'Ingresos de confitería', value: money(data.totals.foodRevenue) },
    { label: 'Reembolsado', value: money(data.totals.refunded) },
    { label: 'Pagos rechazados', value: data.totals.rejected },
    { label: 'Transacciones', value: data.totals.transactions },
  ];

  return (
    <div className="mv-page">
      <div className="page-header">
        <div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>Pagos</h1>
          <p className="page-subtitle">Órdenes de compra reales{isAdminCentral ? '' : ' de tu sede'}. Los pagos son simulados: no se cobra ni se guarda ningún dato de tarjeta.</p>
        </div>
        <button type="button" className="btn btn-secondary" disabled={!data?.orders.length} onClick={() => downloadCsv(data.orders)}
          title="Descarga en CSV las órdenes de la página que ves (correo enmascarado)">
          <Download size={15} aria-hidden="true" /> Exportar esta página (CSV)
        </button>
      </div>

      <QueryGate query={query} what="las órdenes"
        demoBlockText="La lista de órdenes muestra nombres de clientes, así que no se abre mientras el administrador central conserve la contraseña de demostración." />

      {query.status !== 'error' && (
        <>
          <form className="mv-toolbar" role="search" aria-label="Filtrar órdenes" onSubmit={submit}>
            <div className="mv-filter mv-filter-grow">
              <label htmlFor="pay-q">Código o cliente</label>
              <input id="pay-q" className="input" type="search" value={draft.q} onChange={set('q')} maxLength={80} placeholder="CIN-… o nombre" />
            </div>
            <div className="mv-filter">
              <label htmlFor="pay-status">Estado</label>
              <select id="pay-status" className="select" value={draft.status} onChange={set('status')}>
                <option value="">Todos</option>
                {Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </select>
            </div>
            <div className="mv-filter">
              <label htmlFor="pay-channel">Canal</label>
              <select id="pay-channel" className="select" value={draft.channel} onChange={set('channel')}>
                <option value="">Todos</option>
                {Object.entries(CHANNEL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
              </select>
            </div>
            <div className="mv-filter">
              <label htmlFor="pay-from">Desde</label>
              <input id="pay-from" className="input" type="date" value={draft.from} onChange={set('from')} />
            </div>
            <div className="mv-filter">
              <label htmlFor="pay-to">Hasta</label>
              <input id="pay-to" className="input" type="date" value={draft.to} onChange={set('to')} aria-invalid={dateError || undefined} aria-describedby={dateError ? 'pay-date-err' : undefined} />
            </div>
            <button type="submit" className="btn btn-primary" disabled={dateError}>Aplicar filtros</button>
            <button type="button" className="btn btn-secondary" onClick={clear} disabled={!hasFilters && !Object.values(draft).some(Boolean)}>Limpiar</button>
          </form>
          {dateError && <p id="pay-date-err" className="mv-field-error" role="alert">La fecha «Hasta» no puede ser anterior a «Desde».</p>}
        </>
      )}

      {data && (
        <>
          <p className="sl-note">Los totales corresponden a todas las órdenes que cumplen los filtros, no solo a esta página. Las fechas son de Lima.</p>
          <ul className="sl-kpis" aria-label="Totales de la consulta">
            {kpis.map((k) => (
              <li key={k.label} className="card sl-kpi"><div className="sl-kpi-value">{k.value}</div><div className="sl-kpi-label">{k.label}</div>{k.note && <div className="sl-kpi-note">{k.note}</div>}</li>
            ))}
          </ul>

          <p className="sr-only" role="status">{query.status === 'loading' ? 'Actualizando…' : `${data.total} ${data.total === 1 ? 'orden' : 'órdenes'}, página ${data.page} de ${data.pages}`}</p>

          {data.total === 0 ? (
            <div className="sl-empty">
              {hasFilters ? <p><strong>Ninguna orden coincide con esos filtros.</strong></p> : <p><strong>Todavía no hay ventas.</strong></p>}
              <p>{hasFilters ? 'Prueba con otros filtros o límpialos.' : 'Cuando un cliente compre entradas, la orden aparecerá aquí.'}</p>
            </div>
          ) : (
            <>
              <div className="table-wrapper card sl-table-wrap" style={{ padding: 0 }}>
                <table className="table mv-table sl-table">
                  <caption className="sr-only">Órdenes de compra, de la más reciente a la más antigua</caption>
                  <thead>
                    <tr>
                      <th scope="col">Código</th><th scope="col">Función</th><th scope="col">Cliente</th><th scope="col">Sede</th>
                      <th scope="col">Entradas</th><th scope="col">Confitería</th><th scope="col">Monto total</th><th scope="col">Estado</th><th scope="col">Compra (Lima)</th><th scope="col">Detalle</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.orders.map((o) => (
                      <tr key={o.code}>
                        <td><span className="sl-code">{o.code}</span></td>
                        <td><span className="mv-title">{o.screening.movieTitle}</span><div className="mv-sub">{o.screening.date} · {o.screening.startTime} · {o.seats.length} {o.seats.length === 1 ? 'butaca' : 'butacas'}</div></td>
                        <td>{o.customerName}<div className="mv-sub">{o.emailMasked}</div></td>
                        <td>{o.branch.name}</td>
                        <td><span className="sl-money">{money(o.ticketAmount)}</span></td>
                        <td><span className="sl-money">{money(o.foodAmount)}</span></td>
                        <td><span className="sl-money">{money(o.amount)}</span></td>
                        <td><StatusTag status={o.status} /></td>
                        <td>{o.createdLima}</td>
                        <td><button type="button" className="btn btn-secondary btn-sm" onClick={() => setOpen(o)}>Ver<span className="sr-only"> detalle de la orden {o.code}</span></button></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <Pager page={data.page} pages={data.pages} total={data.total} onPage={setPage} label="órdenes" />
            </>
          )}
        </>
      )}
      {open && <OrderDialog key={open.code} order={open} onClose={() => setOpen(null)} />}
    </div>
  );
}
