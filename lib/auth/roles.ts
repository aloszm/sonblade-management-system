import type { BusinessRole } from '@/lib/auth/context';

/**
 * Quienes atienden el mostrador: cobran, abren y cierran caja.
 * `cashier` se conserva por compatibilidad; en el negocio el puesto se llama Recepcionista.
 * Aprobar descuentos NO está aquí: solo owner/admin (lo valida confirm_sale en la base).
 */
export const FRONT_DESK_ROLES: BusinessRole[] = ['owner', 'admin', 'cashier', 'receptionist'];

/** Dueño y gerencia: quienes CAMBIAN catálogo, equipo, pagos, cuadre, etc. */
export const MANAGEMENT_ROLES: BusinessRole[] = ['owner', 'admin'];

/**
 * Puestos de solo lectura. `viewer` (se muestra como "Consulta") ve lo mismo que gerencia
 * y no puede cambiar nada. La regla vive en la base (RLS y funciones); aquí se repite
 * para que la API conteste 403 antes de llegar a la base.
 */
export const READ_ONLY_ROLES: BusinessRole[] = ['viewer'];

/** Para LEER lo que lee gerencia (paneles, reportes, cuadre, bitácora...). Nunca en métodos que escriben. */
export const MANAGEMENT_READ_ROLES: BusinessRole[] = [...MANAGEMENT_ROLES, ...READ_ONLY_ROLES];

/** Para LEER lo que lee el mostrador (caja, ventas, citas). Nunca en métodos que escriben. */
export const FRONT_DESK_READ_ROLES: BusinessRole[] = [...FRONT_DESK_ROLES, ...READ_ONLY_ROLES];

export function isReadOnlyRole(role: BusinessRole): boolean {
    return READ_ONLY_ROLES.includes(role);
}

/** Si el puesto puede cambiar algo en el sistema (cobrar, agendar, editar...). */
export function canWrite(role: BusinessRole): boolean {
    return !isReadOnlyRole(role);
}

/**
 * Para reglas de LECTURA escritas antes de existir el puesto de consulta (que preguntan por
 * 'owner'/'admin'): la consulta lee como gerencia. No usar para decidir escrituras.
 */
export function readerRole(role: BusinessRole): BusinessRole {
    return isReadOnlyRole(role) ? 'admin' : role;
}

/** Nombre del puesto que se muestra a la persona. */
export function roleTitle(role: BusinessRole): string {
    switch (role) {
        case 'owner': return 'Dueño';
        case 'admin': return 'Gerente';
        case 'viewer': return 'Consulta';
        case 'receptionist':
        case 'cashier': return 'Recepción';
        default: return 'Barbero';
    }
}

/** Rol "de pantalla" que usan el menú y las pantallas: consulta ve la vista de gerencia. */
export function screenRole(role: BusinessRole): 'admin' | 'recepcion' | 'barber' {
    if (role === 'owner' || role === 'admin' || role === 'viewer') return 'admin';
    if (role === 'receptionist' || role === 'cashier') return 'recepcion';
    return 'barber';
}
