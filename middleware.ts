import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import { jwtVerify } from 'jose'

const SECRET_KEY = new TextEncoder().encode(
    process.env.JWT_SECRET || 'sonblade-super-secret-key-32-chars-long-minimal'
);

export async function middleware(request: NextRequest) {
    const sessionToken = request.cookies.get('session')?.value;
    const { pathname } = request.nextUrl;

    // Public routes that do not require authentication
    if (
        pathname === '/login' ||
        pathname.startsWith('/api/auth') ||
        pathname === '/api/barbers' || // Needed for login dropdown
        pathname.startsWith('/_next') ||
        pathname.startsWith('/favicon.ico') ||
        pathname === '/manifest.json' ||
        pathname.includes('icons')
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
            return NextResponse.redirect(new URL('/pos', request.url));
        }

        // If trying to access root, redirect to POS or Admin
        if (pathname === '/') {
            return NextResponse.redirect(new URL(role === 'admin' ? '/admin' : '/pos', request.url));
        }

        return NextResponse.next();
    } catch (e) {
        // Invalid token
        return NextResponse.redirect(new URL('/login', request.url));
    }
}

export const config = {
    matcher: ['/((?!_next/static|_next/image|sw.js).*)'],
}
