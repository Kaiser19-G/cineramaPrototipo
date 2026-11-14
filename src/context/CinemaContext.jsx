import { createContext, useContext, useState, useMemo, useEffect, useCallback } from 'react';
import {
  orders, recentActivity, alerts, occupancyByHall,
} from '../data/store';
import { useAuth } from './AuthContext';
import { PERMS } from '../shared/permissions';

const CinemaContext = createContext();

const EMPTY_CATALOG = { movies: [], branches: [], halls: [], screenings: [], movieCinema: [] };

// Catálogo (películas, sedes, salas, funciones) leído de la API del servidor.
// Mismo formato de datos que tenía src/data/store.js.
function useCatalog() {
  const [state, setState] = useState({ catalog: EMPTY_CATALOG, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/catalog', { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const ok = ['movies', 'branches', 'halls', 'screenings', 'movieCinema'].every((k) => Array.isArray(data?.[k]));
        if (!ok) throw new Error('Respuesta del servidor con formato inesperado');
        setState({ catalog: data, loading: false, error: null });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setState((prev) => ({ ...prev, loading: false, error: err }));
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback(() => {
    setState((prev) => ({ ...prev, loading: true, error: null }));
    setAttempt((n) => n + 1);
  }, []);

  return { ...state, reload };
}

export function CinemaProvider({ children }) {
  const { catalog, loading: catalogLoading, error: catalogError, reload: reloadCatalog } = useCatalog();
  const { movies, branches, halls, movieCinema } = catalog;

  // Usuario real de la sesión (null si no hay sesión).
  const { user: currentUser } = useAuth();
  const userId = currentUser?.id ?? null;
  const isAdminCentral = currentUser?.role === 'admin';

  // Sede activa: 'all' = visión global (solo Admin Central) | número = cine específico.
  // El personal de sede queda fijo en su sede; la elección del admin central se
  // descarta al cambiar de usuario (se guarda junto con el id de quien la hizo).
  const [cinemaChoice, setCinemaChoice] = useState({ userId: null, id: 'all' });
  const currentCinemaId = currentUser?.tier === 'branch'
    ? currentUser.branchId
    : (cinemaChoice.userId === userId ? cinemaChoice.id : 'all');

  // Convertimos en estado reactivo para permitir registrar compras y actualizar la UI al instante
  // Las funciones vienen de la API; las ventas locales simuladas se suman encima
  // (id de función → entradas vendidas en esta sesión).
  const [localSold, setLocalSold] = useState({});
  const allScreenings = useMemo(() => catalog.screenings.map((s) => {
    const extra = localSold[s.id];
    return extra ? { ...s, bookedSeats: Math.min(s.totalSeats, s.bookedSeats + extra) } : s;
  }), [catalog.screenings, localSold]);
  const [allOrders, setAllOrders] = useState(orders);

  // Las ventas simuladas pertenecen a la sesión: se reinician al cambiar de usuario.
  const [stateOwner, setStateOwner] = useState(userId);
  if (stateOwner !== userId) {
    setStateOwner(userId);
    setLocalSold({});
    setAllOrders(orders);
  }

  // El cine activo real (objeto branch o null = todos)
  const activeBranch = useMemo(() =>
    currentCinemaId === 'all' ? null : branches.find(b => b.id === currentCinemaId),
  [currentCinemaId, branches]);

  // Películas habilitadas en el cine activo (o todas para global)
  const enabledMovies = useMemo(() => {
    if (currentCinemaId === 'all') return movies;
    const ids = movieCinema
      .filter(mc => mc.branchId === currentCinemaId && mc.activa)
      .map(mc => mc.movieId);
    return movies.filter(m => ids.includes(m.id));
  }, [currentCinemaId, movies, movieCinema]);

  // Relaciones película↔cine para el cine activo
  const activeMovieCinema = useMemo(() => {
    if (currentCinemaId === 'all') return movieCinema;
    return movieCinema.filter(mc => mc.branchId === currentCinemaId);
  }, [currentCinemaId, movieCinema]);

  // Salas del cine activo
  const activeHalls = useMemo(() => {
    if (currentCinemaId === 'all') return halls;
    return halls.filter(h => h.branchId === currentCinemaId);
  }, [currentCinemaId, halls]);

  // Funciones del cine activo
  const activeScreenings = useMemo(() => {
    if (currentCinemaId === 'all') return allScreenings;
    return allScreenings.filter(s => s.branchId === currentCinemaId);
  }, [currentCinemaId, allScreenings]);

  // Ventas del cine activo
  const activeOrders = useMemo(() => {
    if (currentCinemaId === 'all') return allOrders;
    return allOrders.filter(o => o.branchId === currentCinemaId);
  }, [currentCinemaId, allOrders]);

  // Actividad filtrada
  const activeActivity = useMemo(() => {
    if (currentCinemaId === 'all') return recentActivity;
    return recentActivity.filter(a => a.branchId === currentCinemaId || a.branchId === null);
  }, [currentCinemaId]);

  // Alertas filtradas
  const activeAlerts = useMemo(() => {
    if (currentCinemaId === 'all') return alerts;
    return alerts.filter(a => a.branchId === currentCinemaId);
  }, [currentCinemaId]);

  // Ocupación filtrada
  const activeOccupancy = useMemo(() => {
    if (currentCinemaId === 'all') return occupancyByHall;
    return occupancyByHall.filter(o => o.branchId === currentCinemaId);
  }, [currentCinemaId]);

  // Verificar permiso
  const can = (action) => (PERMS[currentUser?.role] || []).includes(action);

  // Validar si una película está habilitada en un cine
  const isMovieInCinema = (movieId, branchId) =>
    movieCinema.some(mc => mc.movieId === movieId && mc.branchId === branchId && mc.activa);

  // KPIs globales / locales
  const kpiRevenue = activeOrders
    .filter(o => o.status === 'approved')
    .reduce((s, o) => s + o.amount, 0);
  const kpiTickets = activeOrders.filter(o => o.status === 'approved').length;
  const kpiFailed  = activeOrders.filter(o => o.status === 'rejected').length;
  const kpiScreenings = activeScreenings.filter(s => s.status === 'active').length;
  const kpiOccupancy = activeOccupancy.length
    ? Math.round(activeOccupancy.reduce((s, h) => s + h.occupancy, 0) / activeOccupancy.length)
    : 0;

  const setCinema = (id) => {
    // Solo Admin Central puede cambiar
    if (isAdminCentral) setCinemaChoice({ userId, id });
  };

  // Función para registrar compras presenciales/locales
  const processLocalSale = (screeningId, selectedSeats, customerName, customerEmail, paymentMethod) => {
    const scr = allScreenings.find(s => s.id === screeningId);
    if (!scr) return null;

    const movie = movies.find(m => m.id === scr.movieId);
    const branch = branches.find(b => b.id === scr.branchId);

    // Calcular precio estándar
    const amount = selectedSeats.reduce((sum, seat) => {
      return sum + scr.price;
    }, 0);

    const newOrder = {
      id: `TXN-${Math.floor(100000 + Math.random() * 900000)}`,
      screeningId,
      movieTitle: movie ? movie.title : 'Película',
      branchId: scr.branchId,
      branch: branch ? branch.name : 'Cine Local',
      customer: customerName || 'Cliente Local',
      email: customerEmail || 'venta_local@cinerama.com',
      seats: selectedSeats,
      amount,
      method: paymentMethod,
      status: 'approved',
      date: new Date().toISOString().replace('T', ' ').slice(0, 16)
    };

    setAllOrders(prev => [newOrder, ...prev]);

    // Incrementar asientos ocupados de la función
    setLocalSold(prev => ({ ...prev, [screeningId]: (prev[screeningId] || 0) + selectedSeats.length }));

    return newOrder;
  };

  const refundOrder = (id) => {
    setAllOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'refunded' } : o));
  };

  const cancelOrder = (id) => {
    setAllOrders(prev => prev.map(o => o.id === id ? { ...o, status: 'cancelled' } : o));
  };

  return (
    <CinemaContext.Provider value={{
      // Contexto activo
      currentCinemaId,
      setCinema,
      activeBranch,
      isGlobal: currentCinemaId === 'all',
      isAdminCentral,
      currentUser,
      // Datos filtrados
      branches,
      enabledMovies,
      activeMovieCinema,
      activeHalls,
      activeScreenings,
      activeOrders,
      activeActivity,
      activeAlerts,
      activeOccupancy,
      // Estado de carga del catálogo (API)
      catalogLoading,
      catalogError,
      reloadCatalog,
      // KPIs
      kpiRevenue,
      kpiTickets,
      kpiFailed,
      kpiScreenings,
      kpiOccupancy,
      // Helpers
      can,
      isMovieInCinema,
      processLocalSale,
      refundOrder,
      cancelOrder,
    }}>
      {children}
    </CinemaContext.Provider>
  );
}

export function useCinema() {
  return useContext(CinemaContext);
}
