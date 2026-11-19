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
let current: Person = PEOPLE.receptionist;
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

vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({}),
    getPublicConfig: () => ({ url: 'https://example.supabase.co', key: 'x' }),
}));

const PRODUCT = { id: '6c3ee0f8-5e86-4703-bd99-eaf0df33e862', name: 'Cera mate', sku: 'CER-1', category: 'Ceras', stock: 4, min_stock: 2, cost: 80, price: 180, status: 'ok', created_at: '', updated_at: '' };
vi.mock('@/lib/inventory/products-view', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/inventory/products-view')>();
    return { ...real, loadProducts: async () => [PRODUCT] };
});

const pinRpc = vi.fn();
const runWithPinMock = vi.fn();
vi.mock('@/lib/auth/pin-confirm', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/pin-confirm')>();
    return { ...real, runWithPin: (...args: unknown[]) => runWithPinMock(...args) };
});

import { POST } from './[id]/receive/route';
import { GET } from './route';

const GOOD_PIN = '482913';
const req = (body: unknown, id = PRODUCT.id) => [
    new NextRequest(new URL(`/api/products/${id}/receive`, 'http://localhost'), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
    { params: Promise.resolve({ id }) },
] as const;

beforeEach(() => {
    current = PEOPLE.receptionist;
    pinRpc.mockReset(); runWithPinMock.mockReset();
    pinRpc.mockResolvedValue({ data: { movement_id: 'mov-1', quantity_on_hand: 10 }, error: null });
    runWithPinMock.mockImplementation(async (_identity: unknown, pin: string, action: (client: unknown) => Promise<unknown>) => {
        if (pin !== GOOD_PIN) return { ok: false, status: 400, error: 'El PIN no es correcto.' };
        return { ok: true, value: await action({ rpc: (...args: unknown[]) => pinRpc(...args) }) };
    });
});

describe('POST /api/products/[id]/receive — entrada de mercancía con PIN', () => {
    it.each(['receptionist', 'cashier', 'admin', 'owner'] as const)('%s registra una entrada con su PIN (solo suma)', async (who) => {
        current = PEOPLE[who];
        const res = await POST(...req({ quantity: 6, comment: 'Llegó pedido', pin: GOOD_PIN }));
        expect(res.status).toBe(200);
        expect(await res.json()).toEqual({ product_id: PRODUCT.id, received: 6, stock: 10 });
        expect(runWithPinMock.mock.calls[0][0]).toMatchObject({ userId: PEOPLE[who].userId });
        expect(pinRpc).toHaveBeenCalledWith('receive_inventory_stock', { p_branch_id: 'br1', p_product_id: PRODUCT.id, p_quantity: 6, p_comment: 'Llegó pedido' });
    });

    it.each(['barber', 'viewer'] as const)('%s no puede (403) y no se pide PIN', async (who) => {
        current = PEOPLE[who];
        const res = await POST(...req({ quantity: 6, comment: 'Llegó pedido', pin: GOOD_PIN }));
        expect(res.status).toBe(403);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it.each([0, -3, 2.5, 501])('cantidad %s se rechaza con 400 antes del PIN', async (quantity) => {
        const res = await POST(...req({ quantity, comment: 'Llegó pedido', pin: GOOD_PIN }));
        expect(res.status).toBe(400);
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it('comentario de menos de 3 letras se rechaza con 400', async () => {
        const res = await POST(...req({ quantity: 2, comment: ' a ', pin: GOOD_PIN }));
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('Escribe un comentario de la entrada (de 3 a 300 letras).');
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it('sin PIN responde 428 y no toca la base', async () => {
        const res = await POST(...req({ quantity: 2, comment: 'Llegó pedido' }));
        expect(res.status).toBe(428);
        expect(await res.json()).toMatchObject({ needs_pin: true });
        expect(runWithPinMock).not.toHaveBeenCalled();
    });

    it('PIN incorrecto: 400 con pin_error y sin cambio', async () => {
        const res = await POST(...req({ quantity: 2, comment: 'Llegó pedido', pin: '111112' }));
        expect(res.status).toBe(400);
        expect(await res.json()).toMatchObject({ error: 'El PIN no es correcto.', pin_error: true });
        expect(pinRpc).not.toHaveBeenCalled();
    });

    it('si la base rechaza (otra sucursal) responde 403', async () => {
        pinRpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'No tienes permiso para registrar entradas de inventario en esta sucursal.' } });
        const res = await POST(...req({ quantity: 2, comment: 'Llegó pedido', pin: GOOD_PIN }));
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe('No tienes permiso para registrar entradas de inventario en esta sucursal.');
    });

    it('un id que no es de producto responde 404', async () => {
        const res = await POST(...req({ quantity: 2, comment: 'Llegó pedido', pin: GOOD_PIN }, 'no-es-uuid'));
        expect(res.status).toBe(404);
    });
});

describe('GET /api/products — el costo solo para dueño, gerencia y consulta', () => {
    it.each(['receptionist', 'cashier', 'barber'] as const)('%s no recibe el costo', async (who) => {
        current = PEOPLE[who];
        const body = await (await GET()).json();
        expect(body[0]).not.toHaveProperty('cost');
        expect(body[0]).toMatchObject({ name: 'Cera mate', stock: 4, price: 180 });
    });
    it.each(['owner', 'admin', 'viewer'] as const)('%s sí recibe el costo', async (who) => {
        current = PEOPLE[who];
        const body = await (await GET()).json();
        expect(body[0].cost).toBe(80);
    });
});
