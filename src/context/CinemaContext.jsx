import { createContext, useContext, useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { orders } from '../data/store';
import { useAuth } from './AuthContext';
import { PERMS } from '../shared/permissions';

const CinemaContext = createContext();

const EMPTY_CATALOG = { movies: [], branches: [], halls: [], screenings: [], movieCinema: [] };
// Al volver a la pestaña el catálogo se revalida si pasó más de este tiempo desde la última carga.
const REVALIDATE_MS = 30 * 1000;

// Catálogo público (películas visibles, sedes, salas, funciones publicables) leído de la API del servidor.
// `reload()` muestra "cargando"; `reload({ silent: true })` refresca sin vaciar nada ni desmontar las
// páginas (así no se pierde el estado de quien está navegando).
function useCatalog() {
  const [state, setState] = useState({ catalog: EMPTY_CATALOG, loading: true, error: null });
  const [attempt, setAttempt] = useState(0);
  const lastLoad = useRef(0);
  const silentRef = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const silent = silentRef.current;
    silentRef.current = false;
    fetch('/api/catalog', { signal: controller.signal, cache: 'no-cache' })
      .then((res) => {
        if (!res.ok) throw new Error(`El servidor respondió ${res.status}`);
        return res.json();
      })
      .then((data) => {
        const ok = ['movies', 'branches', 'halls', 'screenings', 'movieCinema'].every((k) => Array.isArray(data?.[k]));
        if (!ok) throw new Error('Respuesta del servidor con formato inesperado');
        lastLoad.current = Date.now();
        setState({ catalog: data, loading: false, error: null });
      })
      .catch((err) => {
        if (err.name === 'AbortError') return;
        // Un refresco silencioso que falla conserva lo que ya se mostraba.
        setState((prev) => (silent ? prev : { ...prev, loading: false, error: err }));
      });
    return () => controller.abort();
  }, [attempt]);

  const reload = useCallback((opts) => {
    if (opts?.silent) silentRef.current = true;
    else setState((prev) => ({ ...prev, loading: true, error: null }));
    setAttempt((n) => n + 1);
  }, []);

  // Al volver a la pestaña: revalida si hace tiempo que no se carga.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > REVALIDATE_MS) reload({ silent: true });
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [reload]);

  return { ...state, reload };
}

// Datos del panel (solo personal): todas las películas con su estado y asignaciones, y todas las funciones.
function useAdminData(enabled) {
  const [state, setState] = useState({ movies: null, screenings: null, error: null });
  const [attempt, setAttempt] = useState(0);
  const lastLoad = useRef(0);

  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    const get = (url) => fetch(url, { signal: controller.signal, credentials: 'same-origin' })
      .then((res) => { if (!res.ok) throw new Error(String(res.status)); return res.json(); });
    Promise.all([get('/api/admin/movies'), get('/api/admin/screenings')])
      .then(([m, sc]) => {
        lastLoad.current = Date.now();
        setState({ movies: m.movies, screenings: sc.screenings, error: null });
      })
      .catch((err) => { if (err.name !== 'AbortError') setState((prev) => ({ ...prev, error: err })); });
    return () => controller.abort();
  }, [enabled, attempt]);

  const reload = useCallback(() => setAttempt((n) => n + 1), []);

  useEffect(() => {
    if (!enabled) return undefined;
    const onVisible = () => {
      if (document.visibilityState === 'visible' && Date.now() - lastLoad.current > REVALIDATE_MS) reload();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => document.removeEventListener('visibilitychange', onVisible);
  }, [enabled, reload]);

  return enabled ? { ...state, reload } : { movies: null, screenings: null, error: null, reload };
}

export function CinemaProvider({ children }) {
  const { catalog, loading: catalogLoading, error: catalogError, reload: reloadCatalog } = useCatalog();
  const { branches, halls } = catalog;

  // Usuario real de la sesión (null si no hay sesión).
  const { user: currentUser } = useAuth();
  const userId = currentUser?.id ?? null;
  const isAdminCentral = currentUser?.role === 'admin';
  const isStaff = currentUser?.tier === 'central' || currentUser?.tier === 'branch';

  const admin = useAdminData(isStaff);
  // Datos del panel (con todos los estados). Para quien no es personal no se usan.
  const adminMovies = admin.movies;
  const movies = adminMovies ?? catalog.movies;
  const movieCinema = useMemo(() => (adminMovies
    ? adminMovies.flatMap((m) => m.branches.map((b) => ({
      id: m.id * 1000 + b.branchId, movieId: m.id, branchId: b.branchId, activa: b.active,
      fechaInicio: b.startDate, fechaFin: b.endDate, formatos: b.formats, precioBase: b.basePrice,
    })))
    : catalog.movieCinema), [adminMovies, catalog.movieCinema]);
  const sourceScreenings = admin.screenings ?? catalog.screenings;

  // Sede activa: 'all' = visión global (solo Admin Central) | número = cine específico.
  // El personal de sede queda fijo en su sede; la elección del admin central se
  // descarta al cambiar de usuario (se guarda junto con el id de quien la hizo).
  const [cinemaChoice, setCinemaChoice] = useState({ userId: null, id: 'all' });
  const currentCinemaId = currentUser?.tier === 'branch'
    ? currentUser.branchId
    : (cinemaChoice.userId === userId ? cinemaChoice.id : 'all');

  // Las funciones vienen siempre de la API. La venta simulada de Taquilla NO las modifica: solo agrega pedidos de
  // ejemplo en memoria (así las butacas vendidas que muestran el panel y el sitio son las reales).
  const allScreenings = sourceScreenings;
  const [allOrders, setAllOrders] = useState(orders);

  // Las ventas simuladas pertenecen a la sesión: se reinician al cambiar de usuario.
  const [stateOwner, setStateOwner] = useState(userId);
  if (stateOwner !== userId) {
    setStateOwner(userId);
    setAllOrders(orders);
  }

  // El cine activo real (objeto branch o null = todos)
  const activeBranch = useMemo(() =>
    currentCinemaId === 'all' ? null : branches.find(b => b.id === currentCinemaId),
  [currentCinemaId, branches]);

  // Películas habilitadas en el cine activo (o todas para global)
  // (Solo para el panel: el sitio público usa publicMovies, que no depende de la sede elegida aquí.)
  const enabledMovies = useMemo(() => {
    const live = movies.filter(m => m.status === 'active' || m.status === 'upcoming');
    if (currentCinemaId === 'all') return live;
    const ids = movieCinema
      .filter(mc => mc.branchId === currentCinemaId && mc.activa)
      .map(mc => mc.movieId);
    return live.filter(m => ids.includes(m.id));
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

  // Verificar permiso
  const can = (action) => (PERMS[currentUser?.role] || []).includes(action);

  // Validar si una película está habilitada en un cine
  const isMovieInCinema = (movieId, branchId) =>
    movieCinema.some(mc => mc.movieId === movieId && mc.branchId === branchId && mc.activa);

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
      // Catálogo PÚBLICO: no depende de la sede elegida en el panel ni de la sede del personal.
      publicMovies: catalog.movies,
      publicScreenings: catalog.screenings,
      publicMovieCinema: catalog.movieCinema,
      halls,
      // Datos del panel (todas las películas con su estado y asignaciones; solo personal)
      adminMovies,
      adminScreenings: admin.screenings,
      adminError: admin.error,
      // Estado de carga del catálogo (API)
      catalogLoading,
      catalogError,
      reloadCatalog,
      // Tras un cambio en el panel: refresca el panel y el catálogo público sin mostrar "cargando".
      refreshAll: () => { admin.reload(); reloadCatalog({ silent: true }); },
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
