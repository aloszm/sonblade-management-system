import type { NamedSite, Site } from '@/lib/hosts';

/**
 * Enrutamiento por sitio (función pura; la ejecuta middleware.ts).
 * Dado el sitio (ver lib/hosts.ts) y la ruta pedida, decide qué hacer:
 *  - pass:     sigue con la lógica interna del middleware (sesión, puestos). Solo en `all` y `admin`.
 *  - open:     se sirve tal cual, sin sesión (páginas y recursos públicos).
 *  - rewrite:  se sirve otra ruta internamente, sin cambiar la dirección.
 *  - redirect: 308 a la misma ruta en otro sitio (o en este, si `site` coincide).
 *  - notFound: 404.
 */
export type RouteDecision =
    | { kind: 'pass' }
    | { kind: 'open' }
    | { kind: 'rewrite'; pathname: string; search?: string }
    | { kind: 'redirect'; site: NamedSite; pathname: string; search: string }
    | { kind: 'notFound' };

/**
 * Primer segmento de cada pantalla del sistema interno (las que exigen sesión). En los sitios `public` y
 * `booking` se mandan a `admin.`. Una prueba compara esta lista con las carpetas de `app/` para que una
 * pantalla nueva no quede sin clasificar.
 */
export const INTERNAL_PREFIXES = [
    'admin', 'administracion', 'auth', 'barbero', 'barberos', 'caja', 'citas', 'clientes', 'comentarios', 'configuracion', 'cuadre',
    'equipo', 'equipo-hoy', 'gastos', 'inventario', 'liquidaciones', 'login', 'mi-cuenta', 'onboarding', 'pos',
    'productos', 'punto-de-equilibrio', 'reportes', 'servicios', 'sobres', 'ticket', 'ventas',
] as const;

/** Rutas públicas de la aplicación que no son del sistema interno (para la prueba de cobertura). */
export const PUBLIC_SEGMENTS = ['api', 'inicio', 'reservar', 'privacidad'] as const;

const STATIC_FILES = new Set([
    '/favicon.ico', '/manifest.json', '/sw.js', '/logo.png', '/logo-light.png', '/logo-dark.png', '/robots.txt', '/sitemap.xml',
]);

function isStaticAsset(pathname: string): boolean {
    return pathname.startsWith('/_next/') || pathname.startsWith('/icons/') || STATIC_FILES.has(pathname);
}

const isUnder = (pathname: string, base: string) => pathname === base || pathname.startsWith(`${base}/`);
const firstSegment = (pathname: string) => pathname.split('/')[1] ?? '';
const isInternalPath = (pathname: string) => (INTERNAL_PREFIXES as readonly string[]).includes(firstSegment(pathname));
const isOpenApi = (pathname: string) => isUnder(pathname, '/api/public') || pathname === '/api/health';

/** Quita la barra final (salvo en la raíz). */
export function stripTrailingSlash(pathname: string): string {
    return pathname.length > 1 && pathname.endsWith('/') ? pathname.slice(0, -1) : pathname;
}

/** Nombre corto de barbero en el enlace de citas: letras (con acentos), números, guion; hasta 40. */
export function barberSlug(pathname: string): string | null {
    const parts = pathname.split('/');
    if (parts.length !== 2 || !parts[1]) return null;
    let decoded: string;
    try { decoded = decodeURIComponent(parts[1]); } catch { return null; }
    return /^[\p{L}\p{N}_-]{1,40}$/u.test(decoded) ? decoded : null;
}

const redirect = (site: NamedSite, pathname: string, search: string): RouteDecision => ({ kind: 'redirect', site, pathname, search });

export function routeForSite(site: Site, rawPathname: string, search = ''): RouteDecision {
    const pathname = stripTrailingSlash(rawPathname);

    if (site === 'all') {
        return pathname === '/inicio' || pathname === '/robots.txt' || pathname === '/sitemap.xml' ? { kind: 'open' } : { kind: 'pass' };
    }

    if (site === 'admin') {
        if (pathname === '/robots.txt' || pathname === '/sitemap.xml') return { kind: 'open' };
        if (pathname === '/inicio') return redirect('public', '/', search);
        if (pathname === '/reservar') return redirect('booking', '/', search);
        if (pathname.startsWith('/reservar/')) return redirect('booking', pathname, search);
        return { kind: 'pass' };
    }

    // public y booking: nada pasa por la sesión; todo lo que no sea público se redirige o se niega.
    if (isStaticAsset(pathname) || isOpenApi(pathname)) return { kind: 'open' };
    if (pathname === '/api' || pathname.startsWith('/api/')) return { kind: 'notFound' };
    if (pathname === '/privacidad') return { kind: 'open' };
    if (isInternalPath(pathname)) return redirect('admin', pathname, search);

    if (site === 'public') {
        if (pathname === '/') return { kind: 'rewrite', pathname: '/inicio' };
        if (pathname === '/inicio') return redirect('public', '/', search);
        if (pathname === '/reservar') return redirect('booking', '/', search);
        if (pathname.startsWith('/reservar/')) return redirect('booking', pathname, search);
        return { kind: 'notFound' };
    }

    // booking
    if (pathname === '/') return { kind: 'rewrite', pathname: '/reservar', search };
    if (pathname === '/reservar' || pathname.startsWith('/reservar/')) return { kind: 'open' };
    if (pathname === '/inicio') return redirect('public', '/', search);
    const slug = barberSlug(pathname);
    if (slug) return { kind: 'rewrite', pathname: '/reservar', search: `?barbero=${encodeURIComponent(slug)}` };
    return { kind: 'notFound' };
}
