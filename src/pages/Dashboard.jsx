import { useEffect, useRef } from 'react';
import { DollarSign, Popcorn, Ticket, Clapperboard, Users, AlertCircle, Plus, ArrowRight, Globe, MapPin, Building2 } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCinema } from '../context/CinemaContext';
import { adminApi } from '../api/admin';
import { useAdminQuery } from '../hooks/useAdminQuery';
import { QueryGate } from '../components/SalesParts';
import { pctText, dayLabel } from '../utils/salesFormat';
import { money } from '../utils/money';
import './Dashboard.css';
import './MovieManagement.css';
import './Sales.css';

const ACTION_LABELS = {
  'screening.create': 'Función programada', 'screening.update': 'Función editada', 'screening.cancel': 'Función cancelada',
  'movie.create': 'Película creada', 'movie.update': 'Película editada', 'movie.disable': 'Película retirada',
  'user.create': 'Usuario creado', 'user.update': 'Usuario editado', 'user.reset_password': 'Contraseña temporal emitida',
  'counter.sale': 'Venta en taquilla', 'ticket.checkin': 'Ingreso a sala registrado', 'order.refund': 'Reembolso procesado',
  'product.create': 'Producto de confitería creado', 'product.update': 'Producto de confitería editado',
  'product.stock': 'Disponibilidad de confitería cambiada',
  'pickup.start': 'Pedido de confitería: preparación iniciada', 'pickup.ready': 'Pedido de confitería: marcado como listo',
  'pickup.revert': 'Pedido de confitería: vuelto a preparación', 'pickup.deliver': 'Pedido de confitería entregado',
};
const when = (ms) => new Intl.DateTimeFormat('es-PE', { timeZone: 'America/Lima', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(ms));

function ScreeningsTable({ id, caption, list, showDay }) {
  return (
    <div className="table-wrapper card" style={{ padding: 0, overflowX: 'auto' }}>
      <table className="table mv-table" id={id}>
        <caption className="sr-only">{caption}</caption>
        <thead><tr>{showDay && <th scope="col">Día</th>}<th scope="col">Hora</th><th scope="col">Película</th><th scope="col">Sala</th><th scope="col">Butacas vendidas</th></tr></thead>
        <tbody>
          {list.map((s) => (
            <tr key={s.id}>
              {showDay && <td>{s.date}</td>}
              <td>{s.startTime}–{s.endTime}</td>
              <td><span className="mv-title">{s.movieTitle}</span></td>
              <td>{s.branchName} · {s.hallName}</td>
              <td>{s.sold} de {s.capacity} ({pctText(s.occupancy)})</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { isGlobal, activeBranch, isAdminCentral, currentCinemaId, branches, setCinema, can, enabledMovies } = useCinema();
  const headingRef = useRef(null);
  useEffect(() => { document.title = 'Resumen · Cinerama'; headingRef.current?.focus(); }, []);

  // El servidor fija la sede del personal de sede; el admin central ve todas (el selector del panel solo cambia la sede de las listas).
  const branchId = isAdminCentral && currentCinemaId !== 'all' ? currentCinemaId : '';
  const query = useAdminQuery(() => adminApi.sales.dashboard({ branchId }), `dash-${branchId}`);
  const mine = query.data;
  const d = mine;

  const kpis = [];
  if (mine) {
    if (mine.money) {
      kpis.push({ label: 'Ingresos de hoy', value: money(mine.money.revenue), note: 'Entradas y confitería', icon: DollarSign });
      kpis.push({ label: 'Ingresos de entradas hoy', value: money(mine.money.ticketRevenue), icon: Ticket });
      kpis.push({ label: 'Ingresos de confitería hoy', value: money(mine.money.foodRevenue), icon: Popcorn });
      kpis.push({ label: 'Entradas vendidas hoy', value: mine.money.tickets, icon: Ticket });
      if (mine.pickups) {
        kpis.push({ label: 'Pedidos de confitería por entregar hoy', value: mine.pickups.toDeliver, note: `${mine.pickups.delivered} entregados · ${mine.pickups.notCollected} no recogidos`, icon: Popcorn });
      }
    }
    kpis.push({ label: 'Funciones de hoy', value: mine.screenings.list.length, icon: Clapperboard });
    kpis.push({ label: 'Ocupación de hoy', value: pctText(mine.occupancy.rate), note: `${mine.occupancy.sold} de ${mine.occupancy.capacity} butacas`, icon: Users });
    if (mine.money) kpis.push({ label: 'Pagos rechazados hoy', value: mine.money.rejected, icon: AlertCircle });
  }

  return (
    <div className="dashboard dash-real mv-page">
      <div className="page-header" style={{ marginBottom: 0 }}>
        <div>
          <h1 className="page-title" tabIndex={-1} ref={headingRef}>{isAdminCentral ? 'Resumen global' : 'Resumen de la sede'}</h1>
          <p className="page-subtitle">Indicadores de hoy{d ? `, ${dayLabel(d.today).toLowerCase()}` : ''} (hora de Lima), calculados con datos reales.</p>
        </div>
      </div>

      <div className="context-banner">
        <div className="context-banner-left">
          {isGlobal
            ? <><Globe size={16} aria-hidden="true" color="var(--info)" /><span>Vista global — todos los cines</span></>
            : <><MapPin size={16} aria-hidden="true" color="var(--action-red)" /><span>Cine activo: <strong>{activeBranch?.name}</strong> — {activeBranch?.city}</span></>}
        </div>
        {isAdminCentral && !isGlobal && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setCinema('all')}>← Ver todos los cines</button>}
      </div>

      <QueryGate query={query} what="el resumen" />

      {mine && (
        <>
          <p className="sr-only" role="status">Resumen actualizado.</p>
          <ul className="sl-kpis" aria-label="Indicadores de hoy">
            {kpis.map((k) => {
              const Icon = k.icon;
              return (
                <li key={k.label} className="card sl-kpi">
                  <div className="kpi-icon" style={{ background: 'var(--surface-3)', color: 'var(--text-main)', margin: '0 auto 8px' }}><Icon size={18} aria-hidden="true" /></div>
                  <div className="sl-kpi-value">{k.value}</div>
                  <div className="sl-kpi-label">{k.label}</div>
                  {k.note && <div className="sl-kpi-note">{k.note}</div>}
                </li>
              );
            })}
            <li className="card sl-kpi">
              <div className="sl-kpi-value">{enabledMovies.filter((m) => m.status === 'active').length}</div>
              <div className="sl-kpi-label">Películas en cartelera</div>
            </li>
          </ul>

          <section aria-labelledby="dash-today">
            <h2 id="dash-today">Funciones de hoy</h2>
            {mine.screenings.list.length === 0
              ? <div className="sl-empty"><p><strong>No hay funciones programadas para hoy.</strong></p></div>
              : <ScreeningsTable caption="Funciones de hoy, con butacas vendidas" list={mine.screenings.list} />}
          </section>

          <section aria-labelledby="dash-next">
            <h2 id="dash-next">Próximas funciones</h2>
            {mine.screenings.upcoming.length === 0
              ? <div className="sl-empty"><p><strong>No hay funciones programadas de mañana en adelante (próximos 7 días).</strong></p></div>
              : <ScreeningsTable caption="Próximas funciones, de mañana en adelante (hasta 7 días)" list={mine.screenings.upcoming} showDay />}
          </section>

          {mine.activity && (
            <section aria-labelledby="dash-act" className="card">
              <h2 id="dash-act">Últimas acciones del panel</h2>
              {mine.activity.length === 0 ? <p className="sl-note">Todavía no hay acciones registradas.</p> : (
                <ul className="sl-activity">
                  {mine.activity.map((a) => (
                    <li key={a.id}>{ACTION_LABELS[a.action] ?? a.action}{a.actorName ? ` · ${a.actorName}` : ''}<time dateTime={new Date(a.at).toISOString()}>{when(a.at)}</time></li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {isAdminCentral && isGlobal && (
            <section aria-labelledby="dash-branches">
              <div className="flex-between mb-4">
                <h2 id="dash-branches" style={{ margin: 0 }}>Cines y sucursales</h2>
                <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/cinema')}>Gestionar cines <ArrowRight size={13} aria-hidden="true" /></button>
              </div>
              <ul className="sl-kpis" style={{ marginBottom: 0 }}>
                {branches.map((b) => (
                  <li key={b.id} className="card sl-kpi" style={{ textAlign: 'left' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}><Building2 size={16} aria-hidden="true" /><strong>{b.name}</strong></div>
                    <div className="sl-kpi-note">{b.city} · {b.status === 'active' ? 'Activo' : 'En mantenimiento'}</div>
                    <button type="button" className="btn btn-secondary btn-sm" style={{ marginTop: 10 }} onClick={() => setCinema(b.id)}>Ver {b.name}</button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="dash-quick" className="card">
            <h2 id="dash-quick">Accesos rápidos</h2>
            <div className="mv-actions">
              {can('create_movie') && <button type="button" className="btn btn-primary btn-sm" onClick={() => navigate('/movies')}><Plus size={14} aria-hidden="true" /> Agregar película</button>}
              {can('create_screening') && <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/scheduling')}><Plus size={14} aria-hidden="true" /> Programar función</button>}
              {(can('view_global_reports') || can('view_local_reports')) && <button type="button" className="btn btn-secondary btn-sm" onClick={() => navigate('/reports')}><ArrowRight size={14} aria-hidden="true" /> Ver reportes</button>}
            </div>
          </section>
        </>
      )}
    </div>
  );
}
