import type { BusinessRole } from '@/lib/auth/context';

/**
 * Quién puede crear, restablecer o desactivar el acceso de quién. La base aplica lo mismo
 * (private.can_manage_account); aquí se repite para contestar 403 antes y para la pantalla.
 *
 *  - Dueño (owner): a cualquiera, incluidos otro dueño, gerencia y consulta. Nunca a sí mismo
 *    (su propio PIN lo cambia en "Mi cuenta").
 *  - Gerencia (admin): solo a barberos y recepción. No a otro gerente, al dueño ni a consulta.
 *  - Consulta, recepción y barberos: a nadie.
 */
export function canManageAccount(actor: BusinessRole, target: BusinessRole): boolean {
    if (actor === 'owner') return true;
    if (actor === 'admin') return target === 'barber' || target === 'receptionist' || target === 'cashier';
    return false;
}

/** Si la persona puede administrar accesos de alguien (para mostrar los botones). */
export function canManageAnyAccount(actor: BusinessRole): boolean {
    return actor === 'owner' || actor === 'admin';
}

/** Puestos que esta persona puede asignar al crear un acceso. */
export function assignableRoles(actor: BusinessRole): BusinessRole[] {
    const all: BusinessRole[] = ['barber', 'receptionist', 'admin', 'viewer', 'owner'];
    return all.filter((role) => canManageAccount(actor, role));
}
