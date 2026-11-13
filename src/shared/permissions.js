// Roles y permisos compartidos entre el cliente y el servidor.
// users.role conserva los 5 roles del personal y agrega 'customer'.
// Tres niveles de acceso derivados: central, sede (branch) y cliente.

export const PERMS = {
  admin:    ['create_movie','edit_movie','delete_movie','assign_cinema','create_cinema','edit_cinema',
             'create_hall','edit_hall','schedule_any','view_global_reports','manage_users','manage_settings',
             'view_all_sales','create_screening','cancel_screening'],
  manager:  ['schedule_any','create_screening','cancel_screening','edit_hall','view_local_reports',
             'view_local_sales','block_hall'],
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

export const isStaffTier = (tier) => tier === 'central' || tier === 'branch';
