import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let role = 'owner';
vi.mock('@/lib/auth/context', () => ({
    requireAuthContext: async () => ({ userId: 'u1', businessId: 'b1', branchId: 'br1', role }),
    authErrorResponse: () => Response.json({ error: 'x' }, { status: 500 }),
}));
const ROWS = [{ id: 'e1', display_name: 'Barbero Uno', display_title: null, phone: '5559876543', is_active: true, is_barber: true, user_id: null, can_authorize_discounts: false }];
vi.mock('@/lib/supabase/server', () => {
    const chain: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'order']) chain[name] = () => chain;
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: ROWS, error: null });
    return { createSupabaseServerClient: async () => ({ from: () => chain }) };
});

import { GET } from './route';

const req = () => new NextRequest(new URL('/api/barbers', 'http://localhost'));
beforeEach(() => { role = 'owner'; });

describe('GET /api/barbers: teléfono del personal por puesto', () => {
    it.each(['owner', 'admin', 'viewer'])('%s recibe el teléfono', async (r) => {
        role = r;
        const body = await (await GET(req())).json();
        expect(body[0].phone).toBe('5559876543');
    });
    it.each(['receptionist', 'cashier', 'barber'])('%s recibe la lista sin teléfono', async (r) => {
        role = r;
        const res = await GET(req());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body[0]).toMatchObject({ id: 'e1', name: 'Barbero Uno', phone: null });
        expect(JSON.stringify(body)).not.toContain('5559876543');
    });
});
