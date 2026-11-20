import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';
import { SESSION_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options';
import { isCrossOriginWrite } from '@/lib/security/origin';
import { siteFromHost, siteOrigin, type Site } from '@/lib/hosts';
import { routeForSite } from '@/lib/site-routing';

// /reservar, /privacidad y /api/public son la puerta de reservas para clientes: sin sesión a propósito; la base valida todo.
const PUBLIC_PATHS = ['/login', '/onboarding', '/auth/callback', '/api/auth/login', '/api/health', '/api/public', '/reservar', '/privacidad'];
const NO_CACHE = { 'Cache-Control': 'no-store' };

/**
 * Entrada del middleware. Primero se decide por sitio (dominio): página pública, citas, admin o "todo junto"
 * (lib/hosts.ts y lib/site-routing.ts). Lo que queda en `pass` sigue con la lógica interna de sesión y puestos.
 */
export async function middleware(request: NextRequest) {
    // Escrituras a la API desde otro sitio (CSRF): si el navegador dice de dónde viene y no es este host, se rechaza.
    if (isCrossOriginWrite(request.method, request.nextUrl.pathname, request.headers.get('origin'), request.headers.get('host'))) {
        return NextResponse.json({ error: 'Origen no permitido.' }, { status: 403, headers: NO_CACHE });
    }
    const site = siteFromHost(request.headers.get('host'));
    const response = await routeBySite(request, site);
    // El sistema interno no se indexa en buscadores.
    if (site === 'admin') response.headers.set('X-Robots-Tag', 'noindex, nofollow');
    return response;
}

async function routeBySite(request: NextRequest, site: Site): Promise<NextResponse> {
    const decision = routeForSite(site, request.nextUrl.pathname, request.nextUrl.search);
    switch (decision.kind) {
        case 'pass':
            return internalMiddleware(request);
        case 'open':
            return NextResponse.next({ request });
        case 'rewrite': {
            const target = request.nextUrl.clone();
            target.pathname = decision.pathname;
            target.search = decision.search ?? '';
            return NextResponse.rewrite(target);
        }
        case 'redirect': {
            const origin = decision.site === site ? request.nextUrl.origin : siteOrigin(decision.site);
            if (!origin) return notFound(request);
            return NextResponse.redirect(new URL(`${decision.pathname}${decision.search}`, origin), 308);
        }
        default:
            return notFound(request);
    }
}

function notFound(request: NextRequest): NextResponse {
    const target = request.nextUrl.clone();
    target.pathname = '/_sitio-no-encontrado';
    target.search = '';
    return NextResponse.rewrite(target, { status: 404 });
}

async function internalMiddleware(request: NextRequest): Promise<NextResponse> {
    let response = NextResponse.next({ request });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        if (PUBLIC_PATHS.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`))) return response;
        if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 503, headers: NO_CACHE });
        return NextResponse.redirect(new URL('/login?configuration=missing', request.url));
    }

    const supabase = createServerClient<Database>(url, key, {
        cookieOptions: SESSION_COOKIE_OPTIONS,
        cookies: {
            getAll: () => request.cookies.getAll(),
            setAll: (cookiesToSet) => {
                cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
                response = NextResponse.next({ request });
                cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
            },
        },
    });
    const { data: { user } } = await supabase.auth.getUser();
    const pathname = request.nextUrl.pathname;
    const isPublic = PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))
        || pathname.startsWith('/_next/') || pathname === '/favicon.ico' || pathname === '/manifest.json'
        || pathname === '/sw.js' || pathname === '/logo.png' || pathname === '/logo-light.png' || pathname === '/logo-dark.png' || pathname.startsWith('/icons/');

    if (!user && !isPublic) {
        if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autenticado.' }, { status: 401, headers: NO_CACHE });
        return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user && pathname === '/login') return NextResponse.redirect(new URL('/', request.url));

    if (user && !isPublic) {
        const { data: memberships } = await supabase.from('business_memberships')
            .select('business_id, role, must_change_pin').eq('user_id', user.id).eq('is_active', true).order('created_at').limit(1);
        const membership = memberships?.[0];
        if (!membership) {
            if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'La cuenta no tiene un negocio asignado.' }, { status: 403, headers: NO_CACHE });
            return NextResponse.redirect(new URL('/onboarding', request.url));
        }
        // PIN temporal (cuenta nueva o restablecida): antes de usar la app hay que cambiarlo en "Mi cuenta".
        const pinPaths = ['/mi-cuenta', '/api/auth/', '/api/account/pin'];
        if (membership.must_change_pin && !pinPaths.some((path) => pathname === path || pathname.startsWith(path))) {
            if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'Debes cambiar tu PIN temporal antes de continuar.' }, { status: 403, headers: NO_CACHE });
            return NextResponse.redirect(new URL('/mi-cuenta', request.url));
        }

        const adminOnly = ['/admin', '/equipo', '/inventario', '/servicios', '/productos', '/gastos', '/sobres', '/reportes', '/cuadre', '/administracion', '/configuracion', '/ventas'];
        // Recepción y caja entran a Inventario para registrar entradas de mercancía (decisión del dueño, 19 nov 2026).
        const frontDeskInventory = (membership.role === 'receptionist' || membership.role === 'cashier')
            && (pathname === '/inventario' || pathname.startsWith('/inventario/'));
        if (!frontDeskInventory && adminOnly.some((path) => pathname === path || pathname.startsWith(`${path}/`)) && !['owner', 'admin', 'viewer'].includes(membership.role)) {
            if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No tienes permiso.' }, { status: 403, headers: NO_CACHE });
            return NextResponse.redirect(new URL('/pos', request.url));
        }

        // Configuración del negocio (datos, comisiones, fondo de caja): solo el dueño.
        if ((pathname === '/configuracion' || pathname.startsWith('/configuracion/')) && membership.role !== 'owner') {
            return NextResponse.redirect(new URL('/admin', request.url));
        }

        // Pantallas que no corresponden al puesto: se manda al Punto de Venta. Las APIs validan su propio rol.
        const role = membership.role;
        // La consulta (viewer) ve las pantallas de gerencia en modo de solo lectura; no cobra ni tiene "Mi semana".
        const isAdmin = role === 'owner' || role === 'admin' || role === 'viewer';
        const matches = (paths: string[]) => paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
        const notForRole = (!isAdmin && pathname === '/')
            || (role === 'barber' && matches(['/caja', '/pos', '/equipo-hoy']))
            || ((role === 'receptionist' || role === 'cashier') && matches(['/barbero', '/barberos']))
            || (role === 'viewer' && matches(['/pos', '/barbero']));
        if (notForRole && !pathname.startsWith('/api/')) return NextResponse.redirect(new URL(role === 'barber' ? '/barbero' : role === 'viewer' ? '/' : '/pos', request.url));
    }

    return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|sw.js).*)'] };

