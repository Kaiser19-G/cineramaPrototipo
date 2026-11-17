import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Menu, ChevronDown, Globe, MapPin, Lock, LogOut, Settings, User, KeyRound } from 'lucide-react';
import { useCinema } from '../../context/CinemaContext';
import { useAuth } from '../../context/AuthContext';
import { ROLE_LABELS } from '../../shared/permissions';
import './Topbar.css';

export default function Topbar({ onMenuToggle, menuOpen, menuControls }) {
  const navigate = useNavigate();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const {
    currentCinemaId, setCinema, activeBranch, isGlobal,
    isAdminCentral, currentUser, branches,
  } = useCinema();
  const { logout } = useAuth();
  const userMenuRef = useRef(null);
  const userBtnRef = useRef(null);
  const dropdownRef = useRef(null);

  const items = () => [...(dropdownRef.current?.querySelectorAll('[role="menuitem"]') ?? [])];

  // Al abrir el menú el foco pasa a su primer elemento (patrón de menú de botón de WAI-ARIA).
  useEffect(() => { if (userMenuOpen) items()[0]?.focus(); }, [userMenuOpen]);

  // El menú de usuario se cierra con Escape (devolviendo el foco al botón) o al hacer clic fuera.
  useEffect(() => {
    if (!userMenuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setUserMenuOpen(false); userBtnRef.current?.focus(); } };
    const onDown = (e) => { if (!userMenuRef.current?.contains(e.target)) setUserMenuOpen(false); };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onDown);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onDown); };
  }, [userMenuOpen]);

  // Flechas, Inicio y Fin recorren las opciones; Tab sale del menú y lo cierra.
  const onMenuKeyDown = (e) => {
    const list = items(); const i = list.indexOf(document.activeElement);
    const go = (n) => { e.preventDefault(); list[(n + list.length) % list.length]?.focus(); };
    if (e.key === 'ArrowDown') go(i + 1);
    else if (e.key === 'ArrowUp') go(i - 1);
    else if (e.key === 'Home') go(0);
    else if (e.key === 'End') go(list.length - 1);
    else if (e.key === 'Tab') setUserMenuOpen(false);
  };

  const handleLogout = async () => {
    setUserMenuOpen(false);
    await logout();
    navigate('/web/login', { replace: true, state: { loggedOut: true } });
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button
          type="button" className="btn btn-ghost btn-icon" onClick={onMenuToggle} id="menu-toggle"
          aria-label={menuOpen ? 'Plegar menú lateral' : 'Desplegar menú lateral'}
          aria-expanded={!!menuOpen} aria-controls={menuControls}
        >
          <Menu size={18} aria-hidden="true" />
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
                aria-label="Cine activo"
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

      </div>

      <div className="topbar-right">
        <div className="topbar-user" ref={userMenuRef}>
          <button
            type="button" className="topbar-user-btn" ref={userBtnRef}
            aria-haspopup="menu" aria-expanded={userMenuOpen}
            aria-label={`Menú de usuario: ${currentUser.name}`}
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
            <div className="user-dropdown-menu" role="menu" aria-label="Menú de usuario" ref={dropdownRef} onKeyDown={onMenuKeyDown}>
              <div className="user-dropdown-head" role="presentation">
                <span className="topbar-username">{currentUser.name}</span>
                <span className="topbar-role">{ROLE_LABELS[currentUser.role] || currentUser.role}</span>
              </div>
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
              <button type="button" role="menuitem" className="user-dropdown-item" onClick={() => { setUserMenuOpen(false); navigate('/account/password'); }}>
                <KeyRound size={16} aria-hidden="true" />
                <span>Cambiar contraseña</span>
              </button>
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
