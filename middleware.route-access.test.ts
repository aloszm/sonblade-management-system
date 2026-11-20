// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

/**
 * Red de seguridad de las reglas de acceso por puesto del middleware. Se ejecuta con el middleware REAL
 * (sesión falsa por puesto) y compara con `ORACULO`: copia literal de la lógica que el middleware traía en línea
 * ANTES de extraerla a lib/auth/route-access.ts. Si alguien cambia un permiso a propósito, este archivo debe
 * actualizarse con la decisión; si cambia sin querer, falla aquí.
 */
let role = 'owner';
vi.mock('@supabase/ssr', () => ({
    createServerClient: () => ({
        auth: { getUser: async () => ({ data: { user: { id: 'u1' } } }) },
        from: () => {
            const chain: Record<string, unknown> = {};
            for (const name of ['select', 'eq', 'order']) chain[name] = () => chain;
            chain.limit = async () => ({ data: [{ business_id: 'b1', role, must_change_pin: false }] });
            return chain;
        },
    }),
}));

import { middleware } from './middleware';

const HOST = 'admin.barbergallo420.site';
beforeEach(() => {
    vi.stubEnv('NEXT_PUBLIC_SITE_DOMAIN', 'barbergallo420.site');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', 'https://example.supabase.co');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'x');
});
afterEach(() => vi.unstubAllEnvs());

async function visit(path: string): Promise<string> {
    const response = await middleware(new NextRequest(`https://${HOST}${path}`, { headers: { host: HOST } }));
    const location = response.headers.get('location');
    if (location) return `redirect ${new URL(location).pathname}`;
    return response.headers.get('x-middleware-next') ? 'next' : `status ${response.status}`;
}

const canSeePayReceipts = (r: string) => ['owner', 'admin', 'viewer'].includes(r);

/** Lógica original del middleware (antes de la extracción), tal cual. */
function ORACULO(r: string, pathname: string): string {
    const adminOnly = ['/admin', '/equipo', '/inventario', '/servicios', '/productos', '/gastos', '/sobres', '/reportes', '/cuadre', '/administracion', '/configuracion', '/ventas'];
    const frontDeskInventory = (r === 'receptionist' || r === 'cashier')
        && (pathname === '/inventario' || pathname.startsWith('/inventario/'));
    if (!frontDeskInventory && adminOnly.some((path) => pathname === path || pathname.startsWith(`${path}/`)) && !['owner', 'admin', 'viewer'].includes(r)) {
        if (pathname.startsWith('/api/')) return 'status 403';
        return 'redirect /pos';
    }
    const managerCanSee = pathname === '/configuracion/reservas' && r === 'admin';
    if ((pathname === '/configuracion' || pathname.startsWith('/configuracion/')) && r !== 'owner' && !managerCanSee) {
        return 'redirect /admin';
    }
    const isAdmin = r === 'owner' || r === 'admin' || r === 'viewer';
    const matches = (paths: string[]) => paths.some((path) => pathname === path || pathname.startsWith(`${path}/`));
    const notForRole = (!isAdmin && pathname === '/')
        || (r === 'barber' && matches(['/caja', '/pos', '/equipo-hoy']))
        || ((r === 'receptionist' || r === 'cashier') && matches(['/barberos']))
        || (r === 'viewer' && matches(['/pos', '/barbero']))
        || (!canSeePayReceipts(r) && matches(['/liquidaciones']));
    if (notForRole && !pathname.startsWith('/api/')) return `redirect ${r === 'barber' ? '/barbero' : r === 'viewer' ? '/' : '/pos'}`;
    return 'next';
}

const ROLES = ['owner', 'admin', 'viewer', 'receptionist', 'cashier', 'barber', 'rol-desconocido'];
const PATHS = [
    '/', '/barbero', '/barbero/x', '/pos', '/pos/x', '/caja', '/equipo-hoy', '/citas', '/clientes', '/clientes/abc', '/barberos', '/barberos/abc',
    '/liquidaciones', '/liquidaciones/abc', '/mi-cuenta', '/ticket/abc', '/ventas', '/ventas/historial', '/cuadre', '/administracion',
    '/gastos', '/sobres', '/inventario', '/inventario/x', '/servicios', '/productos', '/productos/x', '/equipo', '/reportes', '/reportes/verificar',
    '/admin', '/admin/auditoria', '/configuracion', '/configuracion/reservas', '/configuracion/estado', '/configuracion/quien-ve-que',
    // límites de prefijo: no deben confundirse
    '/equipo-hoyx', '/administracionx', '/inventarios', '/barberos-x', '/cajas', '/posx', '/configuracionx',
    // APIs: las guardas de página no las tocan (cada API valida su propio puesto)
    '/api/equipo', '/api/sales', '/api/liquidaciones', '/api/settlements',
];

describe('middleware: acceso por puesto igual al original', () => {
    for (const r of ROLES) {
        it.each(PATHS)(`${r} → %s`, async (path) => {
            role = r;
            expect(await visit(path)).toBe(ORACULO(r, path));
        });
    }
});
