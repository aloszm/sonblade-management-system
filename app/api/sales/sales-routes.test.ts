import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sesión de quien cobra (recepción) o de quien anula (gerencia).
const CASHIER = { userId: 'u-emi', email: 'emi@gallo-420.barberos.invalid', displayName: 'Emi', employeeId: null, businessId: 'biz', branchId: 'br1', role: 'receptionist' as const };
const MANAGER = { ...CASHIER, userId: 'u-sonia', email: 'sonia@gallo-420.barberos.invalid', displayName: 'Sonia', role: 'admin' as const };
let current: typeof CASHIER | typeof MANAGER = CASHIER;
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

const userRpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({ rpc: (...args: unknown[]) => userRpc(...args) }),
    getPublicConfig: () => ({ url: 'https://example.supabase.co', key: 'x' }),
}));

const issue = vi.fn();
vi.mock('@/lib/sales/discount-approval', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/sales/discount-approval')>();
    return { ...real, issueDiscountApproval: (...args: unknown[]) => issue(...args) };
});

const pinRpc = vi.fn();
const runWithPinMock = vi.fn();
vi.mock('@/lib/auth/pin-confirm', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/pin-confirm')>();
    return { ...real, runWithPin: (...args: unknown[]) => runWithPinMock(...args) };
});

import { POST } from './route';
import { DELETE } from './[id]/route';

const SALE_ID = '9b2f6a3c-0a8e-4c1e-9f1a-2d3c4b5a6e7f';
const AUTHORIZER = '3c4d5e6f-7a8b-4c9d-8e0f-1a2b3c4d5e6f';
const req = (method: string, path: string, body: unknown) => new NextRequest(new URL(path, 'http://localhost'), { method, body: JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const sale = (extra: Record<string, unknown> = {}, discount = 0) => ({
    idempotency_key: '0f8fad5b-d9cb-469f-a165-70867728950e',
    items: [{ item_type: 'service', catalog_id: '6c3ee0f8-5e86-4703-bd99-eaf0df33e862', quantity: 1, employee_id: 'c7494a6f-baa9-426a-a313-a1c98824857a', discount_amount: discount }],
    payments: [{ method: 'cash', amount: 300 - discount }],
    ...extra,
});

beforeEach(() => {
    current = CASHIER;
    userRpc.mockReset(); issue.mockReset(); pinRpc.mockReset(); runWithPinMock.mockReset();
    userRpc.mockResolvedValue({ data: { sale_id: SALE_ID, folio: 'V2611-0001' }, error: null });
    runWithPinMock.mockImplementation(async (_identity: unknown, pin: string, action: (client: unknown) => Promise<unknown>) => {
        if (pin !== '482913') return { ok: false, status: 400, error: 'El PIN no es correcto.' };
        return { ok: true, value: await action({ rpc: (...args: unknown[]) => pinRpc(...args) }) };
    });
});

describe('POST /api/sales — descuento con PIN de quien autoriza', () => {
    it('sin descuento cobra como siempre, sin autorización ni PIN', async () => {
        const res = await POST(req('POST', '/api/sales', sale()));
        expect(res.status).toBe(201);
        expect(issue).not.toHaveBeenCalled();
        const [fn, args] = userRpc.mock.calls[0];
        expect(fn).toBe('confirm_sale');
        expect(args).toMatchObject({ p_discount_approval_id: null, p_discount_authorized_by: null });
    });
    it('con descuento y sin PIN responde 428 y no registra nada', async () => {
        const res = await POST(req('POST', '/api/sales', sale({ discount_reason: 'Cliente frecuente', discount_authorized_by: AUTHORIZER }, 30)));
        expect(res.status).toBe(428);
        expect(await res.json()).toMatchObject({ needs_pin: true });
        expect(issue).not.toHaveBeenCalled();
        expect(userRpc).not.toHaveBeenCalled();
    });
    it('con descuento sin motivo responde 400 antes de pedir el PIN', async () => {
        const res = await POST(req('POST', '/api/sales', sale({ discount_pin: '482913' }, 30)));
        expect(res.status).toBe(400);
        expect(issue).not.toHaveBeenCalled();
    });
    it('con PIN correcto: la autorización la pide quien autoriza y la venta va con la sesión de quien cobra', async () => {
        issue.mockResolvedValue({ ok: true, value: 'aprob-1' });
        const res = await POST(req('POST', '/api/sales', sale({ discount_reason: 'Cliente frecuente', discount_authorized_by: AUTHORIZER, discount_pin: '482913' }, 30)));
        expect(res.status).toBe(201);
        expect(issue).toHaveBeenCalledWith({
            cashier: { userId: 'u-emi', email: CASHIER.email },
            authorizerUserId: AUTHORIZER, pin: '482913', branchId: 'br1', maxAmount: 30, reason: 'Cliente frecuente',
        });
        const [fn, args] = userRpc.mock.calls[0];
        expect(fn).toBe('confirm_sale');
        // El autorizador lo pone la base desde la autorización firmada, no la caja.
        expect(args).toMatchObject({ p_discount_approval_id: 'aprob-1', p_discount_authorized_by: null, p_discount_reason: 'Cliente frecuente' });
    });
    it('si no llega quién autoriza, autoriza quien cobra con su propio PIN', async () => {
        issue.mockResolvedValue({ ok: true, value: 'aprob-2' });
        await POST(req('POST', '/api/sales', sale({ discount_reason: 'Promoción', discount_pin: '482913' }, 20)));
        expect(issue.mock.calls[0][0]).toMatchObject({ authorizerUserId: 'u-emi', maxAmount: 20 });
    });
    it('PIN incorrecto: 400 con pin_error y la venta no se registra', async () => {
        issue.mockResolvedValue({ ok: false, status: 400, error: 'El PIN de quien autoriza no es correcto.' });
        const res = await POST(req('POST', '/api/sales', sale({ discount_reason: 'Cliente frecuente', discount_authorized_by: AUTHORIZER, discount_pin: '000001' }, 30)));
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'El PIN de quien autoriza no es correcto.', pin_error: true });
        expect(userRpc).not.toHaveBeenCalled();
    });
    it('si la base niega la autorización (sin permiso), responde 403 con su mensaje', async () => {
        issue.mockRejectedValue({ code: '42501', message: 'No puedes autorizar descuentos: debe hacerlo el dueño, gerencia o alguien con permiso.' });
        const res = await POST(req('POST', '/api/sales', sale({ discount_reason: 'Cliente frecuente', discount_authorized_by: AUTHORIZER, discount_pin: '482913' }, 30)));
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe('No puedes autorizar descuentos: debe hacerlo el dueño, gerencia o alguien con permiso.');
        expect(userRpc).not.toHaveBeenCalled();
    });
    it('suma los descuentos de todos los renglones como monto máximo, sin errores de redondeo', async () => {
        issue.mockResolvedValue({ ok: true, value: 'aprob-3' });
        const body = sale({ discount_reason: 'Combo', discount_pin: '482913' }, 0.1);
        body.items.push({ ...body.items[0], catalog_id: 'caafd6ae-cf2e-4afb-8421-2abfcada40bf', discount_amount: 0.2 });
        await POST(req('POST', '/api/sales', body));
        expect(issue.mock.calls[0][0].maxAmount).toBe(0.3);
    });
});

describe('DELETE /api/sales/[id] — anular con PIN', () => {
    const params = { params: Promise.resolve({ id: SALE_ID }) };
    it('recepción no puede anular', async () => {
        const res = await DELETE(req('DELETE', `/api/sales/${SALE_ID}`, { reason: 'Cobro duplicado', pin: '482913' }), params);
        expect(res.status).toBe(403);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });
    it('sin PIN responde 428 y no anula', async () => {
        current = MANAGER;
        const res = await DELETE(req('DELETE', `/api/sales/${SALE_ID}`, { reason: 'Cobro duplicado' }), params);
        expect(res.status).toBe(428);
        expect(await res.json()).toMatchObject({ needs_pin: true });
        expect(runWithPinMock).not.toHaveBeenCalled();
        expect(userRpc).not.toHaveBeenCalled();
    });
    it('con PIN correcto anula con reverse_sale_confirmed en la sesión del PIN', async () => {
        current = MANAGER;
        pinRpc.mockResolvedValue({ data: { sale_id: SALE_ID, status: 'refunded' }, error: null });
        const res = await DELETE(req('DELETE', `/api/sales/${SALE_ID}`, { reason: ' Cobro duplicado ', pin: '482913' }), params);
        expect(res.status).toBe(200);
        expect(runWithPinMock.mock.calls[0][0]).toMatchObject({ userId: 'u-sonia', email: MANAGER.email });
        expect(pinRpc).toHaveBeenCalledWith('reverse_sale_confirmed', { p_sale_id: SALE_ID, p_reason: 'Cobro duplicado' });
        expect(userRpc).not.toHaveBeenCalled();
    });
    it('PIN incorrecto: 400 con pin_error', async () => {
        current = MANAGER;
        const res = await DELETE(req('DELETE', `/api/sales/${SALE_ID}`, { reason: 'Cobro duplicado', pin: '000001' }), params);
        expect(res.status).toBe(400);
        expect(await res.json()).toEqual({ error: 'El PIN no es correcto.', pin_error: true });
        expect(pinRpc).not.toHaveBeenCalled();
    });
    it('sin motivo responde 400', async () => {
        current = MANAGER;
        const res = await DELETE(req('DELETE', `/api/sales/${SALE_ID}`, { reason: 'x', pin: '482913' }), params);
        expect(res.status).toBe(400);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });
});
