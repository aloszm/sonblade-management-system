import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let role = 'owner';
vi.mock('@/lib/auth/context', async () => {
    class AuthorizationError extends Error {
        constructor(message = 'No tienes permiso para esta operación.', public status = 403) { super(message); }
    }
    return {
        AuthorizationError,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(role)) throw new AuthorizationError();
            return { userId: 'u1', businessId: 'b1', branchId: 'br1', role };
        },
        authErrorResponse: (error: unknown) => error instanceof AuthorizationError
            ? Response.json({ error: error.message }, { status: error.status })
            : Response.json({ error: 'x' }, { status: 500 }),
    };
});

const rpc = vi.fn(async () => ({ data: {}, error: null }));
let stored: string | null = null;
vi.mock('@/lib/supabase/server', () => {
    const chain: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'update']) chain[name] = () => chain;
    chain.maybeSingle = async () => ({ data: { id: '11111111-1111-4111-8111-111111111111', display_name: 'Sonia', display_title: stored, phone: null, is_active: true, can_authorize_discounts: false }, error: null });
    return { createSupabaseServerClient: async () => ({ from: () => chain, rpc }) };
});

import { PATCH } from './[id]/route';

const ID = '11111111-1111-4111-8111-111111111111';
const patch = (body: unknown) => PATCH(
    new NextRequest(new URL(`/api/barbers/${ID}`, 'http://localhost'), { method: 'PATCH', body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } }),
    { params: Promise.resolve({ id: ID }) },
);

beforeEach(() => { role = 'owner'; stored = null; rpc.mockClear(); });

describe('PATCH /api/barbers/[id]: título visible por puesto', () => {
    it('la cuenta principal lo cambia por la función de la base', async () => {
        const res = await patch({ display_title: '  Gerente Barbera ' });
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith('set_employee_display_title', { p_employee_id: ID, p_title: 'Gerente Barbera' });
    });

    it('la cuenta principal lo quita con vacío o null', async () => {
        stored = 'Gerente Barbera';
        expect((await patch({ display_title: '' })).status).toBe(200);
        expect(rpc).toHaveBeenLastCalledWith('set_employee_display_title', { p_employee_id: ID, p_title: '' });
        expect((await patch({ display_title: null })).status).toBe(200);
        expect(rpc).toHaveBeenCalledTimes(2);
    });

    it('gerencia recibe 403 y no llega a la base', async () => {
        role = 'admin';
        const res = await patch({ display_title: 'Directora' });
        expect(res.status).toBe(403);
        expect((await res.json()).error).toMatch(/cuenta principal/);
        expect(rpc).not.toHaveBeenCalled();
    });

    it('gerencia puede seguir guardando la ficha si el título no cambia', async () => {
        role = 'admin'; stored = 'Gerente Barbera';
        expect((await patch({ name: 'Sonia', display_title: 'Gerente Barbera' })).status).toBe(200);
        expect(rpc).not.toHaveBeenCalled();
    });

    it.each(['receptionist', 'cashier', 'barber', 'viewer'])('%s no puede editar empleados', async (r) => {
        role = r;
        expect((await patch({ display_title: 'Barbera' })).status).toBe(403);
        expect(rpc).not.toHaveBeenCalled();
    });

    it.each([['A'], ['x'.repeat(41)], ['Gerente\nBarbera']])('rechaza título inválido %j', async (title) => {
        const res = await patch({ display_title: title });
        expect(res.status).toBe(400);
        expect(rpc).not.toHaveBeenCalled();
    });
});
