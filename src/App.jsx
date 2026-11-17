import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CinemaProvider } from './context/CinemaContext';
import { RequireStaff, RequireCentral, RequireCustomer, RequirePerm } from './components/RequireAuth';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import Dashboard from './pages/Dashboard';
import MovieManagement from './pages/MovieManagement';
import CinemaManagement from './pages/CinemaManagement';
import Scheduling from './pages/Scheduling';
import TicketOperations from './pages/TicketOperations';
import Payments from './pages/Payments';
import MenuManagement from './pages/MenuManagement';
import UsersAccess from './pages/UsersAccess';
import Claims, { ClaimDetail } from './pages/Claims';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import ChangePassword from './pages/ChangePassword';
import { useAuth } from './context/AuthContext';
import { useMediaQuery } from './hooks/useMediaQuery';
import { SALES_PERMS, REPORT_PERMS, MENU_PERMS } from './shared/permissions';
import WebHome from './pages/WebHome';
import WebLayout from './components/layout/WebLayout';
import WebAuth from './pages/WebAuth';
import WebRegister from './pages/WebRegister';
import WebPrivacy from './pages/WebPrivacy';
import WebClaim from './pages/WebClaim';
import WebClaimStatus from './pages/WebClaimStatus';
import WebNotFound from './pages/WebNotFound';
import WebCinemas from './pages/WebCinemas';
import WebMovies from './pages/WebMovies';
import WebBooking from './pages/WebBooking';
import WebMyOrders from './pages/WebMyOrders';
import WebOrderDetail from './pages/WebOrderDetail';
import WebMovieDetails from './pages/WebMovieDetails';
import WebCinemaDetails from './pages/WebCinemaDetails';

// Marco del panel de administración (solo se monta con sesión de personal).
// Mientras está montado, <html> lleva data-shell="panel": el CSS lo usa para
// escalar el tamaño de letra con zoom sobre .app-layout (en vez de rem) y para
// el tope de 130 % en pantallas angostas (ver index.css, "ESCALA DE LETRA").
// Tema, tamaño de letra y modo de visión salen de las mismas preferencias que
// el sitio público (clave cinerama-a11y), que cambia PanelAccessibility en la barra superior.
function useMarcoDelPanel() {
  useLayoutEffect(() => {
    const html = document.documentElement;
    html.setAttribute('data-shell', 'panel');
    return () => html.removeAttribute('data-shell');
  }, []);
}

// Pantallas angostas: el menú lateral es una capa superpuesta (no empuja el contenido).
const TELEFONO = '(max-width: 768px)';

function AdminLayout() {
  useMarcoDelPanel();
  const { user } = useAuth();
  // Con contraseña temporal solo se ve la pantalla de cambio (en cualquier ruta del panel); el servidor además rechaza la API.
  const forced = !!user?.mustChangePassword;
  // Escritorio: el menú lateral empieza desplegado y empuja el contenido (se pliega a una columna de íconos).
  // Teléfono: empieza cerrado y, abierto, es una capa superpuesta con fondo; el estado de cada modo es independiente.
  const telefono = useMediaQuery(TELEFONO);
  const [menuEscritorio, setMenuEscritorio] = useState(true);
  const [menuTelefono, setMenuTelefono] = useState(false);
  const sidebarOpen = telefono ? menuTelefono : menuEscritorio;
  const toggleMenu = () => (telefono ? setMenuTelefono((o) => !o) : setMenuEscritorio((o) => !o));
  const cerrarMenuTelefono = () => setMenuTelefono(false);
  const capaAbierta = telefono && menuTelefono;

  // Capa abierta: el foco pasa al primer enlace, Esc la cierra y, al cerrarse, el foco vuelve al botón de menú.
  const estabaAbierta = useRef(false);
  useEffect(() => {
    if (capaAbierta && !estabaAbierta.current) document.querySelector('#menu-lateral a')?.focus();
    if (!capaAbierta && estabaAbierta.current) document.getElementById('menu-toggle')?.focus();
    estabaAbierta.current = capaAbierta;
  }, [capaAbierta]);
  useEffect(() => {
    if (!capaAbierta) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); setMenuTelefono(false); } };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [capaAbierta]);

  return (
    <div className="app-layout">
      <a href="#contenido-principal" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('contenido-principal')?.focus(); }}>Saltar al contenido</a>
      <Sidebar open={sidebarOpen} phone={telefono} sidebarId="menu-lateral" onNavigate={telefono ? cerrarMenuTelefono : undefined} />
      {capaAbierta && <div className="sidebar-backdrop" onClick={cerrarMenuTelefono} aria-hidden="true" />}
      <div className="main-content" inert={capaAbierta}>
        <Topbar onMenuToggle={toggleMenu} menuOpen={sidebarOpen} menuControls="menu-lateral" />
        <main className="page-content" id="contenido-principal" tabIndex={-1}>
          {forced ? <ChangePassword forced /> : <Outlet />}
        </main>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <CinemaProvider>
        <BrowserRouter>
          <Routes>
            {/* Rutas Públicas Web encapsuladas en su propio Layout */}
            <Route path="/" element={<Navigate to="/WebHome" replace />} />
            <Route element={<WebLayout />}>
              <Route path="/WebHome" element={<WebHome />} />
              <Route path="/web/peliculas" element={<WebMovies />} />
              <Route path="/web/pelicula/:id" element={<WebMovieDetails />} />
              <Route path="/web/cines" element={<WebCinemas />} />
              <Route path="/web/cine/:id" element={<WebCinemaDetails />} />
              <Route path="/web/login" element={<WebAuth />} />
              <Route path="/web/registro" element={<WebRegister />} />
              <Route path="/web/privacidad" element={<WebPrivacy />} />
              <Route path="/web/reclamo-dni" element={<WebClaim />} />
              <Route path="/web/reclamo-dni/estado" element={<WebClaimStatus />} />
              <Route path="/web/compra/:screeningId" element={<WebBooking />} />
              <Route path="/web/mis-entradas" element={<RequireCustomer><WebMyOrders /></RequireCustomer>} />
              <Route path="/web/mis-entradas/:code" element={<RequireCustomer><WebOrderDetail /></RequireCustomer>} />
              {/* La ruta anterior no tenía función: ahora la compra siempre es de una función concreta. */}
              <Route path="/web/compra" element={<Navigate to="/web/peliculas" replace state={{ notice: 'Elige una película y una función para comprar tus entradas.' }} />} />
              <Route path="*" element={<WebNotFound />} />
            </Route>

            {/* Rutas de Administración: solo personal con sesión */}
            <Route element={<RequireStaff><AdminLayout /></RequireStaff>}>
              <Route path="/dashboard"    element={<Dashboard />} />
              <Route path="/account/password" element={<ChangePassword />} />
              <Route path="/movies/*"     element={<MovieManagement />} />
              <Route path="/scheduling/*" element={<Scheduling />} />
              <Route path="/tickets/*"    element={<TicketOperations />} />
              <Route path="/confiteria/*"        element={<RequirePerm any={MENU_PERMS}><MenuManagement /></RequirePerm>} />
              <Route path="/payments/*"   element={<RequirePerm any={SALES_PERMS}><Payments /></RequirePerm>} />
              <Route path="/reports/*"    element={<RequirePerm any={REPORT_PERMS}><Reports /></RequirePerm>} />
              {/* Solo Admin Central */}
              <Route path="/cinema/*"     element={<RequireCentral><CinemaManagement /></RequireCentral>} />
              <Route path="/users/*"      element={<RequireCentral><UsersAccess /></RequireCentral>} />
              <Route path="/settings/*"   element={<RequireCentral><Settings /></RequireCentral>} />
              <Route path="/claims"       element={<RequireCentral><Claims /></RequireCentral>} />
              <Route path="/claims/:id"   element={<RequireCentral><ClaimDetail /></RequireCentral>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CinemaProvider>
    </AuthProvider>
  );
}
