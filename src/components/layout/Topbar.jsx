import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, Search, Bell, ChevronDown, X, AlertTriangle, CheckCircle, Info, AlertCircle, Globe, MapPin, Lock, LogOut, Settings, User } from 'lucide-react';
import { useCinema } from '../../context/CinemaContext';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../shared/permissions';
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
  const { logout } = useAuth();
  const userMenuRef = useRef(null);
  const userBtnRef = useRef(null);

  // El menú de usuario se cierra con Escape (devolviendo el foco al botón) o al hacer clic fuera.
  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setUserMenuOpen(false); userBtnRef.current?.focus(); } };
    const onDown = (e) => { if (!userMenuRef.current?.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [userMenuOpen]);

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    navigate('/web/login', { replace: true, state: { loggedOut: true } });
  };

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

        <div className="topbar-user" ref={userMenuRef}>
          <button
            type="button" className="topbar-user-btn" ref={userBtnRef}
            aria-haspopup="menu" aria-expanded={userMenuOpen}
            onClick={() => setUserMenuOpen(o => !o)}
          >
            <span className="avatar avatar-sm" aria-hidden="true">{currentUser.avatar}</span>
            <span className="topbar-user-info">
              <span className="topbar-username">{currentUser.name}</span>
              <span className="topbar-role">{ROLE_LABELS[currentUser.role] || currentUser.role}</span>
            </span>
            <ChevronDown size={14} aria-hidden="true" color="var(--text-muted)" style={{ transition: 'transform 0.2s', transform: userMenuOpen ? 'rotate(180deg)' : 'rotate(0deg)' }} />
          </button>

          {userMenuOpen && (
            <div className="user-dropdown-menu" role="menu">
              {isAdminCentral && (
                <>
                  <button type="button" role="menuitem" className="user-dropdown-item" onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}>
                    <User size={16} aria-hidden="true" />
                    <span>Mi Perfil</span>
                  </button>
                  <button type="button" role="menuitem" className="user-dropdown-item" onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}>
                    <Settings size={16} aria-hidden="true" />
                    <span>Configuración</span>
                  </button>
                  <div className="dropdown-divider"></div>
                </>
              )}
              <button type="button" role="menuitem" className="user-dropdown-item logout-item" onClick={handleLogout}>
                <LogOut size={16} aria-hidden="true" />
                <span>Cerrar Sesión</span>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
