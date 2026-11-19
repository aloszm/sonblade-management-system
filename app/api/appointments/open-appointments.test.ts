// B3: GET /api/appointments?abiertas=1&barbero=<id> (sugerencia del cobro para no duplicar la cita).
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

const BARBER = '22222222-2222-4222-8222-222222222222';
const base = {
    client_id: 'c1', assigned_employee_id: BARBER, customer_name: 'Cliente Uno', customer_phone: '5551234567',
    scheduled_start_at: '2026-11-20T16:00:00Z', scheduled_end_at: '2026-11-20T16:30:00Z', notes: null,
    created_at: '2026-11-19T10:00:00Z', source: 'appointment', clients: { id: 'c1', full_name: 'Cliente Uno' }, employees: null,
};
const ROWS = [
    { ...base, id: 'a1', status: 'scheduled', sales: [] },
    // Ya cobrada: tiene una venta vigente, no se ofrece.
    { ...base, id: 'a2', status: 'in_progress', sales: [{ id: 's1', status: 'paid', total_amount: 200 }] },
    // Cobrada pero anulada: se puede volver a cobrar.
    { ...base, id: 'a3', status: 'checked_in', sales: [{ id: 's2', status: 'refunded', total_amount: 200 }] },
];
const calls: [string, unknown[]][] = [];
vi.mock('@/lib/supabase/server', () => {
    const chain: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'order', 'gte', 'lt', 'in']) chain[name] = (...args: unknown[]) => { calls.push([name, args]); return chain; };
    chain.single = async () => ({ data: { timezone: 'America/Mexico_City' }, error: null });
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: ROWS, error: null });
    return { createSupabaseServerClient: async () => ({ from: () => chain }) };
});

import { GET } from './route';

const req = (qs: string) => new NextRequest(new URL(`/api/appointments?${qs}`, 'http://localhost'));

beforeEach(() => { role = 'receptionist'; calls.length = 0; });

describe('GET /api/appointments?abiertas=1', () => {
    it('filtra por barbero, estados abiertos y el día de hoy; quita las ya cobradas', async () => {
        const res = await GET(req(`abiertas=1&barbero=${BARBER}`));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.map((a: { id: string }) => a.id)).toEqual(['a1', 'a3']);
        expect(calls).toContainEqual(['eq', ['assigned_employee_id', BARBER]]);
        expect(calls).toContainEqual(['in', ['status', ['scheduled', 'confirmed', 'checked_in', 'in_progress']]]);
        expect(calls.some(([name, args]) => name === 'gte' && args[0] === 'scheduled_start_at')).toBe(true);
        expect(calls.some(([name, args]) => name === 'lt' && args[0] === 'scheduled_start_at')).toBe(true);
    });

    it('sin barbero válido responde 400', async () => {
        expect((await GET(req('abiertas=1'))).status).toBe(400);
        expect((await GET(req('abiertas=1&barbero=no-es-uuid'))).status).toBe(400);
    });

    it.each(['owner', 'admin', 'receptionist', 'cashier', 'viewer'])('%s recibe el teléfono', async (r) => {
        role = r;
        const body = await (await GET(req(`abiertas=1&barbero=${BARBER}`))).json();
        expect(body[0].customer_phone).toBe('5551234567');
    });

    it('el barbero no recibe el teléfono', async () => {
        role = 'barber';
        const res = await GET(req(`abiertas=1&barbero=${BARBER}`));
        expect(JSON.stringify(await res.json())).not.toContain('5551234567');
    });
});
