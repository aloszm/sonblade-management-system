import { PAGE_TITLES } from '@/lib/nav';
import { canEnter } from '@/lib/auth/route-access';

/**
 * Inventario de las pantallas internas (con sesión) para Configuración → «Quién ve qué».
 * Aquí solo se LISTAN las pantallas y se agrupan; si un puesto entra o no lo decide `canEnter`
 * (lib/auth/route-access.ts, la misma regla del middleware). Una prueba compara esta lista con las carpetas de `app/`:
 * si alguien crea una pantalla nueva y no la agrega aquí, la prueba falla.
 */
export interface Screen {
    /** Ruta tal como es la carpeta de Next (con [id] en las dinámicas). */
    route: string;
    /** Ruta de ejemplo para preguntarle a `canEnter` en las dinámicas. */
    sample: string;
    group: string;
    title: string;
}

const t = (route: string, fallback: string) => PAGE_TITLES[route] ?? fallback;

export const SCREEN_GROUPS = ['Día a día', 'Negocio', 'Configuración y cuenta'] as const;

export const SCREENS: Screen[] = [
    { route: '/', sample: '/', group: 'Día a día', title: t('/', 'Panel') },
    { route: '/barbero', sample: '/barbero', group: 'Día a día', title: t('/barbero', 'Mi semana') },
    { route: '/pos', sample: '/pos', group: 'Día a día', title: t('/pos', 'Cobro') },
    { route: '/caja', sample: '/caja', group: 'Día a día', title: t('/caja', 'Caja') },
    { route: '/equipo-hoy', sample: '/equipo-hoy', group: 'Día a día', title: t('/equipo-hoy', 'Barberos hoy') },
    { route: '/citas', sample: '/citas', group: 'Día a día', title: t('/citas', 'Agenda') },
    { route: '/clientes', sample: '/clientes', group: 'Día a día', title: t('/clientes', 'Clientes') },
    { route: '/clientes/[id]', sample: '/clientes/ejemplo', group: 'Día a día', title: 'Ficha de un cliente' },
    { route: '/barberos/[id]', sample: '/barberos/ejemplo', group: 'Día a día', title: 'Ficha de un barbero' },
    { route: '/ticket/[id]', sample: '/ticket/ejemplo', group: 'Día a día', title: 'Ticket de una venta' },
    { route: '/liquidaciones', sample: '/liquidaciones', group: 'Día a día', title: t('/liquidaciones', 'Pago semanal') },
    { route: '/liquidaciones/[id]', sample: '/liquidaciones/ejemplo', group: 'Día a día', title: 'Recibo de pago' },

    { route: '/ventas/historial', sample: '/ventas/historial', group: 'Negocio', title: t('/ventas/historial', 'Ventas') },
    { route: '/cuadre', sample: '/cuadre', group: 'Negocio', title: t('/cuadre', 'Cuadre') },
    { route: '/administracion', sample: '/administracion', group: 'Negocio', title: t('/administracion', 'Finanzas') },
    { route: '/punto-de-equilibrio', sample: '/punto-de-equilibrio', group: 'Negocio', title: t('/punto-de-equilibrio', 'Punto de equilibrio') },
    { route: '/gastos', sample: '/gastos', group: 'Negocio', title: t('/gastos', 'Gastos') },
    { route: '/sobres', sample: '/sobres', group: 'Negocio', title: t('/sobres', 'Sobres') },
    { route: '/inventario', sample: '/inventario', group: 'Negocio', title: t('/inventario', 'Inventario') },
    { route: '/servicios', sample: '/servicios', group: 'Negocio', title: t('/servicios', 'Servicios') },
    { route: '/equipo', sample: '/equipo', group: 'Negocio', title: t('/equipo', 'Equipo') },
    { route: '/reportes', sample: '/reportes', group: 'Negocio', title: t('/reportes', 'Reportes') },
    { route: '/reportes/verificar', sample: '/reportes/verificar', group: 'Negocio', title: t('/reportes/verificar', 'Verificar reporte') },
    { route: '/admin', sample: '/admin', group: 'Negocio', title: t('/admin', 'Administración') },
    { route: '/admin/auditoria', sample: '/admin/auditoria', group: 'Negocio', title: t('/admin/auditoria', 'Bitácora') },

    { route: '/configuracion', sample: '/configuracion', group: 'Configuración y cuenta', title: t('/configuracion', 'Configuración') },
    { route: '/configuracion/reservas', sample: '/configuracion/reservas', group: 'Configuración y cuenta', title: t('/configuracion/reservas', 'Reservas en línea') },
    { route: '/configuracion/estado', sample: '/configuracion/estado', group: 'Configuración y cuenta', title: 'Estado del sistema' },
    { route: '/configuracion/quien-ve-que', sample: '/configuracion/quien-ve-que', group: 'Configuración y cuenta', title: t('/configuracion/quien-ve-que', 'Quién ve qué') },
    { route: '/mi-cuenta', sample: '/mi-cuenta', group: 'Configuración y cuenta', title: t('/mi-cuenta', 'Mi cuenta') },
    { route: '/comentarios', sample: '/comentarios', group: 'Configuración y cuenta', title: t('/comentarios', 'Comentarios') },
];

/**
 * Páginas de `app/` que NO son pantallas internas (no llevan menú ni puesto): la entrada, el alta del negocio y el
 * sitio público/reservas de clientes. La prueba exige que toda otra página esté en SCREENS.
 */
export const PUBLIC_PAGE_ROUTES = ['/login', '/onboarding', '/inicio', '/privacidad', '/reservar', '/reservar/[token]'];

/** Las pantallas de un grupo con el veredicto de un puesto: entra o no entra (decide `canEnter`). */
export function screensFor(role: string): { group: string; screens: (Screen & { enters: boolean })[] }[] {
    return SCREEN_GROUPS.map((group) => ({
        group,
        screens: SCREENS.filter((s) => s.group === group).map((s) => ({ ...s, enters: canEnter(role, s.sample) })),
    }));
}
