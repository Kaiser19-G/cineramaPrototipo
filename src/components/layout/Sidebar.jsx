import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Film, Building2, CalendarDays, Ticket,
  CreditCard, Users, BarChart3, Settings, Lock, ShieldCheck, Popcorn,
} from 'lucide-react';
import { useCinema } from '../../context/CinemaContext';
import { useAuth } from '../../context/AuthContext';
import { SALES_PERMS, REPORT_PERMS, MENU_PERMS, hasAnyPerm } from '../../shared/permissions';
import './Sidebar.css';

// Nav para Admin Central (acceso global)
const navAdmin = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Resumen Global' },
  { to: '/cinema',      icon: Building2,        label: 'Gestión de Cines' },
  { to: '/movies',      icon: Film,             label: 'Catálogo de Películas' },
  { to: '/scheduling',  icon: CalendarDays,     label: 'Programación Global' },
  { to: '/tickets',     icon: Ticket,           label: 'Taquilla' },
  { to: '/confiteria',        icon: Popcorn,          label: 'Confitería', any: MENU_PERMS },
  { to: '/payments',    icon: CreditCard,       label: 'Pagos', any: SALES_PERMS },
  { to: '/users',       icon: Users,            label: 'Usuarios y Accesos' },
  { to: '/claims',      icon: ShieldCheck,      label: 'Reclamos de DNI' },
  { to: '/reports',     icon: BarChart3,        label: 'Reportes Globales', any: REPORT_PERMS },
  { to: '/settings',    icon: Settings,         label: 'Configuración' },
];

// Nav para Admin Local (solo su cine)
const navLocal = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scheduling', icon: CalendarDays,    label: 'Mis Funciones' },
  { to: '/movies',     icon: Film,            label: 'Películas del Cine' },
  { to: '/tickets',    icon: Ticket,          label: 'Taquilla' },
  { to: '/confiteria',       icon: Popcorn,         label: 'Confitería', any: MENU_PERMS },
  { to: '/payments',   icon: CreditCard,      label: 'Ventas Locales', any: SALES_PERMS },
  { to: '/reports',    icon: BarChart3,       label: 'Reportes Locales', any: REPORT_PERMS },
];

// Items bloqueados para Admin Local (muestra el candado pero no navega)
const navBlocked = [
  { icon: Building2, label: 'Gestión de Cines' },
  { icon: Users,     label: 'Usuarios Globales' },
  { icon: Settings,  label: 'Configuración Global' },
];

export default function Sidebar({ open, phone = false, sidebarId, onNavigate }) {
  const { isAdminCentral } = useCinema();
  const { user } = useAuth();
  // Solo se listan las pantallas que el rol puede abrir (el servidor aplica los mismos permisos).
  const nav = (isAdminCentral ? navAdmin : navLocal).filter((i) => !i.any || hasAnyPerm(user, i.any));

  // Teléfono (capa superpuesta abierta): Tab y Mayús+Tab no salen del menú.
  const atraparTab = (e) => {
    if (e.key !== 'Tab') return;
    const f = [...e.currentTarget.querySelectorAll('a[href]')];
    if (!f.length) return;
    if (e.shiftKey && document.activeElement === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && document.activeElement === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  };

  return (
    <aside id={sidebarId} className={`sidebar ${open ? 'open' : 'collapsed'}${phone ? ' phone' : ''}`} aria-label="Menú lateral" onKeyDown={phone && open ? atraparTab : undefined}>
      <div className="sidebar-brand">
        <div className="brand-logo">C</div>
        {open && (
          <div>
            <div className="brand-name">Cinerama</div>
            <div className="brand-tag">
              {isAdminCentral ? 'Admin Central' : 'Cine Local'}
            </div>
          </div>
        )}
      </div>

      <nav className="sidebar-nav" aria-label="Navegación principal">
        {/* Sección principal */}
        {open && (
          <div className="nav-section-label">
            {isAdminCentral ? 'Administración Global' : 'Mi Cine'}
          </div>
        )}
        {nav.map(({ to, icon: Icon, label }) => (
          <NavLink
            key={to}
            to={to}
            aria-label={label}
            onClick={onNavigate}
            className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}
          >
            <Icon size={18} />
            {open && <span>{label}</span>}
          </NavLink>
        ))}

        {/* Items bloqueados para admin local */}
        {!isAdminCentral && (
          <>
            {open && <div className="nav-section-label" style={{ marginTop: 12 }}>Acceso Restringido</div>}
            {navBlocked.map(({ icon: Icon, label }) => (
              <div key={label} className="nav-item nav-item-locked" title="Requiere Admin Central" aria-disabled="true">
                <Icon size={18} />
                {open && <span>{label}</span>}
                {open && <Lock size={11} style={{ marginLeft: 'auto', color: 'var(--text-muted)' }} />}
              </div>
            ))}
          </>
        )}
      </nav>

      <div className="sidebar-footer">
        {open && <p className="sidebar-version">Cinema OS v2.0</p>}
      </div>
    </aside>
  );
}
