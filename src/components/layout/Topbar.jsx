import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Bell, ChevronDown, X, AlertTriangle, CheckCircle, Info, AlertCircle, Globe, MapPin, Lock, LogOut, Settings, User } from 'lucide-react';
import { useCinema } from '../../context/CinemaContext';
import './Topbar.css';

const levelIcon  = { error: AlertCircle, warning: AlertTriangle, success: CheckCircle, info: Info };
const levelColor = { error: 'var(--action-red)', warning: 'var(--intense-orange)', success: 'var(--emerald)', info: 'var(--electric-blue)' };

export default function Topbar({ onMenuToggle, onNotifToggle, notifOpen, onNotifClose }) {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const {
    currentCinemaId, setCinema, activeBranch, isGlobal,
    isAdminCentral, currentUser, branches,
    activeAlerts, activeActivity,
  } = useCinema();

  const unread = activeAlerts.filter(a => a.level === 'error').length;

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="btn btn-ghost btn-icon" onClick={onMenuToggle} id="menu-toggle">
          <Menu size={18} />
        </button>

        {/* ── Selector de Cine (Cinema Context) ── */}
        <div className="cinema-selector">
          {isAdminCentral ? (
            <div className="cinema-select-wrap">
              <div className={`cinema-select-icon ${isGlobal ? 'global' : 'local'}`}>
                {isGlobal ? <Globe size={14} /> : <MapPin size={14} />}
              </div>
              <select
                className="cinema-select"
                value={currentCinemaId}
                onChange={e => setCinema(e.target.value === 'all' ? 'all' : Number(e.target.value))}
              >
                <option value="all">Todos los Cines</option>
                {branches.map(b => (
                  <option key={b.id} value={b.id}>{b.name}</option>
                ))}
              </select>
              <ChevronDown size={12} style={{ color: 'var(--text-muted)', pointerEvents: 'none' }} />
            </div>
          ) : (
            // Admin Local: selector bloqueado
            <div className="cinema-select-locked">
              <MapPin size={13} color="var(--action-red)" />
              <span>{activeBranch?.name || 'Mi Cine'}</span>
              <Lock size={11} color="var(--text-muted)" />
            </div>
          )}
        </div>

        <div className="search-bar" style={{ width: 260 }}>
          <Search size={15} color="var(--text-muted)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar funciones, películas, salas..."
          />
        </div>
      </div>

      <div className="topbar-right">
        <div className="notif-wrap">
          <button
            className="btn btn-ghost btn-icon"
            onClick={onNotifToggle}
            id="notif-btn"
            style={{ position: 'relative' }}
          >
            <Bell size={18} />
            {unread > 0 && <span className="notif-badge">{unread}</span>}
          </button>

          {notifOpen && (
            <div className="notif-panel">
              <div className="notif-panel-header">
                <span className="font-bold" style={{ fontSize: 14 }}>Notificaciones</span>
                <button className="icon-btn" onClick={onNotifClose}><X size={14} /></button>
              </div>
              <div className="notif-section-label">
                Alertas {!isGlobal && `— ${activeBranch?.name}`}
              </div>
              {activeAlerts.map(a => {
                const Icon = levelIcon[a.level] || Info;
                return (
                  <div key={a.id} className="notif-item">
                    <Icon size={14} color={levelColor[a.level]} style={{ flexShrink: 0 }} />
                    <p className="notif-msg">{a.message}</p>
                  </div>
                );
              })}
              <div className="notif-section-label" style={{ marginTop: 8 }}>Actividad Reciente</div>
              {activeActivity.slice(0, 4).map(a => {
                const Icon = levelIcon[a.level] || Info;
                return (
                  <div key={a.id} className="notif-item">
                    <Icon size={14} color={levelColor[a.level]} style={{ flexShrink: 0 }} />
                    <div>
                      <p className="notif-msg">{a.message}</p>
                      <p className="notif-time">{a.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        <div className="topbar-user" onClick={() => setUserMenuOpen(!userMenuOpen)} style={{ cursor: 'pointer', position: 'relative' }}>
          <div className="avatar avatar-sm">{currentUser.avatar}</div>
          <div className="topbar-user-info">
            <span className="topbar-username">{currentUser.name}</span>
            <span className="topbar-role">
              {currentUser.role === 'admin' ? 'Administrador Central' : 'Administrador Local'}
            </span>
          </div>
          <ChevronDown size={14} color="var(--text-muted)" style={{ transition: 'transform 0.2s', transform: userMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          
          {userMenuOpen && (
            <div className="user-dropdown-menu">
              <div className="user-dropdown-item" onClick={() => navigate('/settings')}>
                <User size={16} />
                <span>Mi Perfil</span>
              </div>
              <div className="user-dropdown-item" onClick={() => navigate('/settings')}>
                <Settings size={16} />
                <span>Configuración</span>
              </div>
              <div className="dropdown-divider"></div>
              <div 
                className="user-dropdown-item logout-item" 
                onClick={() => {
                  // Lógica de cerrar sesión (limpiar auth state si existiera)
                  navigate('/web/login');
                }}
              >
                <LogOut size={16} />
                <span>Cerrar Sesión</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
