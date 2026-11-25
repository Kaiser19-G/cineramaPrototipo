// ─── STORE EXPANDIDO — ADMIN CENTRAL ARCHITECTURE ───────────────────────────

export const movies = [
  { id: 1, title: 'El Mago del Kremlin', genre: 'Drama', duration: 152, rating: 'PG', status: 'active', format: ['2D'], director: 'Olivier Assayas', language: 'ES', poster: 'https://www.cinerama.com.pe/_admin/assets/images/peliculas/PosterMain4.jpg', synopsis: 'En la Rusia posterior al colapso soviético, un asesor político brillante...', featured: true, releaseDate: '2026-04-30', endDate: '2026-06-30' },
  { id: 2, title: 'Exit 8', genre: 'Terror', duration: 95, rating: 'PG', status: 'active', format: ['2D'], director: 'Genki Kawamura', language: 'ES', poster: 'https://www.cinerama.com.pe/_admin/assets/images/peliculas/8_ban_deguchi-289035682-large.jpg', synopsis: 'Película basada en el videojuego de Kotake Create The Exit 8...', featured: false, releaseDate: '2026-04-30', endDate: '2026-06-30' },
  { id: 3, title: 'El Diablo Viste a la Moda 2', genre: 'Drama', duration: 120, rating: 'PG', status: 'active', format: ['2D'], director: 'David Frankel', language: 'EN', poster: 'https://www.cinerama.com.pe/_admin/assets/images/peliculas/diablos.jpg', synopsis: 'Casi veinte años después de dar vida a los icónicos personajes...', featured: false, releaseDate: '2026-04-29', endDate: '2026-06-30' },
  { id: 4, title: 'Mortal Kombat II', genre: 'Acción', duration: 116, rating: 'PG', status: 'active', format: ['2D'], director: 'Simon McQuoid', language: 'ES', poster: 'https://www.cinerama.com.pe/_admin/assets/images/peliculas/mortale.jpg', synopsis: '', featured: true, releaseDate: '2026-04-24', endDate: '2026-06-30' },
  { id: 5, title: 'Michael', genre: 'Musical', duration: 127, rating: 'PG-14', status: 'active', format: ['2D'], director: 'Antoine Fuqua', language: 'EN', poster: 'https://www.cinerama.com.pe/_admin/assets/images/peliculas/michael-335783380-large.jpg', synopsis: 'Muestra el viaje de Michael Jackson más allá de la música...', featured: false, releaseDate: '2026-04-21', endDate: '2026-06-30' },
  { id: 6, title: 'La Posesion de la Momia', genre: 'Terror', duration: 135, rating: 'PG-14', status: 'active', format: ['2D'], director: 'Lee Cronin', language: 'ES', poster: 'https://www.cinerama.com.pe/_admin/assets/images/peliculas/Sin%20t%C3%ADtulo1.jpg', synopsis: 'Tras el éxito de Evil Dead, el director Lee Cronin regresa...', featured: false, releaseDate: '2026-04-16', endDate: '2026-06-30' },
  { id: 7, title: 'Boulevard', genre: 'Romance', duration: 115, rating: 'PG-14', status: 'active', format: ['2D'], director: 'Sonia Méndez', language: 'ES', poster: 'https://www.cinerama.com.pe/_admin/assets/images/peliculas/boule.jpg', synopsis: 'Dos marginados de preparatoria forman un vínculo...', featured: false, releaseDate: '2026-04-16', endDate: '2026-06-30' },
  { id: 8, title: 'Super Mario Galaxy La Pelicula', genre: 'Animación', duration: 103, rating: 'PG', status: 'active', format: ['3D','2D'], director: 'Aaron Horvath, Michael Jelenic', language: 'ES', poster: 'https://www.cinerama.com.pe/_admin/assets/images/peliculas/unnamed.jpg', synopsis: 'Super Mario Galaxy: La Película es una película animada...', featured: true, releaseDate: '2026-04-01', endDate: '2026-06-30' },
];

export const genres = ['Acción','Aventura','Comedia','Drama','Terror','Romance','Sci-Fi','Thriller','Animación','Documental'];
export const formats = ['2D','3D'];

export const branches = [
  { id: 1, name: 'Cinerama Pacífico',  city: 'Lima',     address: 'Av. José Pardo 121, Miraflores - Lima - Lima', status: 'active',      halls: 5, manager: 'Sarah Mitchell', formats: '2D, 3D, REGULAR', img: 'https://www.cinerama.com.pe/_admin/assets/images/cines/pacifico.jpg' },
  { id: 2, name: 'Cinerama Minka',    city: 'Callao',     address: 'Av. Argentina 3093 CC Minka 2do Nivel Callao',       status: 'active',      halls: 2, manager: 'Michael Chen', formats: '2D, 3D, REGULAR', img: 'https://www.cinerama.com.pe/_admin/assets/images/cines/minka.jpg' },
  { id: 3, name: 'Cinerama Chimbote',    city: 'Chimbote', address: 'Av. V. Raúl H. de la Torre Mega Plaza Chimbote',           status: 'active',      halls: 1, manager: 'Emily Rodriguez', formats: '2D, 3D, REGULAR', img: 'https://www.cinerama.com.pe/_admin/assets/images/cines/WhatsApp%20Image%202022-10-13%20at%2022.48.12.jpeg' },
  { id: 4, name: 'Cinerama Ica Megaplaza',     city: 'Ica',     address: 'Av. Los Maestros S/N CC Mega Plaza Ica',      status: 'active', halls: 1, manager: 'David Thompson', formats: '2D, 3D, REGULAR', img: 'https://www.cinerama.com.pe/_admin/assets/images/cines/ICAQUINDE.jpeg' },
  { id: 5, name: 'Cinerama Piura',     city: 'Piura',     address: 'Av. Grau 1460 CC. Plaza del Sol',      status: 'active', halls: 4, manager: 'Luka Doncic', formats: '2D, 3D, REGULAR', img: 'https://www.cinerama.com.pe/_admin/assets/images/cines/IMG-20240510-WA0017.jpg' },
  { id: 6, name: 'Cinerama Tarapoto',     city: 'Tarapoto',     address: 'Av. Alfonso Ugarte 1360 Tarapoto',      status: 'active', halls: 4, manager: 'Lisa Brown', formats: '2D, 3D, REGULAR', img: 'https://www.cinerama.com.pe/_admin/assets/images/cines/WhatsApp%20Image%202022-10-13%20at%2014.38.54.jpeg' },
  { id: 7, name: 'Cinerama Cajamarca',     city: 'Cajamarca',     address: 'Jr. Sor Manuela Gil 151 CC Megaplaza Cajamarca',      status: 'active', halls: 4, manager: 'Kevin Durant', formats: '2D, 3D, REGULAR', img: 'https://www.cinerama.com.pe/_admin/assets/images/cines/WhatsApp%20Image%202022-10-13%20at%2022.48.43.jpeg' },
  { id: 8, name: 'Cinerama Sol',     city: 'Ica',     address: 'Av. San Martín 727 CC Plaza del Sol, Ica',      status: 'active', halls: 3, manager: 'James Wilson', formats: '2D, 3D, REGULAR', img: 'https://www.cinerama.com.pe/_admin/assets/images/cines/WhatsApp%20Image%202022-10-13%20at%2022.06.44.jpeg' },
  { id: 9, name: 'Cinerama Huacho',     city: 'Huacho',     address: 'Colón 601 CC Plaza del Sol 2do Nivel',      status: 'active', halls: 3, manager: 'Stephen Curry', formats: '2D, 3D, REGULAR', img: 'https://www.cinerama.com.pe/_admin/assets/images/cines/IMG-20231027-WA0026.jpg' },
  { id: 10, name: 'Cinerama Moyobamba',     city: 'Moyobamba',     address: 'Jr. Manuel del Águila 542 Moyobamba',      status: 'active', halls: 3, manager: 'David Thompson', formats: '2D, 3D, REGULAR', img: 'https://www.cinerama.com.pe/_admin/assets/images/cines/WhatsApp%20Image%202022-10-12%20at%2019.36.43.jpeg' },
  { id: 11, name: 'Cinerama Cusco',     city: 'Cusco',     address: 'Calle Cruz Verde 347 CC Imperial Plaza Cusco',      status: 'active', halls: 4, manager: 'LeBron James', formats: '2D, 3D, REGULAR', img: 'https://www.cinerama.com.pe/_admin/assets/images/cines/WhatsApp%20Image%202022-10-13%20at%2022.50.32.jpeg' },
];

export const halls = [
  { id: 1, branchId: 1, name: 'Sala 1', type: '3D',   capacity: 280, status: 'active',      priceBase: 35 },
  { id: 2, branchId: 1, name: 'Sala 2', type: '3D',   capacity: 180, status: 'active',      priceBase: 25 },
  { id: 3, branchId: 1, name: 'Sala 3', type: '2D',   capacity: 150, status: 'active',      priceBase: 18 },
  { id: 4, branchId: 1, name: 'Sala 4', type: '2D',   capacity: 80,  status: 'maintenance', priceBase: 55 },
  { id: 5, branchId: 1, name: 'Sala 5', type: '3D',   capacity: 120, status: 'active',      priceBase: 45 },
  { id: 6, branchId: 2, name: 'Sala 1', type: '2D',   capacity: 200, status: 'active',      priceBase: 18 },
  { id: 7, branchId: 2, name: 'Sala 2', type: '3D',   capacity: 160, status: 'active',      priceBase: 25 },
  { id: 8, branchId: 3, name: 'Sala 1', type: '2D',   capacity: 130, status: 'active',      priceBase: 16 },
  { id: 9, branchId: 4, name: 'Sala 1', type: '3D',   capacity: 310, status: 'maintenance', priceBase: 40 },
];

// ─── TABLA RELACIONAL CLAVE: PELÍCULA ↔ CINE ─────────────────────────────────
// Una película puede estar habilitada en ciertos cines con formatos y precios distintos.
// El Admin Central gestiona estas asignaciones.
export const movieCinema = [
  // Duna: Parte Tres → Cinerama Centro (3D,2D), Complejo Mall (3D,2D)
  { id: 1, movieId: 1, branchId: 1, activa: true, fechaInicio: '2026-04-01', fechaFin: '2026-06-15', formatos: ['3D','2D'], precioBase: 35 },
  { id: 2, movieId: 1, branchId: 2, activa: true, fechaInicio: '2026-04-05', fechaFin: '2026-06-15', formatos: ['3D','2D'],       precioBase: 28 },
  // Batman: El Regreso → Cinerama Centro, Cine Suburbia
  { id: 3, movieId: 2, branchId: 1, activa: true, fechaInicio: '2026-03-15', fechaFin: '2026-06-01', formatos: ['3D','2D'],       precioBase: 25 },
  { id: 4, movieId: 2, branchId: 3, activa: true, fechaInicio: '2026-03-20', fechaFin: '2026-06-01', formatos: ['2D'],            precioBase: 16 },
  // Inception → Solo Cinerama Centro
  { id: 5, movieId: 3, branchId: 1, activa: true, fechaInicio: '2026-04-10', fechaFin: '2026-05-30', formatos: ['2D','3D'],     precioBase: 30 },
  // Avatar → Cinerama Centro (3D,2D)
  { id: 6, movieId: 4, branchId: 1, activa: true, fechaInicio: '2026-07-04', fechaFin: '2026-10-01', formatos: ['3D','2D'],    precioBase: 45 },
  // Oppenheimer → Complejo Mall, Cine Suburbia
  { id: 7, movieId: 6, branchId: 2, activa: true, fechaInicio: '2026-04-25', fechaFin: '2026-06-10', formatos: ['2D'],            precioBase: 18 },
  { id: 8, movieId: 6, branchId: 3, activa: true, fechaInicio: '2026-05-01', fechaFin: '2026-06-10', formatos: ['2D'],            precioBase: 14 },
];

const today = new Date();
const fmt   = (d) => d.toISOString().split('T')[0];
const addDays = (d, n) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export const screenings = [
  { id: 1,  movieId: 1, hallId: 1, branchId: 1, date: fmt(today),           startTime: '14:00', endTime: '16:35', language: 'ES', format: '3D',   price: 35, status: 'active',    bookedSeats: 210, totalSeats: 280 },
  { id: 2,  movieId: 2, hallId: 2, branchId: 1, date: fmt(today),           startTime: '15:30', endTime: '17:52', language: 'ES', format: '3D',   price: 25, status: 'scheduled', bookedSeats: 80,  totalSeats: 180 },
  { id: 3,  movieId: 3, hallId: 3, branchId: 1, date: fmt(today),           startTime: '18:00', endTime: '20:28', language: 'EN', format: '2D',   price: 18, status: 'active',    bookedSeats: 140, totalSeats: 150 },
  { id: 4,  movieId: 4, hallId: 5, branchId: 1, date: fmt(addDays(today,1)),startTime: '20:30', endTime: '23:32', language: 'ES', format: '3D',   price: 45, status: 'scheduled', bookedSeats: 30,  totalSeats: 120 },
  { id: 5,  movieId: 5, hallId: 1, branchId: 1, date: fmt(addDays(today,1)),startTime: '16:00', endTime: '18:49', language: 'EN', format: '3D',   price: 35, status: 'scheduled', bookedSeats: 0,   totalSeats: 280 },
  { id: 6,  movieId: 6, hallId: 6, branchId: 2, date: fmt(today),           startTime: '19:00', endTime: '22:15', language: 'ES', format: '2D',   price: 18, status: 'active',    bookedSeats: 90,  totalSeats: 200 },
  { id: 7,  movieId: 7, hallId: 7, branchId: 2, date: fmt(addDays(today,2)),startTime: '21:00', endTime: '23:18', language: 'EN', format: '3D',   price: 25, status: 'draft',     bookedSeats: 0,   totalSeats: 160 },
  { id: 8,  movieId: 1, hallId: 3, branchId: 1, date: fmt(today),           startTime: '17:30', endTime: '20:05', language: 'ES', format: '2D',   price: 18, status: 'sold_out',  bookedSeats: 150, totalSeats: 150 },
  { id: 9,  movieId: 2, hallId: 6, branchId: 2, date: fmt(addDays(today,-1)),startTime:'18:00', endTime: '20:22', language: 'ES', format: '2D',   price: 18, status: 'finished',  bookedSeats: 180, totalSeats: 200 },
  { id: 10, movieId: 6, hallId: 8, branchId: 3, date: fmt(addDays(today,1)),startTime: '20:00', endTime: '22:28', language: 'ES', format: '2D',   price: 14, status: 'scheduled', bookedSeats: 20,  totalSeats: 130 },
];

export const orders = [
  { id: 'TXN-001245', screeningId: 1, movieTitle: 'Duna: Parte Tres',           branchId: 1, branch: 'Cinerama Centro', customer: 'Carlos Méndez',  email: 'c.mendez@mail.com',  seats: ['A5','A6'],       amount: 70, method: 'credit_card', status: 'approved', date: '2026-05-13 14:30' },
  { id: 'TXN-001246', screeningId: 2, movieTitle: 'Batman: El Regreso',         branchId: 1, branch: 'Cinerama Centro', customer: 'Ana Torres',      email: 'a.torres@mail.com',  seats: ['C8'],            amount: 25, method: 'cash',        status: 'approved', date: '2026-05-13 14:45' },
  { id: 'TXN-001247', screeningId: 4, movieTitle: 'Avatar: El Camino del Fuego',branchId: 1, branch: 'Cinerama Centro', customer: 'Luis García',     email: 'l.garcia@mail.com',  seats: ['B3','B4'],       amount: 90, method: 'debit_card',  status: 'approved', date: '2026-05-13 15:00' },
  { id: 'TXN-001248', screeningId: 3, movieTitle: 'Inception Remasterizado',    branchId: 3, branch: 'Cine Suburbia',   customer: 'María López',     email: 'm.lopez@mail.com',   seats: ['D1'],            amount: 18, method: 'credit_card', status: 'approved', date: '2026-05-13 15:20' },
  { id: 'TXN-001249', screeningId: 8, movieTitle: 'El Padrino 4K',              branchId: 1, branch: 'Cinerama Centro', customer: 'Pedro Ramos',     email: 'p.ramos@mail.com',   seats: ['F10','F11'],     amount: 36, method: 'mobile_pay',  status: 'refunded', date: '2026-05-13 15:45' },
  { id: 'TXN-001250', screeningId: 6, movieTitle: 'Oppenheimer Extendido',      branchId: 2, branch: 'Complejo Mall',   customer: 'Sofía Castro',    email: 's.castro@mail.com',  seats: ['E5','E6','E7'],  amount: 54, method: 'credit_card', status: 'approved', date: '2026-05-13 16:10' },
  { id: 'TXN-001251', screeningId: 5, movieTitle: 'Interstellar 10º Aniversario',branchId: 1, branch: 'Cinerama Centro', customer: 'Diego Vargas',   email: 'd.vargas@mail.com',  seats: ['A1','A2'],       amount: 70, method: 'credit_card', status: 'rejected', date: '2026-05-13 16:30' },
  { id: 'TXN-001252', screeningId: 1, movieTitle: 'Duna: Parte Tres',           branchId: 2, branch: 'Complejo Mall',   customer: 'Elena Ríos',      email: 'e.rios@mail.com',    seats: ['B7'],            amount: 35, method: 'debit_card',  status: 'approved', date: '2026-05-13 17:00' },
];

export const users = [
  { id: 1, name: 'Admin Central',    email: 'admin@cinerama.com',             role: 'admin',    branchId: null, status: 'active', lastLogin: '2026-05-13 09:30', avatar: 'AC' },
  { id: 2, name: 'Sarah Mitchell',   email: 'sarah.mitchell@cinerama.com',    role: 'manager',  branchId: 1,    status: 'active', lastLogin: '2026-05-13 08:15', avatar: 'SM' },
  { id: 3, name: 'Michael Chen',     email: 'michael.chen@cinerama.com',      role: 'cashier',  branchId: 1,    status: 'active', lastLogin: '2026-05-12 18:45', avatar: 'MC' },
  { id: 4, name: 'Emily Rodriguez',  email: 'emily.rodriguez@cinerama.com',   role: 'manager',  branchId: 3,    status: 'active', lastLogin: '2026-05-13 10:20', avatar: 'ER' },
  { id: 5, name: 'David Thompson',   email: 'david.thompson@cinerama.com',    role: 'cashier',  branchId: 4,    status: 'inactive',lastLogin:'2026-05-10 14:30', avatar: 'DT' },
  { id: 6, name: 'Lisa Brown',       email: 'lisa.brown@cinerama.com',        role: 'cashier',  branchId: 2,    status: 'active', lastLogin: '2026-05-13 07:00', avatar: 'LB' },
  { id: 7, name: 'James Wilson',     email: 'james.wilson@cinerama.com',      role: 'support',  branchId: 1,    status: 'active', lastLogin: '2026-05-12 22:15', avatar: 'JW' },
  { id: 8, name: 'Anna Martinez',    email: 'anna.martinez@cinerama.com',     role: 'operator', branchId: 2,    status: 'active', lastLogin: '2026-05-13 11:00', avatar: 'AM' },
];

// ── Chart data ────────────────────────────────────────────────────────────────
export const revenueByDay = [
  { day: 'Lun', revenue: 18200, centro: 12000, mall: 4200, suburbia: 2000 },
  { day: 'Mar', revenue: 22400, centro: 14800, mall: 5600, suburbia: 2000 },
  { day: 'Mié', revenue: 19800, centro: 13200, mall: 4600, suburbia: 2000 },
  { day: 'Jue', revenue: 28600, centro: 18500, mall: 7100, suburbia: 3000 },
  { day: 'Vie', revenue: 35200, centro: 22000, mall: 9200, suburbia: 4000 },
  { day: 'Sáb', revenue: 44800, centro: 28000, mall: 12000,suburbia: 4800 },
  { day: 'Dom', revenue: 38500, centro: 24000, mall: 10000,suburbia: 4500 },
];

export const genreData = [
  { name: 'Sci-Fi',   value: 38, color: 'var(--electric-blue)' },
  { name: 'Acción',   value: 28, color: 'var(--action-red)' },
  { name: 'Drama',    value: 18, color: 'var(--cinema-gold)' },
  { name: 'Comedia',  value: 10, color: 'var(--emerald)' },
  { name: 'Terror',   value: 6,  color: 'var(--violet)' },
];

export const occupancyByHall = [
  { hall: 'Sala 1', occupancy: 75, branchId: 1 },
  { hall: 'Sala 2', occupancy: 44, branchId: 1 },
  { hall: 'Sala 3', occupancy: 93, branchId: 1 },
  { hall: 'Sala 4', occupancy: 0,  branchId: 1 },
  { hall: 'Sala 5', occupancy: 25, branchId: 1 },
  { hall: 'Sala 6', occupancy: 60, branchId: 2 },
  { hall: 'Sala 7', occupancy: 35, branchId: 2 },
  { hall: 'Sala 8', occupancy: 55, branchId: 3 },
];

export const recentActivity = [
  { id: 1, message: 'Nueva función creada: Duna Pt3 — Sala 1, 14:00',       time: 'hace 2 min',   level: 'info',    branchId: 1 },
  { id: 2, message: 'Avatar pasó a Preventa — habilitado en Cinerama Centro',time: 'hace 15 min',  level: 'success', branchId: 1 },
  { id: 3, message: 'Pago rechazado: TXN-001251 — $70.00',                   time: 'hace 31 min',  level: 'error',   branchId: 1 },
  { id: 4, message: 'Nuevo usuario registrado: Elena Ríos',                  time: 'hace 1 hora',  level: 'info',    branchId: null },
  { id: 5, message: 'Reembolso procesado: TXN-001249 — $36.00',             time: 'hace 2 horas', level: 'warning', branchId: 1 },
  { id: 6, message: 'Sala 4 puesta en modo Mantenimiento',                   time: 'hace 3 horas', level: 'warning', branchId: 1 },
  { id: 7, message: 'Oppenheimer habilitado en Cine Suburbia',               time: 'hace 5 horas', level: 'success', branchId: null },
];

export const alerts = [
  { id: 1, message: 'Conflicto: Sala 1 — 14:00 y 15:00 en riesgo de traslape',  level: 'error',   branchId: 1 },
  { id: 2, message: 'Sala 4 en mantenimiento — 3 funciones afectadas',     level: 'warning', branchId: 1 },
  { id: 3, message: '2 funciones por debajo del 20% de ocupación esta semana',   level: 'warning', branchId: 2 },
  { id: 4, message: '3 pagos fallidos en la última hora',                         level: 'error',   branchId: 1 },
  { id: 5, message: 'Inception Remasterizado deja cartelera en 12 días',          level: 'info',    branchId: 1 },
];
