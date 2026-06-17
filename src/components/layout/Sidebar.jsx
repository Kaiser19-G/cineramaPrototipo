import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard, Film, Building2, CalendarDays, Ticket,
  CreditCard, Users, BarChart3, Settings, Lock,
} from 'lucide-react';
import { useCinema } from '../../context/CinemaContext';
import './Sidebar.css';

// Nav para Admin Central (acceso global)
const navAdmin = [
  { to: '/dashboard',   icon: LayoutDashboard, label: 'Resumen Global' },
  { to: '/cinema',      icon: Building2,        label: 'Gestión de Cines' },
  { to: '/movies',      icon: Film,             label: 'Catálogo de Películas' },
  { to: '/scheduling',  icon: CalendarDays,     label: 'Programación Global' },
  { to: '/tickets',     icon: Ticket,           label: 'Taquilla' },
  { to: '/payments',    icon: CreditCard,       label: 'Pagos' },
  { to: '/users',       icon: Users,            label: 'Usuarios y Accesos' },
  { to: '/reports',     icon: BarChart3,        label: 'Reportes Globales' },
  { to: '/settings',    icon: Settings,         label: 'Configuración' },
];

// Nav para Admin Local (solo su cine)
const navLocal = [
  { to: '/dashboard',  icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/scheduling', icon: CalendarDays,    label: 'Mis Funciones' },
  { to: '/movies',     icon: Film,            label: 'Películas del Cine' },
  { to: '/tickets',    icon: Ticket,          label: 'Taquilla' },
  { to: '/payments',   icon: CreditCard,      label: 'Ventas Locales' },
  { to: '/reports',    icon: BarChart3,       label: 'Reportes Locales' },
];

// Items bloqueados para Admin Local (muestra el candado pero no navega)
const navBlocked = [
  { icon: Building2, label: 'Gestión de Cines' },
  { icon: Users,     label: 'Usuarios Globales' },
  { icon: Settings,  label: 'Configuración Global' },
];

export default function Sidebar({ open }) {
  const { isAdminCentral } = useCinema();
  const nav = isAdminCentral ? navAdmin : navLocal;

  return (
    <aside className={`sidebar ${open ? 'open' : 'collapsed'}`}>
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

      <nav className="sidebar-nav">
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
              <div key={label} className="nav-item nav-item-locked" title="Requiere Admin Central">
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
