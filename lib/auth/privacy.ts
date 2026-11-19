import type { BusinessRole } from '@/lib/auth/context';
import { FRONT_DESK_READ_ROLES, MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';

/**
 * Quién recibe teléfonos desde la API (se decide en el servidor, no ocultando en pantalla).
 *  - Teléfono del personal: gerencia y la cuenta de consulta (que ve la pantalla de Equipo como gerencia).
 *    Recepción y barberos no lo reciben: no lo necesitan para su trabajo.
 *  - Teléfono del cliente en las citas: mostrador (recepción, cajero), gerencia, dueño y consulta.
 *    El barbero no lo recibe; ve el nombre y la hora de sus citas.
 */
export function canSeeStaffPhones(role: BusinessRole): boolean {
    return MANAGEMENT_READ_ROLES.includes(role);
}

export function canSeeClientPhones(role: BusinessRole): boolean {
    return FRONT_DESK_READ_ROLES.includes(role);
}
