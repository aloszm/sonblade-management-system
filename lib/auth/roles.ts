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

/**
 * Quién puede ver los RECIBOS DE PAGO semanales (pantalla /liquidaciones, recibo, historial y sus API).
 * Decisión temporal del dueño (20 nov 2026): solo la cuenta principal (owner), gerencia (admin) y consulta (viewer).
 * Para devolverles sus recibos a barberos y recepción, basta incluir barber, receptionist y cashier aquí.
 */
export const PAY_RECEIPT_ROLES: BusinessRole[] = ['owner', 'admin', 'viewer'];

/**
 * Único punto de verdad de la regla anterior. Acepta el puesto interno (owner, admin, viewer, receptionist, cashier,
 * barber) o el rol de pantalla que entrega /api/auth/me ('admin' = dueño, gerencia y consulta; 'recepcion'; 'barber').
 * Sin puesto conocido: no.
 */
export function canSeePayReceipts(role: BusinessRole | 'recepcion' | string | null | undefined): boolean {
    return typeof role === 'string' && (PAY_RECEIPT_ROLES as string[]).includes(role);
}

/**
 * Quién puede ver el COSTO de producto de una venta y lo que le queda a la barbería (desglose de la venta).
 * Cuenta principal, gerencia y consulta. Recepción y barbero no: el costo está cerrado para ellos también en la base
 * (public.product_costs). Único punto de verdad: la ruta del desglose decide aquí qué columnas lee y qué entrega.
 */
export const SALE_COST_ROLES: BusinessRole[] = MANAGEMENT_READ_ROLES;

export function canSeeSaleCost(role: BusinessRole): boolean {
    return SALE_COST_ROLES.includes(role);
}

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

/**
 * Nombres visibles de los puestos: el ÚNICO lugar donde se traduce el puesto interno a texto.
 * Por dentro `owner` conserva todos sus permisos, pero en pantalla se lee "Gerente" igual que `admin`;
 * a quien es `owner` se le distingue con la insignia "Cuenta principal" (ver isPrimaryAccount).
 */
export const ROLE_TITLES: Record<BusinessRole, string> = {
    owner: 'Gerente',
    admin: 'Gerente',
    viewer: 'Consulta',
    receptionist: 'Recepción',
    cashier: 'Recepción',
    barber: 'Barbero',
};

/** Término de pantalla para la cuenta `owner` en mensajes de permiso: "Solo la cuenta principal puede cambiar comisiones". */
export const PRIMARY_ACCOUNT_LABEL = 'cuenta principal';
/** Insignia discreta que distingue a la cuenta principal en las listas del equipo. */
export const PRIMARY_ACCOUNT_BADGE = 'Cuenta principal';

/** Si la cuenta es la principal (`owner`): la que lleva la insignia. */
export function isPrimaryAccount(role: BusinessRole | string | null | undefined): boolean {
    return role === 'owner';
}

/** Nombre del puesto que se muestra a la persona. */
export function roleTitle(role: BusinessRole): string {
    return ROLE_TITLES[role] ?? ROLE_TITLES.barber;
}

/** Largo permitido del título visible (igual que la restricción de la base). */
export const DISPLAY_TITLE_MIN = 2;
export const DISPLAY_TITLE_MAX = 40;

/**
 * Cómo se lee el puesto de UNA persona: su título visible (`employees.display_title`, p. ej.
 * "Gerente Barbera") si lo tiene; si no, la etiqueta del puesto. Solo texto: no cambia permisos.
 * Las cuentas sin fila de empleado (dueño, consulta) no tienen título propio.
 */
export function personTitle({ role, displayTitle }: { role: BusinessRole; displayTitle?: string | null }): string {
    const custom = typeof displayTitle === 'string' ? displayTitle.trim() : '';
    return custom.length >= DISPLAY_TITLE_MIN ? custom : roleTitle(role);
}

/**
 * Título de la sesión que entrega /api/auth/me (menú, encabezado, Mi cuenta). Usa personTitle con el
 * puesto interno y el título visible; si la respuesta no trae el puesto, usa el `title` ya calculado.
 */
export function sessionTitle(user: { businessRole?: BusinessRole | null; display_title?: string | null; title?: string | null } | null | undefined): string {
    if (!user) return '';
    if (user.businessRole) return personTitle({ role: user.businessRole, displayTitle: user.display_title });
    return user.title ?? '';
}

/** Texto de una opción de puesto en un selector: distingue `owner` de `admin`, que se leen igual. */
export function roleOptionLabel(role: BusinessRole): string {
    return isPrimaryAccount(role) ? `${roleTitle(role)} (${PRIMARY_ACCOUNT_LABEL})` : roleTitle(role);
}

/** Etiqueta para un puesto que llega como texto suelto (bitácora, reportes): cubre además 'system' y los nombres de pantalla. */
export function roleLabel(role: string | null | undefined): string {
    if (!role) return '—';
    if (role === 'system') return 'Sistema';
    if (role === 'recepcion') return ROLE_TITLES.receptionist;
    if (role === 'barbero') return ROLE_TITLES.barber;
    return (ROLE_TITLES as Record<string, string>)[role] ?? role;
}

/** Rol "de pantalla" que usan el menú y las pantallas: consulta ve la vista de gerencia. */
export function screenRole(role: BusinessRole): 'admin' | 'recepcion' | 'barber' {
    if (role === 'owner' || role === 'admin' || role === 'viewer') return 'admin';
    if (role === 'receptionist' || role === 'cashier') return 'recepcion';
    return 'barber';
}
