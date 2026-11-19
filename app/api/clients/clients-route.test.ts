// C1: rutas de clientes con resumen, historial y activar/desactivar, por puesto.
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let role = 'receptionist';
vi.mock('@/lib/auth/context', () => {
    class AuthorizationError extends Error { constructor(message = 'No tienes permiso para esta operación.', public status = 403) { super(message); } }
    return {
        AuthorizationError,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(role)) throw new AuthorizationError();
            return { userId: 'u1', businessId: 'b1', branchId: 'br1', role };
        },
        authErrorResponse: (error: { status?: number; message: string }) => Response.json({ error: error.message }, { status: error.status ?? 500 }),
    };
});

const ID = '33333333-3333-4333-8333-333333333333';
const ROW = {
    id: ID, full_name: 'Luis Pérez', phone: '5551234567', email: null, notes: 'Corte bajo', preferences: 'Sin navaja',
    is_active: true, created_at: '2026-11-01T10:00:00Z', updated_at: '2026-11-01T10:00:00Z',
};
const calls: [string, unknown[]][] = [];
let rpcResult: Record<string, { data: unknown; error: unknown }> = {};
vi.mock('@/lib/supabase/server', () => {
    const chain: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'order', 'limit', 'ilike', 'update', 'insert']) {
        chain[name] = (...args: unknown[]) => { calls.push([name, args]); return chain; };
    }
    chain.maybeSingle = async () => ({ data: ROW, error: null });
    chain.single = async () => ({ data: ROW, error: null });
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: [ROW], error: null });
    return {
        createSupabaseServerClient: async () => ({
            from: () => chain,
            rpc: async (name: string, args: unknown) => { calls.push([`rpc:${name}`, [args]]); return rpcResult[name] ?? { data: [], error: null }; },
        }),
    };
});

import { GET as list, POST as create } from './route';
import { GET as getOne, PATCH as patch } from './[id]/route';
import { GET as history } from './[id]/history/route';

const req = (path: string, init?: { method: string; body: unknown }) => new NextRequest(new URL(path, 'http://localhost'),
    init ? { method: init.method, body: JSON.stringify(init.body) } : undefined);
const ctx = { params: Promise.resolve({ id: ID }) };
const SUMMARY = { client_id: ID, visits: 4, last_visit_at: '2026-11-15T18:00:00Z', total_spent: '980.00', no_shows: 1, next_appointment_at: null, next_appointment_id: null };

beforeEach(() => { role = 'receptionist'; calls.length = 0; rpcResult = { client_summaries: { data: [SUMMARY], error: null } }; });

describe('GET /api/clients', () => {
    it('por omisión solo activos, con su resumen', async () => {
        const res = await list(req('/api/clients'));
        expect(res.status).toBe(200);
        const [client] = await res.json();
        expect(client).toMatchObject({ id: ID, name: 'Luis Pérez', is_active: true, visits: 4, total_spent: 980, no_shows: 1, notes: 'Corte bajo', preferences: 'Sin navaja' });
        expect(calls).toContainEqual(['eq', ['is_active', true]]);
        expect(calls).toContainEqual(['rpc:client_summaries', [{ p_branch_id: 'br1', p_client_ids: [ID] }]]);
    });
    it('?estado=inactivos y ?estado=todos', async () => {
        await list(req('/api/clients?estado=inactivos'));
        expect(calls).toContainEqual(['eq', ['is_active', false]]);
        calls.length = 0;
        await list(req('/api/clients?estado=todos'));
        expect(calls.some(([name, args]) => name === 'eq' && args[0] === 'is_active')).toBe(false);
    });
    it('el barbero recibe la lista que le deja la base, sin importes', async () => {
        role = 'barber';
        rpcResult.client_summaries = { data: [{ ...SUMMARY, total_spent: null }], error: null };
        const [client] = await (await list(req('/api/clients'))).json();
        expect(client.total_spent).toBeNull();
        expect(client.visits).toBe(4);
    });
});

describe('POST /api/clients', () => {
    it.each(['owner', 'admin', 'cashier', 'receptionist', 'barber'])('%s registra un cliente', async (r) => {
        role = r;
        const res = await create(req('/api/clients', { method: 'POST', body: { name: 'Luis Pérez' } }));
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ is_active: true, visits: 0 });
    });
    it('consulta no registra clientes', async () => {
        role = 'viewer';
        expect((await create(req('/api/clients', { method: 'POST', body: { name: 'Luis Pérez' } }))).status).toBe(403);
    });
});

describe('GET y PATCH /api/clients/[id]', () => {
    it('la ficha trae el resumen', async () => {
        const body = await (await getOne(req(`/api/clients/${ID}`), ctx)).json();
        expect(body).toMatchObject({ id: ID, visits: 4, last_visit_at: '2026-11-15T18:00:00Z' });
    });
    it('un id inválido es 404', async () => {
        expect((await getOne(req('/api/clients/x'), { params: Promise.resolve({ id: 'x' }) })).status).toBe(404);
    });
    it.each(['owner', 'admin', 'cashier', 'receptionist'])('%s desactiva y guarda notas', async (r) => {
        role = r;
        const res = await patch(req(`/api/clients/${ID}`, { method: 'PATCH', body: { is_active: false, notes: 'Prefiere la tarde' } }), ctx);
        expect(res.status).toBe(200);
        const update = calls.find(([name]) => name === 'update');
        expect(update?.[1][0]).toMatchObject({ is_active: false, notes: 'Prefiere la tarde' });
    });
    it.each(['barber', 'viewer'])('%s no edita ni desactiva', async (r) => {
        role = r;
        expect((await patch(req(`/api/clients/${ID}`, { method: 'PATCH', body: { is_active: false } }), ctx)).status).toBe(403);
    });
    it('rechaza campos desconocidos', async () => {
        expect((await patch(req(`/api/clients/${ID}`, { method: 'PATCH', body: { points: 5 } }), ctx)).status).toBe(400);
    });
});

describe('GET /api/clients/[id]/history', () => {
    it('devuelve las filas de la base', async () => {
        rpcResult.client_history = { data: [{ kind: 'sale', id: 's1', at: '2026-11-15T18:00:00Z', total: '250.00', folio: 'V2611-0042' }], error: null };
        const body = await (await history(req(`/api/clients/${ID}/history`), ctx)).json();
        expect(body.items[0]).toMatchObject({ kind: 'sale', total: 250, folio: 'V2611-0042' });
        expect(calls).toContainEqual(['rpc:client_history', [{ p_client_id: ID }]]);
    });
    it('cliente ajeno para el barbero (42501) es 404', async () => {
        role = 'barber';
        rpcResult.client_history = { data: null, error: { code: '42501', message: 'Client permission denied' } };
        expect((await history(req(`/api/clients/${ID}/history`), ctx)).status).toBe(404);
    });
});
