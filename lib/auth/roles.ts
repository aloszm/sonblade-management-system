import type { BusinessRole } from '@/lib/auth/context';

/**
 * Quienes atienden el mostrador: cobran, abren y cierran caja.
 * `cashier` se conserva por compatibilidad; en el negocio el puesto se llama Recepcionista.
 * Aprobar descuentos NO está aquí: solo owner/admin (lo valida confirm_sale en la base).
 */
export const FRONT_DESK_ROLES: BusinessRole[] = ['owner', 'admin', 'cashier', 'receptionist'];
