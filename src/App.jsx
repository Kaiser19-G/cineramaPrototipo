import { useState, useLayoutEffect } from 'react';
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
// TEMPORAL (entrega 6b): el panel ya sigue el TEMA guardado (claro u oscuro,
// clave cinerama-a11y, el mismo del sitio público). Los MODOS DE VISIÓN y el
// TAMAÑO DE LETRA aún no están listos en el panel (entrega 6c), así que
// mientras esté montado se fijan data-vision="default" y data-font-scale="100"
// en <html> y al salir se restauran los valores del usuario. En la entrega 6c:
// poner FIJAR_VISION_Y_LETRA_EN_PANEL en false (o borrar la constante y el
// hook) cuando el widget y los modos estén listos en el panel.
const FIJAR_VISION_Y_LETRA_EN_PANEL = true;

function useFijarVisionYLetraEnPanel() {
  useLayoutEffect(() => {
    if (!FIJAR_VISION_Y_LETRA_EN_PANEL) return undefined;
    const html = document.documentElement;
    const previo = { vision: html.getAttribute('data-vision'), escala: html.getAttribute('data-font-scale') };
    html.setAttribute('data-vision', 'default');
    html.setAttribute('data-font-scale', '100');
    return () => {
      if (previo.vision) html.setAttribute('data-vision', previo.vision);
      if (previo.escala) html.setAttribute('data-font-scale', previo.escala);
    };
  }, []);
}

function AdminLayout() {
  useFijarVisionYLetraEnPanel();
  const { user } = useAuth();
  // Con contraseña temporal solo se ve la pantalla de cambio (en cualquier ruta del panel); el servidor además rechaza la API.
  const forced = !!user?.mustChangePassword;
  // En pantallas angostas el menú lateral empieza plegado: abierto dejaba ~100 px al contenido a 375 px (se abre con el botón de menú).
  const [sidebarOpen, setSidebarOpen] = useState(() => (typeof window === 'undefined' || !window.matchMedia ? true : !window.matchMedia('(max-width: 768px)').matches));
  return (
    <div className="app-layout">
      <a href="#contenido-principal" className="skip-link" onClick={(e) => { e.preventDefault(); document.getElementById('contenido-principal')?.focus(); }}>Saltar al contenido</a>
      <Sidebar open={sidebarOpen} sidebarId="menu-lateral" />
      <div className="main-content">
        <Topbar onMenuToggle={() => setSidebarOpen(o => !o)} menuOpen={sidebarOpen} menuControls="menu-lateral" />
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
