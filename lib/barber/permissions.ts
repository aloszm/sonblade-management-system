import type { BusinessRole } from '@/lib/auth/context';

/**
 * Quién puede registrar clientes nuevos: mostrador, dirección y también el barbero (registra a quien llega).
 * Editar un cliente existente (PATCH) sigue siendo solo de mostrador y dirección: no incluye al barbero.
 */
export const CLIENT_CREATE_ROLES: BusinessRole[] = ['owner', 'admin', 'cashier', 'receptionist', 'barber'];
export const CLIENT_EDIT_ROLES: BusinessRole[] = ['owner', 'admin', 'cashier', 'receptionist'];

/** Dueño y gerencia ven las cifras de cualquier barbero; un barbero, solo las suyas. */
export function mayReadBarberStats(role: BusinessRole, ownEmployeeId: string | null, targetEmployeeId: string): boolean {
    if (role === 'owner' || role === 'admin') return true;
    return role === 'barber' && ownEmployeeId !== null && ownEmployeeId === targetEmployeeId;
}
