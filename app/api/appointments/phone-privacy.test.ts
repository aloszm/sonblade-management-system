import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let role = 'owner';
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

const APPOINTMENT = {
    id: '11111111-1111-4111-8111-111111111111', client_id: null, assigned_employee_id: null, customer_name: 'Cliente Uno',
    customer_phone: '5551234567', scheduled_start_at: '2026-11-20T16:00:00Z', scheduled_end_at: '2026-11-20T16:30:00Z',
    status: 'scheduled', notes: null, created_at: '2026-11-19T10:00:00Z', source: 'appointment', clients: null, employees: null, sales: [],
};
// Constructor de consultas encadenable que al final entrega la cita.
vi.mock('@/lib/supabase/server', () => {
    const chain: Record<string, unknown> = {};
    for (const name of ['select', 'eq', 'order', 'gte', 'lt']) chain[name] = () => chain;
    chain.maybeSingle = async () => ({ data: APPOINTMENT, error: null });
    chain.then = (resolve: (value: unknown) => void) => resolve({ data: [APPOINTMENT], error: null });
    return { createSupabaseServerClient: async () => ({ from: () => chain }) };
});

import { GET as listAppointments } from './route';
import { GET as getAppointment } from './[id]/route';

const listReq = () => new NextRequest(new URL('/api/appointments', 'http://localhost'));
const oneReq = () => new NextRequest(new URL(`/api/appointments/${APPOINTMENT.id}`, 'http://localhost'));
const ctx = { params: Promise.resolve({ id: APPOINTMENT.id }) };

beforeEach(() => { role = 'owner'; });

describe('GET /api/appointments: teléfono del cliente por puesto', () => {
    it.each(['owner', 'admin', 'viewer', 'receptionist', 'cashier'])('%s recibe el teléfono', async (r) => {
        role = r;
        const body = await (await listAppointments(listReq())).json();
        expect(body[0].customer_phone).toBe('5551234567');
        expect(body[0].client_name).toBe('Cliente Uno');
    });
    it('el barbero recibe la cita pero sin teléfono', async () => {
        role = 'barber';
        const res = await listAppointments(listReq());
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body[0].customer_phone).toBeNull();
        expect(body[0].client_name).toBe('Cliente Uno');
        expect(JSON.stringify(body)).not.toContain('5551234567');
    });
});

describe('GET /api/appointments/[id]: teléfono del cliente por puesto', () => {
    it.each(['owner', 'admin', 'viewer', 'receptionist', 'cashier'])('%s recibe el teléfono', async (r) => {
        role = r;
        const res = await getAppointment(oneReq(), ctx);
        expect(res.status).toBe(200);
        expect((await res.json()).customer_phone).toBe('5551234567');
    });
    it('el barbero no recibe la cita (403) ni el teléfono', async () => {
        role = 'barber';
        const res = await getAppointment(oneReq(), ctx);
        expect(res.status).toBe(403);
        expect(JSON.stringify(await res.json())).not.toContain('5551234567');
    });
});
