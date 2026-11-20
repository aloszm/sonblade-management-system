import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Costo obligatorio en alta y edición de producto (20261120120000_products_require_cost): el servidor lo valida con
// zod antes de llamar a la base, con el mismo mensaje que da la base.
const SESSION = { employeeId: null, businessId: 'biz', branchId: 'br1', userId: 'u-sonia', email: 'sonia@gallo-420.barberos.invalid', displayName: 'Sonia', role: 'admin' as const };
vi.mock('@/lib/auth/context', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/context')>();
    return { ...real, requireAuthContext: async () => SESSION };
});

const rpc = vi.fn();
const update = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({
        rpc: (...args: unknown[]) => rpc(...args),
        from: () => ({ update: (changes: unknown) => { update(changes); const q = { eq: () => q, then: (ok: (v: unknown) => unknown) => ok({ error: null }) }; return q; } }),
    }),
    getPublicConfig: () => ({ url: 'https://example.supabase.co', key: 'x' }),
}));

const PRODUCT = { id: '6c3ee0f8-5e86-4703-bd99-eaf0df33e862', name: 'Cera mate', sku: 'CER-1', category: 'Ceras', stock: 4, min_stock: 2, cost: 80, price: 180, status: 'ok', created_at: '', updated_at: '' };
vi.mock('@/lib/inventory/products-view', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/inventory/products-view')>();
    return { ...real, loadProducts: async () => [PRODUCT] };
});

import { POST } from './route';
import { PATCH } from './[id]/route';

const NEW = { name: 'Pomada nueva', sku: 'POM-9', category: 'Pomadas', stock: 0, min_stock: 1, price: 200 };
const post = (body: unknown) => POST(new NextRequest(new URL('/api/products', 'http://localhost'), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const patch = (body: unknown) => PATCH(new NextRequest(new URL(`/api/products/${PRODUCT.id}`, 'http://localhost'), { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({ id: PRODUCT.id }) });

beforeEach(() => {
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { product_id: 'p2' }, error: null });
    update.mockReset();
});

describe('POST /api/products: el costo es obligatorio', () => {
    for (const [name, cost] of [['sin costo', undefined], ['costo $0', 0], ['costo negativo', -5], ['costo como texto', '85']] as const) {
        it(`${name}: 400 con el mensaje claro y sin llamar a la base`, async () => {
            const res = await post({ ...NEW, cost });
            expect(res.status).toBe(400);
            expect((await res.json()).error).toBe('Captura el costo del producto antes de activarlo.');
            expect(rpc).not.toHaveBeenCalled();
        });
    }
    it('con costo mayor que cero: se da de alta', async () => {
        const res = await post({ ...NEW, cost: 85.5 });
        expect(res.status).toBe(201);
        expect(rpc).toHaveBeenCalledWith('create_catalog_product', expect.objectContaining({ p_cost_price: 85.5 }));
    });
    it('si la base lo rechaza igual (otra vía), su mensaje en español llega a la pantalla', async () => {
        rpc.mockResolvedValue({ data: null, error: { code: '23514', message: 'Captura el costo del producto antes de activarlo.' } });
        const res = await post({ ...NEW, cost: 85.5 });
        expect(res.status).toBe(409);
        expect((await res.json()).error).toBe('Captura el costo del producto antes de activarlo.');
    });
});

describe('PATCH /api/products/[id]: no se puede dejar el costo en cero', () => {
    it('costo $0: 400 y no toca la base', async () => {
        const res = await patch({ cost: 0 });
        expect(res.status).toBe(400);
        expect((await res.json()).error).toBe('Captura el costo del producto antes de activarlo.');
        expect(update).not.toHaveBeenCalled();
    });
    it('costo válido: se guarda', async () => {
        const res = await patch({ cost: 95 });
        expect(res.status).toBe(200);
        expect(update).toHaveBeenCalledWith({ cost_price: 95 });
    });
});
