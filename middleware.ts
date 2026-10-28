import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';

const PUBLIC_PATHS = ['/login', '/onboarding', '/auth/callback', '/api/auth/login', '/api/health'];
const NO_CACHE = { 'Cache-Control': 'no-store' };

export async function middleware(request: NextRequest) {
    let response = NextResponse.next({ request });
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) {
        if (PUBLIC_PATHS.some((path) => request.nextUrl.pathname === path || request.nextUrl.pathname.startsWith(`${path}/`))) return response;
        if (request.nextUrl.pathname.startsWith('/api/')) return NextResponse.json({ error: 'Supabase no está configurado.' }, { status: 503, headers: NO_CACHE });
        return NextResponse.redirect(new URL('/login?configuration=missing', request.url));
    }

    const supabase = createServerClient<Database>(url, key, {
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
        || pathname === '/sw.js' || pathname === '/logo.png' || pathname.startsWith('/icons/');

    if (!user && !isPublic) {
        if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No autenticado.' }, { status: 401, headers: NO_CACHE });
        return NextResponse.redirect(new URL('/login', request.url));
    }
    if (user && pathname === '/login') return NextResponse.redirect(new URL('/', request.url));

    if (user && !isPublic) {
        const { data: memberships } = await supabase.from('business_memberships')
            .select('business_id, role').eq('user_id', user.id).eq('is_active', true).order('created_at').limit(1);
        const membership = memberships?.[0];
        if (!membership) {
            if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'La cuenta no tiene un negocio asignado.' }, { status: 403, headers: NO_CACHE });
            return NextResponse.redirect(new URL('/onboarding', request.url));
        }
        const adminOnly = ['/admin', '/equipo', '/inventario', '/servicios', '/productos', '/gastos', '/reportes', '/configuracion'];
        if (adminOnly.some((path) => pathname === path || pathname.startsWith(`${path}/`)) && !['owner', 'admin'].includes(membership.role)) {
            if (pathname.startsWith('/api/')) return NextResponse.json({ error: 'No tienes permiso.' }, { status: 403, headers: NO_CACHE });
            return NextResponse.redirect(new URL('/', request.url));
        }
    }

    return response;
}

export const config = { matcher: ['/((?!_next/static|_next/image|sw.js).*)'] };

