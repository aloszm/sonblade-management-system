// @vitest-environment node
import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { BusinessRole } from '@/lib/auth/context';

// Ajustes de caja: a quién se entrega el retiro del cierre (decisión del dueño, 21 nov 2026).
const BASE = { userId: 'u', email: 'x@gallo-420.barberos.invalid', displayName: 'X', employeeId: null, businessId: 'biz', branchId: 'br1' };
let role: BusinessRole = 'receptionist';
vi.mock('@/lib/auth/context', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/context')>();
    return {
        ...real,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(role)) throw new real.AuthorizationError();
            return { ...BASE, role };
        },
    };
});

const rpc = vi.fn();
const chain = (data: unknown) => {
    const q: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'order', 'limit']) q[m] = () => q;
    q.single = async () => ({ data, error: null });
    q.maybeSingle = async () => ({ data, error: null });
    return q;
};
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({
        rpc: (...a: unknown[]) => rpc(...a),
        from: (table: string) => chain(table === 'branches'
            ? { cash_float_target: '500.00', daily_reserve_amount: '600.00', daily_reserve_label: 'Renta y gastos' }
            : { float_left: '500.00' }),
    }),
}));

const pinRpc = vi.fn();
const runWithPinMock = vi.fn();
vi.mock('@/lib/auth/pin-confirm', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/pin-confirm')>();
    return { ...real, runWithPin: (...args: unknown[]) => runWithPinMock(...args) };
});

import { GET } from './route';
import { POST as setRecipient } from './withdrawal-recipient/route';

const SONIA = '0760694d-ea50-462b-8e11-b9478e564607';
const post = (body: Record<string, unknown>) => setRecipient(new NextRequest(new URL('/api/cash/settings/withdrawal-recipient', 'http://localhost'), { method: 'POST', body: JSON.stringify(body) }));

beforeEach(() => {
    role = 'receptionist';
    rpc.mockReset(); pinRpc.mockReset(); runWithPinMock.mockReset();
    rpc.mockResolvedValue({ data: { user_id: SONIA, name: 'Sonia' }, error: null });
    pinRpc.mockResolvedValue({ data: { user_id: SONIA, name: 'Sonia' }, error: null });
    runWithPinMock.mockImplementation(async (_identity: unknown, _pin: string, action: (client: unknown) => Promise<unknown>) => ({ ok: true, value: await action({ rpc: (...a: unknown[]) => pinRpc(...a) }) }));
});

describe('GET /api/cash/settings · receptor del retiro', () => {
    it('recepción lo lee (para saber a quién entregar) y no lo puede cambiar', async () => {
        const body = await (await GET()).json();
        expect(rpc).toHaveBeenCalledWith('cash_withdrawal_recipient', { p_branch_id: 'br1' });
        expect(body).toMatchObject({ float_target: 500, reserve_amount: 600, withdrawal_recipient: { user_id: SONIA, name: 'Sonia' }, can_set_withdrawal_recipient: false });
    });

    it('solo la cuenta principal lo puede cambiar; gerencia no', async () => {
        role = 'owner';
        expect((await (await GET()).json()).can_set_withdrawal_recipient).toBe(true);
        role = 'admin';
        expect((await (await GET()).json()).can_set_withdrawal_recipient).toBe(false);
    });

    it('sin receptor configurado: null', async () => {
        rpc.mockResolvedValue({ data: null, error: null });
        expect((await (await GET()).json()).withdrawal_recipient).toBeNull();
    });

    it('base sin migrar (la función no existe, PGRST202): responde null y la caja sigue funcionando', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: 'PGRST202', message: 'Could not find the function public.cash_withdrawal_recipient' } });
        const res = await GET();
        expect(res.status).toBe(200);
        expect((await res.json()).withdrawal_recipient).toBeNull();
    });

    it('otro error de la base no se esconde', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'Cash permission denied' } });
        expect((await GET()).status).toBeGreaterThanOrEqual(400);
    });
});

describe('POST /api/cash/settings/withdrawal-recipient', () => {
    const valid = { user_id: SONIA, pin: '482917', comment: 'El sobrante de cada cierre se entrega a Sonia' };

    it('gerencia, consulta, recepción y barbero: 403 sin tocar la base', async () => {
        for (const r of ['admin', 'viewer', 'receptionist', 'barber'] as BusinessRole[]) {
            role = r;
            expect((await post(valid)).status).toBe(403);
        }
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it('la cuenta principal, con PIN y comentario: llama a set_cash_withdrawal_recipient con la sesión del PIN', async () => {
        role = 'owner';
        const res = await post(valid);
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ withdrawal_recipient: { user_id: SONIA, name: 'Sonia' } });
        expect(runWithPinMock.mock.calls[0][1]).toBe('482917');
        expect(pinRpc).toHaveBeenCalledWith('set_cash_withdrawal_recipient', { p_branch_id: 'br1', p_user_id: SONIA, p_comment: valid.comment });
        expect(rpc).not.toHaveBeenCalled(); // nunca con la sesión normal
    });

    it('user_id null quita el receptor fijo', async () => {
        role = 'owner';
        pinRpc.mockResolvedValue({ data: null, error: null });
        const res = await post({ ...valid, user_id: null });
        expect(await res.json()).toEqual({ withdrawal_recipient: null });
        expect(pinRpc).toHaveBeenCalledWith('set_cash_withdrawal_recipient', expect.objectContaining({ p_user_id: null }));
    });

    it('sin PIN, sin comentario o con un id que no es uuid: 400', async () => {
        role = 'owner';
        expect((await post({ user_id: SONIA, comment: valid.comment })).status).toBe(400);
        expect((await post({ user_id: SONIA, pin: valid.pin })).status).toBe(400);
        expect((await post({ ...valid, user_id: 'sonia' })).status).toBe(400);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it('PIN incorrecto: responde el error del PIN y no cambia nada', async () => {
        role = 'owner';
        runWithPinMock.mockResolvedValue({ ok: false, status: 401, error: 'El PIN no es correcto.' });
        const res = await post(valid);
        expect(res.status).toBe(401);
        expect(await res.json()).toMatchObject({ error: 'El PIN no es correcto.', pin_error: true });
        expect(pinRpc).not.toHaveBeenCalled();
    });
});
