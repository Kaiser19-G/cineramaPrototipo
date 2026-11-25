import { useState } from 'react';
import { Search, Download, AlertCircle, CheckCircle, Clock, XCircle, RotateCcw } from 'lucide-react';
import { useCinema } from '../context/CinemaContext';

const statusConfig = {
  approved: { label: 'Aprobado',   cls: 'badge-green',  icon: CheckCircle },
  rejected: { label: 'Rechazado',  cls: 'badge-red',    icon: XCircle },
  refunded: { label: 'Reembolsado',cls: 'badge-orange', icon: RotateCcw },
  pending:  { label: 'Pendiente',  cls: 'badge-muted',  icon: Clock },
};
const methodLabel = { credit_card: 'Tarjeta de Crédito', debit_card: 'Tarjeta de Débito', cash: 'Efectivo', mobile_pay: 'Pago Móvil / Yape' };
const methodBadge = { credit_card: 'badge-blue', debit_card: 'badge-purple', cash: 'badge-muted', mobile_pay: 'badge-green' };
const tabs = ['Transacciones', 'Pagos Fallidos', 'Reembolsos', 'Registros del Sistema'];

export default function Payments() {
  const { activeOrders } = useCinema();
  const [activeTab, setActiveTab] = useState('Transacciones');
  const [search, setSearch] = useState('');

  const totalRevenue = activeOrders.filter(o => o.status === 'approved').reduce((s, o) => s + o.amount, 0);
  const totalRefunded = activeOrders.filter(o => o.status === 'refunded').reduce((s, o) => s + o.amount, 0);
  const totalFailed = activeOrders.filter(o => o.status === 'rejected').length;

  const filtered = activeOrders.filter(o =>
    o.id.toLowerCase().includes(search.toLowerCase()) ||
    o.customer.toLowerCase().includes(search.toLowerCase())
  );

  const kpis = [
    { label: 'Ingresos Totales', value: `$${totalRevenue.toLocaleString()}`, color: 'var(--emerald)' },
    { label: 'Reembolsado', value: `$${totalRefunded}`, color: 'var(--cinema-gold)' },
    { label: 'Pagos Fallidos', value: totalFailed, color: 'var(--action-red)' },
    { label: 'Transacciones', value: activeOrders.length, color: 'var(--electric-blue)' },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Pagos</h1>
          <p className="page-subtitle">Rastrea todas las transacciones financieras y eventos de pago</p>
        </div>
        <button className="btn btn-secondary"><Download size={15} /> Exportar</button>
      </div>

      <div className="grid-4 mb-6">
        {kpis.map((k, i) => (
          <div key={i} className="card" style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: k.color, marginBottom: 4 }}>{k.value}</div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{k.label}</div>
          </div>
        ))}
      </div>

      <div className="tabs mb-4">
        {tabs.map(t => (
          <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>
            {t}
            {t === 'Pagos Fallidos' && <span className="badge badge-red" style={{ marginLeft: 6 }}>{totalFailed}</span>}
          </button>
        ))}
      </div>

      {(activeTab === 'Transacciones' || activeTab === 'Pagos Fallidos' || activeTab === 'Reembolsos') && (
        <>
          <div className="flex-center gap-12 mb-4">
            <div className="search-bar" style={{ maxWidth: 360, flex: 1 }}>
              <Search size={15} color="var(--text-muted)" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Buscar transacciones..." />
            </div>
          </div>
          <div className="table-wrapper card" style={{ padding: 0 }}>
            <table className="table">
              <thead>
                <tr><th>ID Transacción</th><th>Película</th><th>Cliente</th><th>Sede</th><th>Método</th><th>Monto</th><th>Estado</th><th>Fecha y Hora</th></tr>
              </thead>
              <tbody>
                {filtered
                  .filter(o => activeTab === 'Pagos Fallidos' ? o.status === 'rejected'
                    : activeTab === 'Reembolsos' ? o.status === 'refunded'
                    : true)
                  .map(o => {
                    const cfg = statusConfig[o.status] || statusConfig.pending;
                    const Icon = cfg.icon;
                    return (
                      <tr key={o.id}>
                        <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{o.id}</td>
                        <td style={{ fontWeight: 600 }}>{o.movieTitle}</td>
                        <td>{o.customer}</td>
                        <td style={{ fontSize: 13 }}>{o.branch}</td>
                        <td><span className={`badge ${methodBadge[o.method]}`}>{methodLabel[o.method]}</span></td>
                        <td style={{ color: 'var(--cinema-gold)', fontWeight: 700 }}>${o.amount}</td>
                        <td>
                          <span className={`badge ${cfg.cls}`} style={{ display: 'inline-flex', gap: 4 }}>
                            <Icon size={10} />{cfg.label}
                          </span>
                        </td>
                        <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{o.date}</td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
          {activeTab === 'Transacciones' && (
            <div style={{ display: 'flex', justifyContent: 'space-between', padding: '14px 20px', background: 'var(--surface-2)', borderRadius: '0 0 10px 10px', borderTop: '1px solid var(--border)', marginTop: -1 }}>
              <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>Ingresos Totales (Período Seleccionado)</span>
              <span style={{ fontWeight: 900, fontSize: 18, color: 'var(--cinema-gold)' }}>${totalRevenue.toLocaleString()}</span>
            </div>
          )}
        </>
      )}

      {activeTab === 'Registros del Sistema' && (
        <div className="card">
          <div className="section-title mb-4">Registros de Pago del Sistema</div>
          {activeOrders.map((o, i) => (
            <div key={o.id} style={{ padding: '12px 0', borderBottom: '1px solid var(--border-subtle)', fontFamily: 'monospace', fontSize: 12, color: 'var(--text-secondary)' }}>
              <span style={{ color: 'var(--text-muted)' }}>[{o.date}]</span>{' '}
              <span style={{ color: o.status === 'approved' ? 'var(--emerald)' : o.status === 'rejected' ? 'var(--action-red)' : 'var(--cinema-gold)' }}>
                {o.status.toUpperCase()}
              </span>{' '}
              {o.id} — {o.movieTitle} — {o.customer} — ${o.amount} vía {methodLabel[o.method]}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
