import type { BusinessRole } from '@/lib/auth/context';

/**
 * Quién puede registrar clientes nuevos: mostrador, dirección y también el barbero (registra a quien llega).
 * Editar un cliente existente (PATCH) sigue siendo solo de mostrador y dirección: no incluye al barbero.
 */
export const CLIENT_CREATE_ROLES: BusinessRole[] = ['owner', 'admin', 'cashier', 'receptionist', 'barber'];
export const CLIENT_EDIT_ROLES: BusinessRole[] = ['owner', 'admin', 'cashier', 'receptionist'];

/**
 * Dueño y gerencia ven las cifras de cualquier persona; barbero y recepción (que ahora tiene su propia «Mi semana»
 * con sueldo por día y comisiones de producto), solo las suyas.
 */
export function mayReadBarberStats(role: BusinessRole, ownEmployeeId: string | null, targetEmployeeId: string): boolean {
    if (role === 'owner' || role === 'admin') return true;
    const own = role === 'barber' || role === 'receptionist' || role === 'cashier';
    return own && ownEmployeeId !== null && ownEmployeeId === targetEmployeeId;
}

/**
 * Importes del ranking de ingreso: dueño, gerencia, caja y recepción ven los de todos;
 * un barbero ve el orden y los nombres, pero solo su propio importe (nunca el dinero ajeno).
 */
export function mayReadRankingMoney(role: BusinessRole, ownEmployeeId: string | null, targetEmployeeId: string): boolean {
    if (role === 'owner' || role === 'admin' || role === 'cashier' || role === 'receptionist') return true;
    return role === 'barber' && ownEmployeeId !== null && ownEmployeeId === targetEmployeeId;
}

/** Quién puede abrir "Barberos hoy": el equipo de mostrador y la dirección; el barbero no. */
export const TEAM_SUMMARY_ROLES: BusinessRole[] = ['owner', 'admin', 'cashier', 'receptionist'];
