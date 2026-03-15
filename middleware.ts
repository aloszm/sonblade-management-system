import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

if (!process.env.JWT_SECRET) {
    throw new Error('JWT_SECRET environment variable is required');
}

const SECRET_KEY = new TextEncoder().encode(process.env.JWT_SECRET);

export async function middleware(request: NextRequest) {
    const sessionToken = request.cookies.get('session')?.value;
    const { pathname } = request.nextUrl;

    // Public routes that do not require authentication
    if (
        pathname === '/login' ||
        pathname.startsWith('/api/auth') ||
        pathname === '/api/barbers' || // Needed for login dropdown
        pathname === '/api/receptionists' || // Needed for login dropdown
        pathname.startsWith('/_next') ||
        pathname === '/favicon.ico' ||
        pathname === '/manifest.json' ||
        pathname === '/sw.js' ||
        pathname === '/logo.png' ||
        pathname.startsWith('/icons')
    ) {
        return NextResponse.next();
    }

    if (!sessionToken) {
        return NextResponse.redirect(new URL('/login', request.url));
    }

    try {
        const { payload } = await jwtVerify(sessionToken, SECRET_KEY);
        // Payload has { id, name, role }
        const role = payload.role as string;

        // Admin-only routes
        const adminRoutes = ['/admin', '/equipo', '/inventario'];
        if (role !== 'admin' && adminRoutes.some(r => pathname.startsWith(r))) {
            const fallback = role === 'recepcion' ? '/clientes' : '/pos';
            return NextResponse.redirect(new URL(fallback, request.url));
        }

        // Receptionist: restrict to their allowed pages
        const recepcionAllowed = ['/clientes', '/caja', '/citas'];
        if (role === 'recepcion' && !recepcionAllowed.some(r => pathname.startsWith(r))) {
            return NextResponse.redirect(new URL('/clientes', request.url));
        }

        // If trying to access root, redirect non-admins appropriately
        if (pathname === '/') {
            if (role === 'recepcion') return NextResponse.redirect(new URL('/clientes', request.url));
            if (role !== 'admin') return NextResponse.redirect(new URL('/pos', request.url));
        }

        return NextResponse.next();
    } catch (_e) {
        // Invalid token
        return NextResponse.redirect(new URL('/login', request.url));
    }
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|sw.js).*)'],
}
