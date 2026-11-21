import { canSeePayReceipts } from '@/lib/auth/roles';

/**
 * Quién entra a qué pantalla. Es la ÚNICA fuente de las guardas de página: la aplica middleware.ts y la lee la
 * pantalla Configuración → «Quién ve qué» (por eso esa pantalla no puede desactualizarse). Función pura, sin
 * sesión ni base. Las APIs no pasan por aquí: cada una valida su propio puesto con lib/auth/roles.ts.
 *
 * Recibe el puesto interno (owner, admin, viewer, receptionist, cashier, barber) y la ruta.
 */

/** Pantallas de dirección: gerencia y consulta además de la cuenta principal. Los demás puestos van al cobro. */
export const ADMIN_ONLY_PATHS = ['/admin', '/equipo', '/inventario', '/servicios', '/productos', '/gastos', '/sobres', '/reportes', '/cuadre', '/administracion', '/punto-de-equilibrio', '/configuracion', '/ventas'];

/** Puestos que entran a las pantallas de dirección. */
const ADMIN_AREA_ROLES = ['owner', 'admin', 'viewer'];

/** Configuración del negocio: solo la cuenta principal. */
export const CONFIG_PATH = '/configuracion';
/** Excepción: la gerencia puede VER «Reservas en línea» (solo lectura para ella; cambiar exige la cuenta principal y su PIN). */
export const MANAGER_CONFIG_PATH = '/configuracion/reservas';

export type RouteVerdict =
    | { allowed: true }
    /** `reason`: 'admin-only' = pantalla de dirección; 'owner-only' = Configuración; 'role' = no corresponde a su puesto. */
    | { allowed: false; reason: 'admin-only' | 'owner-only' | 'role'; redirectTo: string };

const matches = (pathname: string, paths: string[]) => paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));

/** A dónde se manda a quien entra a una pantalla que no es de su puesto (desde las pantallas de puesto). */
function homeFor(role: string): string {
    return role === 'barber' ? '/barbero' : role === 'viewer' ? '/' : '/pos';
}

/**
 * Decide si el puesto entra a la ruta y, si no, a dónde se le manda. El orden de las reglas es el del middleware:
 * pantallas de dirección → Configuración → pantallas que no corresponden al puesto.
 */
export function routeVerdict(role: string, pathname: string): RouteVerdict {
    // Recepción y caja entran a Inventario para registrar entradas de mercancía (decisión del dueño, 19 nov 2026).
    const frontDeskInventory = (role === 'receptionist' || role === 'cashier')
        && (pathname === '/inventario' || pathname.startsWith('/inventario/'));
    if (!frontDeskInventory && matches(pathname, ADMIN_ONLY_PATHS) && !ADMIN_AREA_ROLES.includes(role)) {
        return { allowed: false, reason: 'admin-only', redirectTo: '/pos' };
    }

    // Configuración del negocio (datos, comisiones, fondo de caja): solo el dueño. Excepción: la gerencia puede VER
    // «Reservas en línea».
    const managerCanSee = pathname === MANAGER_CONFIG_PATH && role === 'admin';
    if ((pathname === CONFIG_PATH || pathname.startsWith(`${CONFIG_PATH}/`)) && role !== 'owner' && !managerCanSee) {
        return { allowed: false, reason: 'owner-only', redirectTo: '/admin' };
    }

    // Pantallas que no corresponden al puesto: se manda al Punto de Venta (o a su pantalla). Las APIs validan su propio rol.
    // La consulta (viewer) ve las pantallas de gerencia en solo lectura; no cobra ni tiene «Mi semana».
    const isAdmin = ADMIN_AREA_ROLES.includes(role);
    const notForRole = (!isAdmin && pathname === '/')
        || (role === 'barber' && matches(pathname, ['/caja', '/pos', '/equipo-hoy']))
        // Recepción entra a «Mi semana» (/barbero) para ver SU sueldo y comisiones; la ficha de otros barberos (/barberos) no.
        || ((role === 'receptionist' || role === 'cashier') && matches(pathname, ['/barberos']))
        || (role === 'viewer' && matches(pathname, ['/pos', '/barbero']))
        // Recibos de pago: solo owner, admin y consulta (decisión temporal del dueño, 20 nov 2026; ver canSeePayReceipts).
        || (!canSeePayReceipts(role) && matches(pathname, ['/liquidaciones']));
    if (notForRole && !pathname.startsWith('/api/')) return { allowed: false, reason: 'role', redirectTo: homeFor(role) };

    // /comentarios (Comentarios y sugerencias) no está en ninguna lista a propósito: entran TODOS los puestos, consulta
    // incluida. Quién ve los comentarios de todos lo decide la API y la base (solo la cuenta principal).

    return { allowed: true };
}

/** ¿Entra este puesto a esta ruta? Misma lógica que aplica el middleware. */
export function canEnter(role: string, pathname: string): boolean {
    return routeVerdict(role, pathname).allowed;
}
