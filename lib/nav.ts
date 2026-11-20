import {
    BarChart3, Banknote, Calendar, FileText, LayoutDashboard, Layers, Package, Scissors,
    Settings, ShoppingCart, Trophy, TrendingDown, UserCircle, UserPlus, Users, Wallet, Scale, PiggyBank, HandCoins,
    type LucideIcon,
} from 'lucide-react';

/**
 * Única fuente del menú por puesto. Lo usan el menú lateral, la barra inferior del celular
 * y la hoja "Más". Los nombres de pantalla son los mismos en todos lados (y en los títulos).
 */
export type ScreenRole = 'admin' | 'recepcion' | 'barber';
/** Cómo se ve el menú: la consulta (viewer) entra como 'admin' pero de solo lectura. */
export type NavProfile = 'admin' | 'viewer' | 'recepcion' | 'barber';

export interface NavUser {
    role: ScreenRole | string;
    isOwner?: boolean;
    readOnly?: boolean;
    mustChangePin?: boolean;
}

export interface NavItem {
    href: string;
    label: string;
    icon: LucideIcon;
    roles: ScreenRole[];
    ownerOnly?: boolean;
    /** Pantallas que solo sirven para escribir (cobrar) o propias de quien trabaja: la consulta no las ve. */
    writesOnly?: boolean;
}

export const NAV_SECTIONS: { title: string | null; items: NavItem[] }[] = [
    {
        title: null,
        items: [
            { href: '/', label: 'Panel', icon: LayoutDashboard, roles: ['admin'] },
            { href: '/barbero', label: 'Mi semana', icon: UserCircle, roles: ['barber', 'admin'], writesOnly: true },
            { href: '/pos', label: 'Cobro', icon: ShoppingCart, roles: ['admin', 'recepcion'], writesOnly: true },
            { href: '/caja', label: 'Caja', icon: Banknote, roles: ['admin', 'recepcion'] },
            { href: '/equipo-hoy', label: 'Barberos hoy', icon: Trophy, roles: ['admin', 'recepcion'] },
            { href: '/citas', label: 'Agenda', icon: Calendar, roles: ['admin', 'recepcion', 'barber'] },
            { href: '/clientes', label: 'Clientes', icon: UserPlus, roles: ['admin', 'recepcion', 'barber'] },
            { href: '/liquidaciones', label: 'Pago semanal', icon: Wallet, roles: ['admin', 'recepcion', 'barber'] },
        ],
    },
    {
        title: 'Negocio',
        items: [
            { href: '/ventas/historial', label: 'Ventas', icon: FileText, roles: ['admin'] },
            { href: '/cuadre', label: 'Cuadre', icon: Scale, roles: ['admin'] },
            { href: '/administracion', label: 'Finanzas', icon: PiggyBank, roles: ['admin'] },
            { href: '/gastos', label: 'Gastos', icon: TrendingDown, roles: ['admin'] },
            { href: '/sobres', label: 'Sobres', icon: HandCoins, roles: ['admin'] },
            { href: '/inventario', label: 'Inventario', icon: Package, roles: ['admin', 'recepcion'] },
            { href: '/servicios', label: 'Servicios', icon: Scissors, roles: ['admin'] },
            { href: '/equipo', label: 'Equipo', icon: Users, roles: ['admin'] },
            { href: '/reportes', label: 'Reportes', icon: BarChart3, roles: ['admin'] },
            { href: '/admin/auditoria', label: 'Bitácora', icon: Layers, roles: ['admin'] },
            { href: '/configuracion', label: 'Configuración', icon: Settings, roles: ['admin'], ownerOnly: true },
        ],
    },
];

export const ACCOUNT_ITEM = { href: '/mi-cuenta', label: 'Mi cuenta' } as const;

/** Atajos fijos de la barra inferior (4) por puesto; el resto va en "Más". */
export const QUICK_LINKS: Record<NavProfile, string[]> = {
    admin: ['/', '/citas', '/caja', '/administracion'],
    // El cobro se hace sobre todo en computadora: en el celular el mostrador usa Caja, Agenda, Barberos hoy y Clientes.
    recepcion: ['/caja', '/citas', '/equipo-hoy', '/clientes'],
    barber: ['/barbero', '/citas', '/clientes', '/liquidaciones'],
    viewer: ['/', '/citas', '/administracion', '/equipo-hoy'],
};

export function navProfile(user: NavUser | null): NavProfile | null {
    if (!user) return null;
    if (user.role === 'barber') return 'barber';
    if (user.role === 'recepcion') return 'recepcion';
    return user.readOnly ? 'viewer' : 'admin';
}

/** Todo el menú del puesto, en orden y por secciones. Con PIN temporal no hay menú (solo Mi cuenta y Salir). */
export function menuSections(user: NavUser | null): { title: string | null; items: NavItem[] }[] {
    if (!user || user.mustChangePin) return [];
    const allowed = (item: NavItem) => (item.roles as string[]).includes(user.role)
        && (!item.ownerOnly || Boolean(user.isOwner))
        && !(item.writesOnly && user.readOnly);
    return NAV_SECTIONS.map((s) => ({ title: s.title, items: s.items.filter(allowed) })).filter((s) => s.items.length > 0);
}

export function menuItems(user: NavUser | null): NavItem[] {
    return menuSections(user).flatMap((s) => s.items);
}

/** Los 4 atajos de la barra inferior. */
export function quickItems(user: NavUser | null): NavItem[] {
    const profile = navProfile(user);
    if (!profile || user?.mustChangePin) return [];
    const all = menuItems(user);
    return QUICK_LINKS[profile].map((href) => all.find((i) => i.href === href)).filter((i): i is NavItem => Boolean(i));
}

/** Lo que abre "Más": el resto del menú del puesto, por secciones. */
export function moreSections(user: NavUser | null): { title: string | null; items: NavItem[] }[] {
    const quick = new Set(quickItems(user).map((i) => i.href));
    return menuSections(user).map((s) => ({ title: s.title, items: s.items.filter((i) => !quick.has(i.href)) })).filter((s) => s.items.length > 0);
}

/** Título de cada pantalla: igual en menú, barra inferior, encabezado y <h1>. */
export const PAGE_TITLES: Record<string, string> = {
    '/': 'Panel',
    '/barbero': 'Mi semana',
    '/pos': 'Cobro',
    '/ventas/historial': 'Ventas',
    '/inventario': 'Inventario',
    '/caja': 'Caja',
    '/gastos': 'Gastos',
    '/sobres': 'Sobres',
    '/citas': 'Agenda',
    '/clientes': 'Clientes',
    '/servicios': 'Servicios',
    '/equipo': 'Equipo',
    '/liquidaciones': 'Pago semanal',
    '/reportes': 'Reportes',
    '/cuadre': 'Cuadre',
    '/administracion': 'Finanzas',
    '/equipo-hoy': 'Barberos hoy',
    '/reportes/verificar': 'Verificar reporte',
    '/admin': 'Administración',
    '/admin/auditoria': 'Bitácora',
    '/configuracion': 'Configuración',
    '/mi-cuenta': 'Mi cuenta',
};
