// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Sesión falsa por puesto: el middleware lee el puesto de business_memberships.
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
    return location ? `redirect ${new URL(location).pathname}` : 'next';
}

const ID = '/liquidaciones/9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';

describe('Recibos de pago en el middleware (decisión temporal del dueño, 20 nov 2026)', () => {
    it.each(['owner', 'admin', 'viewer'])('%s entra a /liquidaciones y a un recibo', async (r) => {
        role = r;
        expect(await visit('/liquidaciones')).toBe('next');
        expect(await visit(ID)).toBe('next');
    });

    it('el barbero se redirige a Mi semana', async () => {
        role = 'barber';
        expect(await visit('/liquidaciones')).toBe('redirect /barbero');
        expect(await visit(ID)).toBe('redirect /barbero');
        // Lo demás de su pantalla sigue abierto.
        expect(await visit('/barbero')).toBe('next');
    });

    it.each(['receptionist', 'cashier'])('%s se redirige al cobro', async (r) => {
        role = r;
        expect(await visit('/liquidaciones')).toBe('redirect /pos');
        expect(await visit(ID)).toBe('redirect /pos');
        expect(await visit('/barbero')).toBe('next');
    });
});
