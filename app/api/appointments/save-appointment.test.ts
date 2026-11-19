// C2: POST con service_ids, PUT para reprogramar y servicios en el GET.
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
        authErrorResponse: (error: { status?: number; code?: string; message: string }) =>
            Response.json({ error: error.message }, { status: error.status ?? (error.code === '23P01' ? 409 : error.code === '55000' ? 409 : 500) }),
    };
});

const ID = '44444444-4444-4444-8444-444444444444';
const S1 = '55555555-5555-4555-8555-555555555555';
const S2 = '66666666-6666-4666-8666-666666666666';
const BARBER = '77777777-7777-4777-8777-777777777777';
const ROW = {
    id: ID, client_id: null, assigned_employee_id: BARBER, customer_name: 'Luis', customer_phone: '5551234567',
    scheduled_start_at: '2026-11-25T20:00:00Z', scheduled_end_at: '2026-11-25T21:30:00Z', status: 'scheduled', notes: 'Corte + Barba',
    created_at: '2026-11-19T10:00:00Z', source: 'appointment', clients: null, employees: { id: BARBER, display_name: 'Deya' }, sales: [],
    appointment_items: [
        { id: 'i3', service_id: S2, price_snapshot: '150.00', duration_snapshot_minutes: 60, position: 2, removed_at: null, services: { name: 'Ritual de barba' } },
        { id: 'i1', service_id: S1, price_snapshot: '150.00', duration_snapshot_minutes: 30, position: 1, removed_at: null, services: { name: 'Corte adulto' } },
        { id: 'i0', service_id: S1, price_snapshot: '120.00', duration_snapshot_minutes: 30, position: 1, removed_at: '2026-11-19T11:00:00Z', services: { name: 'Corte adulto' } },
    ],
};
const calls: [string, unknown[]][] = [];
let rpcResult: { data: unknown; error: unknown } = { data: { appointment_id: ID }, error: null };
vi.mock('@/lib/supabase/server', () => {
    const chain: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'order', 'gte', 'lt', 'in', 'insert']) chain[name] = (...args: unknown[]) => { calls.push([name, args]); return chain; };
    // La última tabla consultada decide qué se entrega: businesses → zona horaria; lo demás → la cita.
    chain.maybeSingle = async () => {
        const table = [...calls].reverse().find(([n]) => n === 'from')?.[1][0];
        return { data: table === 'businesses' ? { timezone: 'America/Mexico_City' } : ROW, error: null };
    };
    chain.single = async () => ({ data: ROW, error: null });
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: [ROW], error: null });
    return {
        createSupabaseServerClient: async () => ({
            from: (table: string) => { calls.push(['from', [table]]); return chain; },
            rpc: async (name: string, args: unknown) => { calls.push([`rpc:${name}`, [args]]); return rpcResult; },
        }),
    };
});

import { GET as list, POST as create } from './route';
import { GET as getOne, PUT as reschedule } from './[id]/route';

const req = (path: string, init?: { method: string; body: unknown }) => new NextRequest(new URL(path, 'http://localhost'),
    init ? { method: init.method, body: JSON.stringify(init.body) } : undefined);
const ctx = { params: Promise.resolve({ id: ID }) };
const rpcArgs = () => calls.find(([n]) => n === 'rpc:save_appointment')?.[1][0] as Record<string, unknown> | undefined;

beforeEach(() => { role = 'receptionist'; calls.length = 0; rpcResult = { data: { appointment_id: ID }, error: null }; });

describe('GET con servicios', () => {
    it('la lista y la cita traen sus servicios vigentes en orden', async () => {
        const [first] = await (await list(req('/api/appointments'))).json();
        expect(first.services).toEqual([
            { service_id: S1, name: 'Corte adulto', price: 150, duration_minutes: 30 },
            { service_id: S2, name: 'Ritual de barba', price: 150, duration_minutes: 60 },
        ]);
        const one = await (await getOne(req(`/api/appointments/${ID}`), ctx)).json();
        expect(one.services.map((s: { name: string }) => s.name)).toEqual(['Corte adulto', 'Ritual de barba']);
    });
});

describe('POST /api/appointments con service_ids', () => {
    const body = { barber_id: BARBER, customer_name: 'Luis', scheduled_at: '2026-11-25T20:00:00.000Z', service_ids: [S1, S2], idempotency_key: 'llave-de-prueba-123' };
    it('guarda con save_appointment y devuelve la cita con servicios', async () => {
        const res = await create(req('/api/appointments', { method: 'POST', body }));
        expect(res.status).toBe(201);
        expect(rpcArgs()).toMatchObject({ p_branch_id: 'br1', p_barber_id: BARBER, p_service_ids: [S1, S2], p_customer_name: 'Luis', p_idempotency_key: 'llave-de-prueba-123' });
        expect((await res.json()).services).toHaveLength(2);
    });
    it('sin service_ids sigue como antes (insert directo, sin rpc)', async () => {
        const res = await create(req('/api/appointments', { method: 'POST', body: { customer_name: 'Luis', scheduled_at: '2026-11-25T20:00:00.000Z', duration_minutes: 60 } }));
        expect(res.status).toBe(201);
        expect(rpcArgs()).toBeUndefined();
        expect(calls.some(([n]) => n === 'insert')).toBe(true);
    });
    it('rechaza una hora fuera de la rejilla de 30 min', async () => {
        const res = await create(req('/api/appointments', { method: 'POST', body: { ...body, scheduled_at: '2026-11-25T20:10:00.000Z' } }));
        expect(res.status).toBe(400);
    });
    it('empalme: 409 con el mensaje de la base', async () => {
        rpcResult = { data: null, error: { code: '23P01', message: 'Ese barbero ya tiene una cita en ese horario.' } };
        const res = await create(req('/api/appointments', { method: 'POST', body }));
        expect(res.status).toBe(409);
    });
    it.each(['barber', 'viewer'])('%s no agenda', async (r) => {
        role = r;
        expect((await create(req('/api/appointments', { method: 'POST', body }))).status).toBe(403);
    });
});

describe('PUT /api/appointments/[id] (reprogramar)', () => {
    it('manda id, hora, barbero y servicios a save_appointment', async () => {
        const res = await reschedule(req(`/api/appointments/${ID}`, { method: 'PUT', body: { scheduled_at: '2026-11-26T20:30:00.000Z', barber_id: BARBER, service_ids: [S1] } }), ctx);
        expect(res.status).toBe(200);
        expect(rpcArgs()).toMatchObject({ p_appointment_id: ID, p_start: '2026-11-26T20:30:00.000Z', p_barber_id: BARBER, p_service_ids: [S1] });
        expect((await res.json()).id).toBe(ID);
    });
    it('solo los servicios: no manda hora', async () => {
        await reschedule(req(`/api/appointments/${ID}`, { method: 'PUT', body: { service_ids: [S2] } }), ctx);
        expect(rpcArgs()?.p_start).toBeUndefined();
    });
    it('sin cambios o con campos desconocidos: 400', async () => {
        expect((await reschedule(req(`/api/appointments/${ID}`, { method: 'PUT', body: {} }), ctx)).status).toBe(400);
        expect((await reschedule(req(`/api/appointments/${ID}`, { method: 'PUT', body: { status: 'completed' } }), ctx)).status).toBe(400);
    });
    it('cita cerrada o cobrada: 409', async () => {
        rpcResult = { data: null, error: { code: '55000', message: 'Esa cita ya se cobró; no se puede reprogramar.' } };
        expect((await reschedule(req(`/api/appointments/${ID}`, { method: 'PUT', body: { scheduled_at: '2026-11-26T20:30:00.000Z' } }), ctx)).status).toBe(409);
    });
    it.each(['barber', 'viewer'])('%s no reprograma', async (r) => {
        role = r;
        expect((await reschedule(req(`/api/appointments/${ID}`, { method: 'PUT', body: { scheduled_at: '2026-11-26T20:30:00.000Z' } }), ctx)).status).toBe(403);
    });
});
