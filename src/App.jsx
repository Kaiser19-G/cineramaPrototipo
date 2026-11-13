import { useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, Outlet } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext';
import { CinemaProvider } from './context/CinemaContext';
import { RequireStaff, RequireCentral } from './components/RequireAuth';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import Dashboard from './pages/Dashboard';
import MovieManagement from './pages/MovieManagement';
import CinemaManagement from './pages/CinemaManagement';
import Scheduling from './pages/Scheduling';
import TicketOperations from './pages/TicketOperations';
import Payments from './pages/Payments';
import UsersAccess from './pages/UsersAccess';
import Reports from './pages/Reports';
import Settings from './pages/Settings';
import WebHome from './pages/WebHome';
import WebLayout from './components/layout/WebLayout';
import WebAuth from './pages/WebAuth';
import WebRegister from './pages/WebRegister';
import WebPrivacy from './pages/WebPrivacy';
import WebNotFound from './pages/WebNotFound';
import WebCinemas from './pages/WebCinemas';
import WebMovies from './pages/WebMovies';
import WebBooking from './pages/WebBooking';
import WebMovieDetails from './pages/WebMovieDetails';
import WebCinemaDetails from './pages/WebCinemaDetails';

// Marco del panel de administración (solo se monta con sesión de personal).
function AdminLayout() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [notifOpen, setNotifOpen] = useState(false);
  return (
    <div className="app-layout">
      <Sidebar open={sidebarOpen} />
      <div className="main-content">
        <Topbar
          onMenuToggle={() => setSidebarOpen(o => !o)}
          onNotifToggle={() => setNotifOpen(o => !o)}
          notifOpen={notifOpen}
          onNotifClose={() => setNotifOpen(false)}
        />
        <div className="page-content">
          <Outlet />
        </div>
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
              <Route path="/web/compra" element={<WebBooking />} />
              <Route path="*" element={<WebNotFound />} />
            </Route>

            {/* Rutas de Administración: solo personal con sesión */}
            <Route element={<RequireStaff><AdminLayout /></RequireStaff>}>
              <Route path="/dashboard"    element={<Dashboard />} />
              <Route path="/movies/*"     element={<MovieManagement />} />
              <Route path="/scheduling/*" element={<Scheduling />} />
              <Route path="/tickets/*"    element={<TicketOperations />} />
              <Route path="/payments/*"   element={<Payments />} />
              <Route path="/reports/*"    element={<Reports />} />
              {/* Solo Admin Central */}
              <Route path="/cinema/*"     element={<RequireCentral><CinemaManagement /></RequireCentral>} />
              <Route path="/users/*"      element={<RequireCentral><UsersAccess /></RequireCentral>} />
              <Route path="/settings/*"   element={<RequireCentral><Settings /></RequireCentral>} />
            </Route>
          </Routes>
        </BrowserRouter>
      </CinemaProvider>
    </AuthProvider>
  );
}
