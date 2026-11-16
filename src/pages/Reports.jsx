import { useEffect, useRef, useState } from 'react';
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LabelList,
} from 'recharts';
import { useCinema } from '../context/CinemaContext';
import { adminApi } from '../api/admin';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { QueryGate } from '../components/SalesParts';
import { CHANNEL_LABELS, pctText, shortDay, dayLabel } from '../utils/salesFormat';
import { addDaysToDate, todayInLima } from '../data/limaDate';
import { money } from '../utils/money';
import './MovieManagement.css';
import './Sales.css';

const TABS = ['Ingresos', 'Ocupación', 'Películas', 'Pagos'];
const AXIS = { fill: 'var(--text-secondary)', fontSize: 12 };
const TIP = { contentStyle: { background: 'var(--surface-2)', border: '1px solid var(--border-interactive)', borderRadius: 8, color: 'var(--text-primary)' }, labelStyle: { color: 'var(--text-main)', fontWeight: 700 }, itemStyle: { color: 'var(--text-primary)' } };
const INK = 'var(--electric-blue)';

// Tabla de datos (alternativa accesible a un gráfico). columns: [{ key, label, num, fmt }]
function DataTable({ caption, columns, rows }) {
  return (
    <div className="sl-table-wrap">
      <table className="sl-mini">
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.num ? 'num' : undefined}>{c.label}</th>)}</tr></thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>{columns.map((c) => <td key={c.key} className={c.num ? 'num' : undefined}>{c.fmt ? c.fmt(r[c.key], r) : r[c.key]}</td>)}</tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// Gráfico con título, descripción y la misma información en una tabla desplegable (los valores también van rotulados en el gráfico).
function ChartCard({ id, title, sub, columns, rows, height = 240, children }) {
  return (
    <section className="card sl-chart" aria-labelledby={`${id}-t`}>
      <h2 id={`${id}-t`}>{title}</h2>
      {sub && <p className="sl-sub">{sub}</p>}
      <div className="sl-chart-box" role="img" aria-label={`Gráfico: ${title}. Los mismos datos están en la tabla «Ver como tabla de datos».`}>
        <ResponsiveContainer width="100%" height={height}>{children}</ResponsiveContainer>
      </div>
      <details className="sl-details">
        <summary>Ver como tabla de datos</summary>
        <DataTable caption={title} columns={columns} rows={rows} />
      </details>
    </section>
  );
}

const Kpis = ({ items }) => (
  <ul className="sl-kpis">
    {items.map((k) => (
      <li key={k.label} className="card sl-kpi"><div className="sl-kpi-value">{k.value}</div><div className="sl-kpi-label">{k.label}</div>{k.note && <div className="sl-kpi-note">{k.note}</div>}</li>
    ))}
  </ul>
);
const Empty = ({ children }) => <div className="sl-empty"><p><strong>{children}</strong></p><p>Cambia el rango de fechas o espera a que haya compras.</p></div>;

function Revenue({ d }) {
  const { totals, range, byDay, byBranch } = d;
  if (totals.transactions === 0) return <Empty>Todavía no hay ventas en este rango.</Empty>;
  const dayRows = byDay.map((r) => ({ ...r, label: shortDay(r.date) }));
  return (
    <>
      <Kpis items={[
        { label: 'Ingresos aprobados', value: money(totals.revenue) },
        { label: 'Entradas vendidas', value: totals.tickets },
        { label: 'Promedio diario', value: money(totals.revenue / range.days), note: `en ${range.days} ${range.days === 1 ? 'día' : 'días'}` },
        { label: 'Reembolsado', value: money(totals.refundedAmount) },
      ]} />
      <div className="sl-grid2">
        <ChartCard id="rv-day" title="Ingresos por día" sub="Soles de órdenes aprobadas, por día de compra (Lima). Los días sin ventas valen 0."
          columns={[{ key: 'date', label: 'Día', fmt: (v) => dayLabel(v) }, { key: 'orders', label: 'Órdenes', num: true }, { key: 'tickets', label: 'Entradas', num: true }, { key: 'revenue', label: 'Ingresos', num: true, fmt: money }]} rows={byDay}>
          <LineChart data={dayRows} margin={{ top: 8, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-interactive)" />
            <XAxis dataKey="label" tick={AXIS} interval="preserveStartEnd" minTickGap={16} />
            <YAxis tick={AXIS} tickFormatter={(v) => `S/ ${v}`} width={64} allowDecimals={false} />
            <Tooltip {...TIP} formatter={(v) => [money(v), 'Ingresos']} />
            <Line type="linear" dataKey="revenue" name="Ingresos" stroke={INK} strokeWidth={2.5} dot={{ r: 4, fill: INK }} isAnimationActive={false} />
          </LineChart>
        </ChartCard>
        <ChartCard id="rv-branch" title="Ingresos por sede" sub="Soles de órdenes aprobadas en el rango."
          columns={[{ key: 'name', label: 'Sede' }, { key: 'orders', label: 'Órdenes', num: true }, { key: 'tickets', label: 'Entradas', num: true }, { key: 'revenue', label: 'Ingresos', num: true, fmt: money }]} rows={byBranch}>
          <BarChart data={byBranch} margin={{ top: 22, right: 12, left: 4, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border-interactive)" vertical={false} />
            <XAxis dataKey="name" tick={AXIS} />
            <YAxis tick={AXIS} tickFormatter={(v) => `S/ ${v}`} width={64} allowDecimals={false} />
            <Tooltip {...TIP} formatter={(v) => [money(v), 'Ingresos']} />
            <Bar dataKey="revenue" name="Ingresos" fill={INK} isAnimationActive={false}>
              <LabelList dataKey="revenue" position="top" formatter={money} fill="var(--text-primary)" fontSize={12} />
            </Bar>
          </BarChart>
        </ChartCard>
      </div>
    </>
  );
}

function Occupancy({ d }) {
  const { occupancy, byHall, byScreening, screeningsTruncated } = d;
  if (occupancy.screenings === 0) return <Empty>No hay funciones programadas en este rango.</Empty>;
  const halls = byHall.map((h) => ({ ...h, label: `${h.branchName} · ${h.hallName}` }));
  return (
    <>
      <Kpis items={[
        { label: 'Ocupación general', value: pctText(occupancy.rate) },
        { label: 'Butacas vendidas', value: occupancy.sold, note: `de ${occupancy.capacity} disponibles` },
        { label: 'Funciones', value: occupancy.screenings, note: 'sin borradores ni canceladas' },
      ]} />
      <p className="sl-note">Ocupación = butacas vendidas sobre la capacidad de las funciones cuya fecha cae en el rango (incluye funciones futuras).</p>
      <ChartCard id="oc-hall" title="Ocupación por sala" sub="Porcentaje de butacas vendidas en las funciones del rango." height={Math.max(220, halls.length * 44 + 40)}
        columns={[{ key: 'label', label: 'Sala' }, { key: 'screenings', label: 'Funciones', num: true }, { key: 'sold', label: 'Vendidas', num: true }, { key: 'capacity', label: 'Capacidad', num: true }, { key: 'occupancy', label: 'Ocupación', num: true, fmt: pctText }]} rows={halls}>
        <BarChart data={halls} layout="vertical" margin={{ top: 4, right: 48, left: 8, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="var(--border-interactive)" horizontal={false} />
          <XAxis type="number" domain={[0, 100]} tick={AXIS} tickFormatter={(v) => `${v} %`} />
          <YAxis type="category" dataKey="label" tick={AXIS} width={170} />
          <Tooltip {...TIP} formatter={(v) => [pctText(v), 'Ocupación']} />
          <Bar dataKey="occupancy" name="Ocupación" fill={INK} isAnimationActive={false}>
            <LabelList dataKey="occupancy" position="right" formatter={pctText} fill="var(--text-primary)" fontSize={12} />
          </Bar>
        </BarChart>
      </ChartCard>
      <section className="card sl-section" style={{ marginTop: 20 }} aria-labelledby="oc-fn-t">
        <h2 id="oc-fn-t">Ocupación por función</h2>
        <details className="sl-details" open>
          <summary>Tabla de funciones</summary>
          <DataTable caption="Ocupación por función"
            columns={[{ key: 'date', label: 'Día' }, { key: 'startTime', label: 'Hora' }, { key: 'movieTitle', label: 'Película' }, { key: 'hallName', label: 'Sala', fmt: (v, r) => `${r.branchName} · ${v}` },
              { key: 'sold', label: 'Vendidas', num: true }, { key: 'capacity', label: 'Capacidad', num: true }, { key: 'occupancy', label: 'Ocupación', num: true, fmt: pctText }]} rows={byScreening} />
          {screeningsTruncated && <p className="sl-note">Se muestran las primeras {byScreening.length} funciones del rango.</p>}
        </details>
      </section>
    </>
  );
}

function Movies({ d }) {
  const movies = d.byMovie.slice(0, 10);
  if (d.totals.transactions === 0 || movies.length === 0) return <Empty>Todavía no hay ventas en este rango.</Empty>;
  return (
    <ChartCard id="mv-top" title="Películas por entradas vendidas" sub={`Las ${movies.length === 1 ? 'película' : `${movies.length} películas`} con más entradas en órdenes aprobadas.`} height={Math.max(200, movies.length * 44 + 40)}
      columns={[{ key: 'title', label: 'Película' }, { key: 'orders', label: 'Órdenes', num: true }, { key: 'tickets', label: 'Entradas', num: true }, { key: 'revenue', label: 'Ingresos', num: true, fmt: money }]} rows={d.byMovie}>
      <BarChart data={movies} layout="vertical" margin={{ top: 4, right: 40, left: 8, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="var(--border-interactive)" horizontal={false} />
        <XAxis type="number" tick={AXIS} allowDecimals={false} />
        <YAxis type="category" dataKey="title" tick={AXIS} width={170} />
        <Tooltip {...TIP} formatter={(v) => [v, 'Entradas']} />
        <Bar dataKey="tickets" name="Entradas" fill={INK} isAnimationActive={false}>
          <LabelList dataKey="tickets" position="right" fill="var(--text-primary)" fontSize={12} />
        </Bar>
      </BarChart>
    </ChartCard>
  );
}

function Payments({ d }) {
  const { totals, byChannel, byPresale } = d;
  if (totals.transactions === 0) return <Empty>Todavía no hay ventas en este rango.</Empty>;
  const sumTickets = byChannel.reduce((a, r) => a + r.tickets, 0) || 1;
  const share = (v) => (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
      <span className="sl-bar" aria-hidden="true"><span style={{ width: `${Math.round((v / sumTickets) * 100)}%` }} /></span>{Math.round((v / sumTickets) * 100)} %
    </span>
  );
  return (
    <>
      <Kpis items={[
        { label: 'Tasa de aprobación', value: pctText(totals.approvalRate), note: 'pagos aceptados sobre intentados' },
        { label: 'Pagos rechazados', value: totals.rejected },
        { label: 'Órdenes reembolsadas', value: totals.refunded, note: money(totals.refundedAmount) },
        { label: 'Transacciones', value: totals.transactions },
      ]} />
      <div className="sl-grid2">
        <section className="card sl-section" aria-labelledby="pg-sum-t">
          <h2 id="pg-sum-t">Resumen de transacciones</h2>
          <DataTable caption="Resumen de transacciones por estado" columns={[{ key: 'label', label: 'Estado' }, { key: 'value', label: 'Órdenes', num: true }]}
            rows={[{ label: 'Aprobadas', value: totals.approved }, { label: 'Rechazadas', value: totals.rejected }, { label: 'Reembolsadas (simulado)', value: totals.refunded },
              { label: 'Canceladas', value: totals.cancelled }, { label: 'Pendientes', value: totals.pending }, { label: 'Total', value: totals.transactions }]} />
        </section>
        <section className="card sl-section" aria-labelledby="pg-ch-t">
          <h2 id="pg-ch-t">Ventas por canal</h2>
          <DataTable caption="Ventas aprobadas por canal" columns={[{ key: 'channel', label: 'Canal', fmt: (v) => CHANNEL_LABELS[v] ?? v }, { key: 'orders', label: 'Órdenes', num: true },
            { key: 'tickets', label: 'Entradas', num: true }, { key: 'revenue', label: 'Ingresos', num: true, fmt: money }, { key: 'share', label: 'Parte de las entradas', fmt: (_, r) => share(r.tickets) }]} rows={byChannel} />
          <h2 id="pg-pre-t" style={{ marginTop: 20 }}>Preventa y venta normal</h2>
          <DataTable caption="Ventas aprobadas, preventa frente a venta normal" columns={[{ key: 'presale', label: 'Tipo', fmt: (v) => (v ? 'Preventa' : 'Venta normal') }, { key: 'orders', label: 'Órdenes', num: true },
            { key: 'tickets', label: 'Entradas', num: true }, { key: 'revenue', label: 'Ingresos', num: true, fmt: money }]} rows={byPresale} />
        </section>
      </div>
    </>
  );
}

export default function Reports() {
  const { currentCinemaId, isAdminCentral, branches } = useCinema();
  const today = todayInLima();
  const initial = { from: addDaysToDate(today, -6), to: today };
  const [draft, setDraft] = useState(initial);
  const [applied, setApplied] = useState(initial);
  const [tab, setTab] = useState('Ingresos');
  const headingRef = useRef(null);
  useEffect(() => { document.title = 'Reportes · Cinerama'; headingRef.current?.focus(); }, []);

  const branchId = isAdminCentral && currentCinemaId !== 'all' ? currentCinemaId : '';
  const params = { ...applied, branchId };
  const query = useAdminQuery(() => adminApi.sales.reports(params), JSON.stringify(params));
  const d = query.data;
  const invalid = !draft.from || !draft.to || draft.from > draft.to;
  const preset = (days) => { const r = { from: addDaysToDate(today, -(days - 1)), to: today }; setDraft(r); setApplied(r); };
  const scopeName = isAdminCentral ? (branchId ? branches.find((b) => b.id === branchId)?.name : 'todas las sedes') : 'tu sede';

  return (
    <div className="mv-page">
      <div className="page-header">
        <div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>{isAdminCentral ? 'Reportes globales' : 'Reportes de la sede'}</h1>
          <p className="page-subtitle">Calculados por el servidor con las compras reales ({scopeName}). Fechas de Lima.</p>
        </div>
      </div>

      <form className="mv-toolbar" role="search" aria-label="Rango de fechas del reporte" onSubmit={(e) => { e.preventDefault(); if (!invalid) setApplied(draft); }}>
        <div className="mv-filter">
          <label htmlFor="rp-from">Desde</label>
          <input id="rp-from" className="input" type="date" value={draft.from} onChange={(e) => setDraft((x) => ({ ...x, from: e.target.value }))} />
        </div>
        <div className="mv-filter">
          <label htmlFor="rp-to">Hasta</label>
          <input id="rp-to" className="input" type="date" value={draft.to} onChange={(e) => setDraft((x) => ({ ...x, to: e.target.value }))} aria-describedby="rp-hint" />
        </div>
        <button type="submit" className="btn btn-primary" disabled={invalid}>Ver reporte</button>
        <div className="sl-range" role="group" aria-label="Rangos rápidos">
          <button type="button" className="btn btn-secondary" onClick={() => preset(7)}>Últimos 7 días</button>
          <button type="button" className="btn btn-secondary" onClick={() => preset(30)}>Últimos 30 días</button>
        </div>
      </form>
      <p id="rp-hint" className={invalid ? 'mv-field-error' : 'sl-note'} role={invalid ? 'alert' : undefined}>
        {invalid ? 'Elige las dos fechas y que «Hasta» no sea anterior a «Desde».' : 'Máximo 92 días por reporte.'}
      </p>

      <QueryGate query={query} what="el reporte" />

      {d && (
        <>
          <p className="sr-only" role="status">{query.status === 'loading' ? 'Actualizando el reporte…' : `Reporte del ${d.range.from} al ${d.range.to}`}</p>
          <p className="sl-note">Del {dayLabel(d.range.from).toLowerCase()} al {dayLabel(d.range.to).toLowerCase()} ({d.range.days} {d.range.days === 1 ? 'día' : 'días'}).</p>
          <div className="sl-tabs" role="group" aria-label="Secciones del reporte">
            {TABS.map((t) => <button key={t} type="button" className="btn btn-secondary" aria-pressed={tab === t} onClick={() => setTab(t)}>{t}</button>)}
          </div>
          {tab === 'Ingresos' && <Revenue d={d} />}
          {tab === 'Ocupación' && <Occupancy d={d} />}
          {tab === 'Películas' && <Movies d={d} />}
          {tab === 'Pagos' && <Payments d={d} />}
        </>
      )}
    </div>
  );
}
