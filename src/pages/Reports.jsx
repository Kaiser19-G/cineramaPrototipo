import { useState } from 'react';
import { Download, TrendingUp } from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from 'recharts';
import { revenueByDay, genreData, occupancyByHall, movies, orders } from '../data/store';

const tabs = ['Ingresos', 'Ocupación', 'Películas', 'Pagos', 'Rendimiento'];

const topMovies = movies.map(m => ({ name: m.title.split(':')[0], tickets: Math.floor(Math.random() * 600) + 100 })).sort((a, b) => b.tickets - a.tickets).slice(0, 6);
const paymentMethods = [
  { name: 'Tarjeta de Crédito', value: 52, color: 'var(--electric-blue)' },
  { name: 'Tarjeta de Débito',  value: 28, color: 'var(--violet)' },
  { name: 'Pago Móvil',         value: 14, color: 'var(--emerald)' },
  { name: 'Efectivo',           value: 6,  color: 'var(--text-muted)' },
];
const monthlyData = [
  { month: 'Ene', revenue: 92000, tickets: 4200 },
  { month: 'Feb', revenue: 84000, tickets: 3800 },
  { month: 'Mar', revenue: 110000, tickets: 5100 },
  { month: 'Abr', revenue: 128000, tickets: 5900 },
  { month: 'May', revenue: 145000, tickets: 6700 },
];

const CustomTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px', fontSize: 13 }}>
      <p style={{ color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      {payload.map((p, i) => <p key={i} style={{ color: p.color, fontWeight: 700 }}>{p.name}: {typeof p.value === 'number' && p.name?.includes('Ingresos') ? `$${p.value.toLocaleString()}` : p.value}</p>)}
    </div>
  );
};

export default function Reports() {
  const [activeTab, setActiveTab] = useState('Ingresos');
  const totalRevenue = orders.filter(o => o.status === 'approved').reduce((s, o) => s + o.amount, 0);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-title">Reportes y Análisis</h1>
          <p className="page-subtitle">Inteligencia de negocios y métricas de rendimiento</p>
        </div>
        <div className="flex gap-8">
          <button className="btn btn-secondary"><Download size={15} /> Exportar PDF</button>
          <button className="btn btn-secondary"><Download size={15} /> Exportar CSV</button>
        </div>
      </div>

      <div className="tabs mb-6">
        {tabs.map(t => <button key={t} className={`tab ${activeTab === t ? 'active' : ''}`} onClick={() => setActiveTab(t)}>{t}</button>)}
      </div>

      {activeTab === 'Ingresos' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="grid-4">
            {[
              { label: 'Ingresos Mayo', value: '$145,000', color: 'var(--emerald)' },
              { label: 'Total Anual', value: '$559,000', color: 'var(--cinema-gold)' },
              { label: 'Promedio Diario', value: '$4,833', color: 'var(--electric-blue)' },
              { label: 'Crecimiento vs Abr', value: '+13%', color: 'var(--action-red)' },
            ].map((k, i) => (
              <div key={i} className="card" style={{ textAlign: 'center' }}>
                <div style={{ fontSize: 24, fontWeight: 900, color: k.color, marginBottom: 4 }}>{k.value}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>{k.label}</div>
              </div>
            ))}
          </div>
          <div className="grid-2">
            <div className="card">
              <div className="section-title mb-4">Tendencia Semanal de Ingresos</div>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={revenueByDay}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Line type="monotone" dataKey="revenue" name="Ingresos" stroke="var(--action-red)" strokeWidth={2.5} dot={{ fill: 'var(--action-red)', r: 4 }} />
                </LineChart>
              </ResponsiveContainer>
            </div>
            <div className="card">
              <div className="section-title mb-4">Ingresos y Tickets Mensuales</div>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={monthlyData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                  <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
                  <Tooltip content={<CustomTooltip />} />
                  <Bar dataKey="revenue" name="Ingresos" fill="var(--action-red)" radius={[4,4,0,0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
      )}

      {activeTab === 'Ocupación' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          <div className="card">
            <div className="section-title mb-4">Tasa de Ocupación por Sala</div>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={occupancyByHall}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hall" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
                <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
                <Tooltip formatter={v => [`${v}%`, 'Ocupación']} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
                <Bar dataKey="occupancy" name="Ocupación" radius={[6,6,0,0]}>
                  {occupancyByHall.map((h, i) => <Cell key={i} fill={h.occupancy > 80 ? 'var(--action-red)' : h.occupancy === 0 ? 'var(--border)' : 'var(--electric-blue)'} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {activeTab === 'Películas' && (
        <div className="card">
          <div className="section-title mb-4">Top Películas por Tickets Vendidos</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {topMovies.map((m, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <span style={{ width: 22, textAlign: 'right', color: i < 3 ? 'var(--cinema-gold)' : 'var(--text-muted)', fontWeight: 700, fontSize: 13 }}>#{i+1}</span>
                <span style={{ flex: 1, fontSize: 14, fontWeight: 600 }}>{m.name}</span>
                <div className="progress" style={{ width: 200 }}>
                  <div className="progress-fill" style={{ width: `${(m.tickets / topMovies[0].tickets) * 100}%`, background: i === 0 ? 'var(--cinema-gold)' : 'var(--action-red)' }} />
                </div>
                <span style={{ color: 'var(--text-secondary)', fontSize: 13, fontWeight: 600, width: 60, textAlign: 'right' }}>{m.tickets}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Pagos' && (
        <div className="grid-2">
          <div className="card">
            <div className="section-title mb-4">Distribución de Métodos de Pago</div>
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={paymentMethods} cx="50%" cy="50%" outerRadius={85} innerRadius={50} dataKey="value" paddingAngle={3}>
                  {paymentMethods.map((p, i) => <Cell key={i} fill={p.color} />)}
                </Pie>
                <Tooltip formatter={v => `${v}%`} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
              </PieChart>
            </ResponsiveContainer>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {paymentMethods.map(p => (
                <div key={p.name} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 2, background: p.color }} />
                  <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{p.name}</span>
                  <span style={{ fontWeight: 700 }}>{p.value}%</span>
                </div>
              ))}
            </div>
          </div>
          <div className="card">
            <div className="section-title mb-4">Resumen de Transacciones</div>
            {[
              { label: 'Transacciones Totales', value: orders.length },
              { label: 'Aprobadas', value: orders.filter(o => o.status === 'approved').length, color: 'var(--emerald)' },
              { label: 'Rechazadas', value: orders.filter(o => o.status === 'rejected').length, color: 'var(--action-red)' },
              { label: 'Reembolsadas', value: orders.filter(o => o.status === 'refunded').length, color: 'var(--intense-orange)' },
              { label: 'Tasa de Aprobación', value: `${Math.round((orders.filter(o => o.status === 'approved').length / orders.length) * 100)}%`, color: 'var(--emerald)' },
            ].map((s, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid var(--border-subtle)', fontSize: 14 }}>
                <span style={{ color: 'var(--text-secondary)' }}>{s.label}</span>
                <span style={{ fontWeight: 700, color: s.color || 'var(--text-primary)' }}>{s.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {activeTab === 'Rendimiento' && (
        <div className="grid-2">
          {[
            { label: 'Horas Pico', items: [{ time: '20:00-22:00', pct: 94 }, { time: '18:00-20:00', pct: 81 }, { time: '16:00-18:00', pct: 67 }, { time: '14:00-16:00', pct: 55 }] },
            { label: 'Ingresos por Sede', items: [{ time: 'Centro Cinerama', pct: 42 }, { time: 'Complejo Mall', pct: 30 }, { time: 'IMAX Premium', pct: 18 }, { time: 'Cine Suburbia', pct: 10 }] },
          ].map(section => (
            <div key={section.label} className="card">
              <div className="section-title mb-4">{section.label}</div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                {section.items.map((item, i) => (
                  <div key={i}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4, fontSize: 13 }}>
                      <span style={{ color: 'var(--text-secondary)' }}>{item.time}</span>
                      <span style={{ fontWeight: 700 }}>{item.pct}%</span>
                    </div>
                    <div className="progress">
                      <div className="progress-fill" style={{ width: `${item.pct}%`, background: item.pct > 80 ? 'var(--action-red)' : 'var(--electric-blue)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
