import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sesiones de prueba por puesto (nombres reales del equipo; sin PIN reales).
const BASE = { employeeId: null, businessId: 'biz', branchId: 'br1' };
const PEOPLE = {
    receptionist: { ...BASE, userId: 'u-emi', email: 'emi@gallo-420.barberos.invalid', displayName: 'Emi', role: 'receptionist' as const },
    cashier: { ...BASE, userId: 'u-dago', email: 'dago@gallo-420.barberos.invalid', displayName: 'Dago', role: 'cashier' as const },
    admin: { ...BASE, userId: 'u-sonia', email: 'sonia@gallo-420.barberos.invalid', displayName: 'Sonia', role: 'admin' as const },
    owner: { ...BASE, userId: 'u-alonso', email: 'alonso@gallo-420.barberos.invalid', displayName: 'Alonso', role: 'owner' as const },
    barber: { ...BASE, userId: 'u-dani', email: 'dani@gallo-420.barberos.invalid', displayName: 'Dani', role: 'barber' as const },
    viewer: { ...BASE, userId: 'u-lucia', email: 'lucia@gallo-420.barberos.invalid', displayName: 'Lucía', role: 'viewer' as const },
};
type Person = (typeof PEOPLE)[keyof typeof PEOPLE];
let current: Person = PEOPLE.owner;
vi.mock('@/lib/auth/context', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/context')>();
    return {
        ...real,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(current.role)) throw new real.AuthorizationError();
            return current;
        },
    };
});

const sessionRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({
        rpc: (...args: unknown[]) => sessionRpc(...args),
        from: () => ({ select: () => ({ eq: () => ({ single: async () => ({ data: { timezone: 'America/Mexico_City' }, error: null }) }) }) }),
    }),
    getPublicConfig: () => ({ url: 'https://example.supabase.co', key: 'x' }),
}));

const pinRpc = vi.fn();
const runWithPinMock = vi.fn();
vi.mock('@/lib/auth/pin-confirm', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/pin-confirm')>();
    return { ...real, runWithPin: (...args: unknown[]) => runWithPinMock(...args) };
});

import { GET as listEnvelopes } from './route';
import { GET as listMovements } from './[id]/movements/route';
import { POST as adjust } from './[id]/adjust/route';
import { POST as deposit } from './[id]/deposit/route';

const GOOD_PIN = '482913';
const ENV = '6c3ee0f8-5e86-4703-bd99-eaf0df33e862';
const post = (path: string, body: unknown, id = ENV) => [
    new NextRequest(new URL(`/api/envelopes/${id}/${path}`, 'http://localhost'), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    { params: Promise.resolve({ id }) },
] as const;
const get = (url: string, id = ENV) => [new NextRequest(new URL(url, 'http://localhost')), { params: Promise.resolve({ id }) }] as const;

beforeEach(() => {
    current = PEOPLE.owner;
    sessionRpc.mockReset(); pinRpc.mockReset(); runWithPinMock.mockReset();
    sessionRpc.mockImplementation(async (fn: string) => {
        if (fn === 'envelope_balance') return { data: [{ envelope_id: ENV, branch_id: 'br1', name: 'Renta y gastos', is_default: true, is_active: true, balance: '1200.00', total_in: '1800', total_out: '600', movements: 4, last_movement_at: '2026-11-20T03:00:00Z' }], error: null };
        if (fn === 'envelope_movements_list') return { data: [{ id: 'm1', envelope_id: ENV, direction: 'in', amount: '600.00', signed_amount: '600.00', balance_after: '1200.00', source: 'cash_close', cash_session_id: 's1', expense_id: null, reason: 'Apartado del cierre de caja', created_by: 'u-sonia', created_at: '2026-11-20T03:00:00Z' }], error: null };
        if (fn === 'member_display_names') return { data: [{ user_id: 'u-sonia', display_name: 'Sonia' }], error: null };
        return { data: null, error: null };
    });
    pinRpc.mockResolvedValue({ data: { movement_id: 'mov-1', previous_balance: 1200, balance: 1000, difference: -200, replayed: false }, error: null });
    runWithPinMock.mockImplementation(async (_identity: unknown, pin: string, action: (client: unknown) => Promise<unknown>) => {
        if (pin !== GOOD_PIN) return { ok: false, status: 400, error: 'El PIN no es correcto.' };
        return { ok: true, value: await action({ rpc: (...args: unknown[]) => pinRpc(...args) }) };
    });
});

describe('GET /api/envelopes — sobres con saldo', () => {
    it.each(['owner', 'admin', 'viewer'] as const)('%s ve los sobres con saldo numérico', async (who) => {
        current = PEOPLE[who];
        const res = await listEnvelopes();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.envelopes[0]).toMatchObject({ id: ENV, name: 'Renta y gastos', balance: 1200, total_in: 1800, total_out: 600, movements: 4 });
        expect(body.can_edit).toBe(who !== 'viewer');
        expect(sessionRpc).toHaveBeenCalledWith('envelope_balance', { p_branch_id: 'br1' });
    });
    it.each(['receptionist', 'cashier', 'barber'] as const)('%s no ve los sobres (403)', async (who) => {
        current = PEOPLE[who];
        expect((await listEnvelopes()).status).toBe(403);
        expect(sessionRpc).not.toHaveBeenCalled();
    });
});

describe('GET /api/envelopes/[id]/movements', () => {
    it('lista con saldo corrido y nombre de quien registró; fechas del negocio a instantes', async () => {
        const res = await listMovements(...get(`/api/envelopes/${ENV}/movements?from=2026-11-01&to=2026-11-30&limit=50`));
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.movements[0]).toMatchObject({ source: 'cash_close', amount: 600, balance_after: 1200, created_by_name: 'Sonia' });
        expect(sessionRpc).toHaveBeenCalledWith('envelope_movements_list', {
            p_envelope_id: ENV, p_from: '2026-11-01T06:00:00.000Z', p_to: '2026-12-01T06:00:00.000Z', p_limit: 50,
        });
    });
    it('fecha mal escrita: 400', async () => {
        expect((await listMovements(...get(`/api/envelopes/${ENV}/movements?from=01-11-2026`))).status).toBe(400);
    });
    it('recepción no puede (403)', async () => {
        current = PEOPLE.receptionist;
        expect((await listMovements(...get(`/api/envelopes/${ENV}/movements`))).status).toBe(403);
    });
    it('id inválido: 404', async () => {
        expect((await listMovements(...get('/api/envelopes/x/movements', 'x'))).status).toBe(404);
    });
});

describe('POST /api/envelopes/[id]/adjust y /deposit — con PIN, dueño y gerencia', () => {
    it.each(['owner', 'admin'] as const)('%s ajusta por conteo con su PIN', async (who) => {
        current = PEOPLE[who];
        const res = await adjust(...post('adjust', { counted_balance: 1000, comment: 'Conteo del viernes', pin: GOOD_PIN, idempotency_key: 'clave-ajuste-1' }));
        expect(res.status).toBe(201);
        expect(await res.json()).toMatchObject({ movement_id: 'mov-1', balance: 1000, difference: -200, replayed: false });
        expect(runWithPinMock.mock.calls[0][0]).toMatchObject({ userId: PEOPLE[who].userId });
        expect(pinRpc).toHaveBeenCalledWith('envelope_adjust_confirmed', { p_envelope_id: ENV, p_counted_balance: 1000, p_comment: 'Conteo del viernes', p_idempotency_key: 'clave-ajuste-1' });
    });
    it.each(['owner', 'admin'] as const)('%s deposita al banco con su PIN', async (who) => {
        current = PEOPLE[who];
        const res = await deposit(...post('deposit', { amount: 200, comment: 'Depósito al banco', pin: GOOD_PIN }));
        expect(res.status).toBe(201);
        expect(pinRpc).toHaveBeenCalledWith('envelope_bank_deposit_confirmed', { p_envelope_id: ENV, p_amount: 200, p_comment: 'Depósito al banco', p_idempotency_key: undefined });
    });
    it.each(['receptionist', 'cashier', 'barber', 'viewer'] as const)('%s no puede mover el sobre (403, sin pedir PIN)', async (who) => {
        current = PEOPLE[who];
        expect((await adjust(...post('adjust', { counted_balance: 1, comment: 'Conteo del viernes', pin: GOOD_PIN }))).status).toBe(403);
        expect((await deposit(...post('deposit', { amount: 1, comment: 'Depósito al banco', pin: GOOD_PIN }))).status).toBe(403);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });
    it('sin PIN: 428 y no toca la base', async () => {
        const res = await deposit(...post('deposit', { amount: 200, comment: 'Depósito al banco' }));
        expect(res.status).toBe(428);
        expect(await res.json()).toMatchObject({ needs_pin: true });
        expect(runWithPinMock).not.toHaveBeenCalled();
    });
    it.each([
        ['deposit', { amount: 0, comment: 'Depósito al banco', pin: GOOD_PIN }],
        ['deposit', { amount: 10.555, comment: 'Depósito al banco', pin: GOOD_PIN }],
        ['deposit', { amount: 10, comment: 'ok', pin: GOOD_PIN }],
        ['adjust', { counted_balance: -1, comment: 'Conteo del viernes', pin: GOOD_PIN }],
    ] as const)('datos inválidos (%s %j): 400 antes del PIN', async (path, body) => {
        const res = path === 'deposit' ? await deposit(...post(path, body)) : await adjust(...post(path, body));
        expect(res.status).toBe(400);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });
    it('PIN incorrecto: 400 con pin_error', async () => {
        const res = await deposit(...post('deposit', { amount: 200, comment: 'Depósito al banco', pin: '111112' }));
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ pin_error: true });
        expect(pinRpc).not.toHaveBeenCalled();
    });
    it('saldo insuficiente: la base responde 55000 y la ruta 409 con el mensaje en español', async () => {
        pinRpc.mockResolvedValue({ data: null, error: { code: '55000', message: 'En el sobre hay $600; no se pueden sacar $700.' } });
        const res = await deposit(...post('deposit', { amount: 700, comment: 'Depósito al banco', pin: GOOD_PIN }));
        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe('En el sobre hay $600; no se pueden sacar $700.');
    });
});
