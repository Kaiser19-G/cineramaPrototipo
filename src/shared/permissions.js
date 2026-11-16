// Roles y permisos compartidos entre el cliente y el servidor.
// users.role conserva los 5 roles del personal y agrega 'customer'.
// Tres niveles de acceso derivados: central, sede (branch) y cliente.

export const PERMS = {
  admin:    ['create_movie','edit_movie','delete_movie','assign_cinema','create_cinema','edit_cinema',
             'create_hall','edit_hall','schedule_any','view_global_reports','manage_users','manage_settings',
             'view_all_sales','create_screening','cancel_screening'],
  manager:  ['schedule_any','create_screening','cancel_screening','edit_hall','view_local_reports',
             'view_local_sales','block_hall','process_refund'],
  cashier:  ['view_local_screenings','process_sale','validate_ticket'],
  support:  ['view_orders','process_refund'],
  operator: ['view_local_screenings','validate_ticket'],
  customer: [],
};

export const ROLE_LABELS = {
  admin: 'Administrador central',
  manager: 'Gerente de sede',
  cashier: 'Cajero',
  support: 'Soporte',
  operator: 'Operador',
  customer: 'Cliente',
};

// 'central' | 'branch' | 'customer' | null (rol desconocido)
export function tierOf(role) {
  if (role === 'admin') return 'central';
  if (role === 'manager' || role === 'cashier' || role === 'support' || role === 'operator') return 'branch';
  if (role === 'customer') return 'customer';
  return null;
}

// Quien puede abrir Pagos (lista de órdenes) y Reportes: el servidor aplica lo mismo en /api/admin/orders y /reports.
export const SALES_PERMS = ['view_all_sales', 'view_local_sales', 'view_orders'];
export const REPORT_PERMS = ['view_global_reports', 'view_local_reports'];
export const hasAnyPerm = (user, perms) => !!user?.perms?.some((p) => perms.includes(p));

export const isStaffTier = (tier) => tier === 'central' || tier === 'branch';

// Textos de cada permiso (la pantalla Roles y permisos se genera de PERMS + estos textos; no hay otra tabla).
export const PERM_LABELS = {
  create_movie: 'Crear películas', edit_movie: 'Editar películas', delete_movie: 'Eliminar películas',
  assign_cinema: 'Habilitar películas en sedes', create_cinema: 'Crear sedes', edit_cinema: 'Editar sedes',
  create_hall: 'Crear salas', edit_hall: 'Editar salas y ponerlas en mantenimiento', block_hall: 'Poner salas de su sede en mantenimiento',
  schedule_any: 'Programar en cualquier sala de su alcance', create_screening: 'Crear y editar funciones', cancel_screening: 'Cancelar funciones',
  view_global_reports: 'Ver reportes de toda la red', view_local_reports: 'Ver reportes de su sede',
  view_all_sales: 'Ver las ventas de toda la red', view_local_sales: 'Ver las ventas de su sede',
  manage_users: 'Gestionar usuarios', manage_settings: 'Cambiar la configuración del sistema',
  view_local_screenings: 'Ver las funciones de su sede', process_sale: 'Procesar ventas en taquilla', validate_ticket: 'Validar boletos',
  view_orders: 'Ver pedidos', process_refund: 'Procesar reembolsos',
};
