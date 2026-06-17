import { createContext, useContext, useState, useMemo } from 'react';
import {
  branches, movies, movieCinema, screenings,
  orders, halls, recentActivity, alerts, occupancyByHall,
} from '../data/store';

const CinemaContext = createContext();

// Permisos por rol
const PERMS = {
  admin:    ['create_movie','edit_movie','delete_movie','assign_cinema','create_cinema','edit_cinema',
             'create_hall','edit_hall','schedule_any','view_global_reports','manage_users','manage_settings',
             'view_all_sales','create_screening','cancel_screening'],
  manager:  ['schedule_any','create_screening','cancel_screening','edit_hall','view_local_reports',
             'view_local_sales','block_hall'],
  cashier:  ['view_local_screenings','process_sale','validate_ticket'],
  support:  ['view_orders','process_refund'],
  operator: ['view_local_screenings','validate_ticket'],
};

export function CinemaProvider({ children }) {
  // 'all' = visión global Admin Central | número = cine específico
  const [currentCinemaId, setCurrentCinemaId] = useState('all');
  
  // Convertimos en estado reactivo para permitir registrar compras y actualizar la UI al instante
  const [allScreenings, setAllScreenings] = useState(screenings);
  const [allOrders, setAllOrders] = useState(orders);

  // Usuario simulado. role: 'admin' puede cambiar currentCinemaId.
  // Un 'manager' tiene branchId fijo y no puede cambiarlo.
  const [currentUser] = useState({
    id: 1, name: 'Admin Central', role: 'admin',
    branchId: null, // null = acceso global
    avatar: 'AC',
  });

  const isAdminCentral = currentUser.role === 'admin';

  // El cine activo real (objeto branch o null = todos)
  const activeBranch = useMemo(() =>
    currentCinemaId === 'all' ? null : branches.find(b => b.id === currentCinemaId),
  [currentCinemaId]);

  // Películas habilitadas en el cine activo (o todas para global)
  const enabledMovies = useMemo(() => {
    if (currentCinemaId === 'all') return movies;
    const ids = movieCinema
      .filter(mc => mc.branchId === currentCinemaId && mc.activa)
      .map(mc => mc.movieId);
    return movies.filter(m => ids.includes(m.id));
  }, [currentCinemaId]);

  // Relaciones película↔cine para el cine activo
  const activeMovieCinema = useMemo(() => {
    if (currentCinemaId === 'all') return movieCinema;
    return movieCinema.filter(mc => mc.branchId === currentCinemaId);
  }, [currentCinemaId]);

  // Salas del cine activo
  const activeHalls = useMemo(() => {
    if (currentCinemaId === 'all') return halls;
    return halls.filter(h => h.branchId === currentCinemaId);
  }, [currentCinemaId]);

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
  const can = (action) => (PERMS[currentUser.role] || []).includes(action);

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
    if (isAdminCentral) setCurrentCinemaId(id);
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
    setAllScreenings(prev => prev.map(s => {
      if (s.id === screeningId) {
        return {
          ...s,
          bookedSeats: Math.min(s.totalSeats, s.bookedSeats + selectedSeats.length)
        };
      }
      return s;
    }));

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
