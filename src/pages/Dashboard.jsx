import {
  DollarSign, Ticket, Clapperboard, Building2,
  Users, AlertCircle, TrendingUp, TrendingDown,
  CheckCircle, AlertTriangle, Info, Plus, ArrowRight, Globe, MapPin,
} from 'lucide-react';
import {
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import { revenueByDay, genreData } from '../data/store';
import { useCinema } from '../context/CinemaContext';
import './Dashboard.css';

const levelColor = {
  error:   'var(--action-red)',
  warning: 'var(--intense-orange)',
  success: 'var(--emerald)',
  info:    'var(--electric-blue)',
};
const levelIcon = { error: AlertCircle, warning: AlertTriangle, success: CheckCircle, info: Info };

const ChartTooltip = ({ active, payload, label }) => {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 14px' }}>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 4 }}>{label}</p>
      <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-primary)' }}>
        {typeof payload[0].value === 'number' && payload[0].name !== 'Ocupación'
          ? `$${payload[0].value.toLocaleString()}`
          : `${payload[0].value}%`}
      </p>
    </div>
  );
};

export default function Dashboard() {
  const navigate = useNavigate();
  const {
    isGlobal, activeBranch, isAdminCentral,
    kpiRevenue, kpiTickets, kpiFailed, kpiScreenings, kpiOccupancy,
    activeAlerts, activeActivity,
    enabledMovies, branches, setCinema,
  } = useCinema();

  const kpis = [
    { label: 'Ingresos del Día',   value: `$${kpiRevenue.toLocaleString()}`, icon: DollarSign,   color: 'var(--cinema-gold)',   bg: 'var(--cinema-gold-dim)',   change: '+18%', pos: true  },
    { label: 'Tickets Vendidos',   value: kpiTickets,                         icon: Ticket,       color: 'var(--action-red)',    bg: 'var(--action-red-dim)',    change: '+12%', pos: true  },
    { label: 'Funciones Activas',  value: kpiScreenings,                      icon: Clapperboard, color: 'var(--electric-blue)', bg: 'var(--electric-blue-dim)', change: null,   pos: true  },
    { label: 'Películas en Cartelera', value: enabledMovies.filter(m=>m.status==='active').length, icon: Film2, color: 'var(--violet)', bg: 'var(--violet-dim)', change: null, pos: true },
    { label: 'Ocupación Promedio', value: `${kpiOccupancy}%`,                 icon: Users,        color: 'var(--emerald)',        bg: 'var(--emerald-dim)',       change: '+5%',  pos: true  },
    { label: 'Pagos Fallidos',     value: kpiFailed,                          icon: AlertCircle,  color: 'var(--intense-orange)',bg: 'var(--intense-orange-dim)',change: null,   pos: false },
  ];

  // Revenue series key for chart
  const revenueKey = isGlobal ? 'revenue'
    : activeBranch?.name === 'Cinerama Centro' ? 'centro'
    : activeBranch?.name === 'Complejo Mall'   ? 'mall'
    : 'suburbia';

  return (
    <div className="dashboard">

      {/* ── Contexto activo ─────────────────────────────────────────────── */}
      <div className="context-banner">
        <div className="context-banner-left">
          {isGlobal
            ? <><Globe size={16} color="var(--electric-blue)" /><span>Vista Global — Todos los Cines</span></>
            : <><MapPin size={16} color="var(--action-red)" /><span>Cine Activo: <strong>{activeBranch?.name}</strong> — {activeBranch?.city}</span></>}
        </div>
        {isAdminCentral && !isGlobal && (
          <button className="btn btn-ghost btn-sm" onClick={() => setCinema('all')}>
            ← Ver todos los cines
          </button>
        )}
      </div>

      {/* ── KPIs ─────────────────────────────────────────────────────────── */}
      <div className="kpi-grid">
        {kpis.map((k, i) => {
          const Icon = k.icon || AlertCircle;
          return (
            <div key={i} className="kpi-card card">
              <div className="kpi-top">
                <div className="kpi-icon" style={{ background: k.bg, color: k.color }}>
                  <Icon size={18} />
                </div>
                {k.change && (
                  <span className={`kpi-change ${k.pos ? 'pos' : 'neg'}`}>
                    {k.pos ? <TrendingUp size={11} /> : <TrendingDown size={11} />} {k.change}
                  </span>
                )}
              </div>
              <div className="kpi-value">{k.value}</div>
              <div className="kpi-label">{k.label}</div>
              <div className="stat-bar" style={{ background: k.bg }}>
                <div style={{ width: '60%', height: '100%', background: k.color, borderRadius: 99 }} />
              </div>
            </div>
          );
        })}
      </div>

      {/* ── Admin Central: Cards de cada Cine ─────────────────────────── */}
      {isGlobal && isAdminCentral && (
        <div>
          <div className="flex-between mb-4">
            <div className="section-title">Cines & Sucursales</div>
            <button className="btn btn-secondary btn-sm" onClick={() => navigate('/cinema')}>
              Gestionar Cines <ArrowRight size={13} />
            </button>
          </div>
          <div className="grid-4">
            {branches.map(b => (
              <div key={b.id} className="card branch-card" onClick={() => setCinema(b.id)} style={{ cursor: 'pointer' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 10 }}>
                  <div style={{ width: 40, height: 40, background: b.status === 'maintenance' ? 'var(--intense-orange-dim)' : 'var(--action-red-dim)', borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Building2 size={18} color={b.status === 'maintenance' ? 'var(--intense-orange)' : 'var(--action-red)'} />
                  </div>
                  <span className={`badge ${b.status === 'active' ? 'badge-green' : 'badge-orange'}`}>
                    {b.status === 'active' ? 'Activo' : 'Mantenimiento'}
                  </span>
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 2 }}>{b.name}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>{b.city}</div>
                <div style={{ fontSize: 12, color: 'var(--text-secondary)' }}>{b.halls} salas · Ger: {b.manager.split(' ')[0]}</div>
                <div className="branch-card-arrow"><ArrowRight size={14} /></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Gráficos ──────────────────────────────────────────────────── */}
      <div className="charts-row">
        <div className="card chart-main">
          <div className="flex-between mb-4">
            <div>
              <div className="section-title" style={{ marginBottom: 2 }}>Ingresos Semanales</div>
              <div className="text-muted">{isGlobal ? 'Todos los cines' : activeBranch?.name}</div>
            </div>
            <span className="badge badge-green">+18% vs semana anterior</span>
          </div>
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={revenueByDay}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fill: 'var(--text-muted)', fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: 'var(--text-muted)', fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={v => `$${(v/1000).toFixed(0)}k`} />
              <Tooltip content={<ChartTooltip />} />
              <Line type="monotone" dataKey={revenueKey} name="Ingresos"
                stroke="var(--action-red)" strokeWidth={2.5}
                dot={{ fill: 'var(--action-red)', r: 4, strokeWidth: 0 }}
                activeDot={{ r: 6, fill: 'var(--action-red)', stroke: 'var(--action-red-dim)', strokeWidth: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>

        <div className="card chart-side">
          <div className="section-title mb-4">Películas por Género</div>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={genreData} cx="50%" cy="50%" innerRadius={48} outerRadius={78} dataKey="value" paddingAngle={3}>
                {genreData.map((g, i) => <Cell key={i} fill={g.color} />)}
              </Pie>
              <Tooltip formatter={v => `${v}%`} contentStyle={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8 }} />
            </PieChart>
          </ResponsiveContainer>
          <div className="genre-legend">
            {genreData.map((g, i) => (
              <div key={i} className="genre-legend-item">
                <span className="genre-dot" style={{ background: g.color }} />
                <span>{g.name}</span>
                <span>{g.value}%</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Fila inferior ────────────────────────────────────────────────── */}
      <div className="bottom-row">
        {/* Actividad */}
        <div className="card activity-card">
          <div className="flex-between mb-4">
            <div className="section-title" style={{ marginBottom: 0 }}>Actividad Reciente</div>
            <button className="btn btn-ghost btn-sm">Ver todo</button>
          </div>
          <div className="activity-list">
            {activeActivity.map(a => {
              const Icon = levelIcon[a.level] || Info;
              return (
                <div key={a.id} className="activity-item">
                  <div className="activity-icon" style={{ background: `${levelColor[a.level]}22`, color: levelColor[a.level] }}>
                    <Icon size={13} />
                  </div>
                  <div className="activity-content">
                    <p className="activity-msg">{a.message}</p>
                    <p className="activity-time">{a.time}</p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Alertas + Accesos */}
        <div className="card alerts-card">
          <div className="flex-between mb-4">
            <div className="section-title" style={{ marginBottom: 0 }}>
              Alertas
              <span className="badge badge-red" style={{ marginLeft: 8 }}>{activeAlerts.length}</span>
            </div>
          </div>
          <div className="alerts-list">
            {activeAlerts.map(a => {
              const Icon = levelIcon[a.level] || Info;
              return (
                <div key={a.id} className={`alert-item alert-${a.level}`}>
                  <Icon size={14} style={{ flexShrink: 0, marginTop: 1 }} />
                  <p>{a.message}</p>
                </div>
              );
            })}
          </div>
          <div className="divider" />
          <div className="quick-actions">
            <p className="section-title" style={{ fontSize: 13, marginBottom: 10 }}>Accesos Rápidos</p>
            {isAdminCentral && (
              <button className="btn btn-primary btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={() => navigate('/movies')}>
                <Plus size={14} /> Agregar Película
              </button>
            )}
            <button className="btn btn-secondary btn-sm" style={{ width: '100%', marginBottom: 8 }} onClick={() => navigate('/scheduling')}>
              <Plus size={14} /> Programar Función
            </button>
            <button className="btn btn-secondary btn-sm" style={{ width: '100%' }} onClick={() => navigate('/reports')}>
              <ArrowRight size={14} /> Ver Reportes
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Helper interno (evita import)
function Film2({ size, ...props }) {
  return (
    <svg {...props} width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>
    </svg>
  );
}
