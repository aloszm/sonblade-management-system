import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// El código (SKU) es opcional (auditoría del 21 nov 2026): los 4 productos reales lo tienen vacío y la pantalla
// de Inventario manda el formulario completo, así que con el SKU obligatorio ningún producto real se podía editar.
const SESSION = { employeeId: null, businessId: 'biz', branchId: 'br1', userId: 'u-sonia', email: 'sonia@gallo-420.barberos.invalid', displayName: 'Sonia', role: 'admin' as string };
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

// Así llega un producto real: sin código (la base tiene null → '') y sin categoría guardada (→ «General»).
const REAL = { id: '6c3ee0f8-5e86-4703-bd99-eaf0df33e862', name: 'Peine de textura', sku: '', category: 'General', stock: 54, min_stock: 5, cost: 27, price: 80, status: 'ok', created_at: '', updated_at: '' };
const CODED = { ...REAL, id: '8a1d6c0e-2b7f-4f43-9d1a-5e3c7b9a0f21', name: 'Cera mate', sku: 'CER-1', cost: 80, price: 180 };
let products = [REAL, CODED];
const loadOptions: unknown[] = [];
vi.mock('@/lib/inventory/products-view', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/inventory/products-view')>();
    return { ...real, loadProducts: async (_s: unknown, _b: unknown, _br: unknown, options?: unknown) => { loadOptions.push(options ?? {}); return products; } };
});

import { POST } from './route';
import { PATCH } from './[id]/route';
import { GET as STATS } from './stats/route';

const post = (body: unknown) => POST(new NextRequest(new URL('/api/products', 'http://localhost'), { method: 'POST', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }));
const patch = (id: string, body: unknown) => PATCH(new NextRequest(new URL(`/api/products/${id}`, 'http://localhost'), { method: 'PATCH', body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }), { params: Promise.resolve({ id }) });
// Lo que manda la pantalla al guardar: el formulario completo.
const formOf = (p: typeof REAL, changes: Record<string, unknown> = {}) => ({ name: p.name, sku: p.sku, category: p.category, stock: p.stock, min_stock: p.min_stock, cost: p.cost, price: p.price, ...changes });

beforeEach(() => {
    SESSION.role = 'admin';
    products = [REAL, CODED];
    loadOptions.length = 0;
    rpc.mockReset();
    rpc.mockResolvedValue({ data: { product_id: 'p2' }, error: null });
    update.mockReset();
});

describe('PATCH /api/products/[id] · el código es opcional', () => {
    it('producto real sin código: cambiar el precio se guarda (antes respondía 400 por el SKU vacío)', async () => {
        const res = await patch(REAL.id, formOf(REAL, { price: 85 }));
        expect(res.status).toBe(200);
        expect(update).toHaveBeenCalledTimes(1);
        // Solo cambia el precio: ni el código ni la categoría se tocan por abrir y guardar.
        expect(update).toHaveBeenCalledWith({ sale_price: 85 });
    });

    it('ponerle código a un producto que no tenía: se guarda', async () => {
        await patch(REAL.id, formOf(REAL, { sku: ' PEI-1 ' }));
        expect(update).toHaveBeenCalledWith({ sku: 'PEI-1' });
    });

    it('quitarle el código a un producto que lo tenía: la base guarda null, no un texto vacío', async () => {
        const res = await patch(CODED.id, formOf(CODED, { sku: '' }));
        expect(res.status).toBe(200);
        expect(update).toHaveBeenCalledWith({ sku: null });
    });

    it('un código de 1 carácter o de más de 60: 400 con mensaje en español', async () => {
        const short = await patch(REAL.id, formOf(REAL, { sku: 'A' }));
        expect(short.status).toBe(400);
        expect((await short.json()).error).toBe('El código debe tener al menos 2 caracteres, o déjalo vacío.');
        const long = await patch(REAL.id, formOf(REAL, { sku: 'x'.repeat(61) }));
        expect(long.status).toBe(400);
        expect((await long.json()).error).toBe('El código es muy largo (máximo 60 caracteres).');
        expect(update).not.toHaveBeenCalled();
    });
});

describe('POST /api/products · el código es opcional', () => {
    const NEW = { name: 'Polvo nuevo', category: 'General', stock: 0, min_stock: 1, cost: 100, price: 200 };

    it('sin código (vacío o ausente): se da de alta y la base recibe null', async () => {
        for (const body of [{ ...NEW, sku: '' }, { ...NEW, sku: '   ' }, NEW]) {
            rpc.mockClear();
            const res = await post(body);
            expect(res.status).toBe(201);
            expect(rpc).toHaveBeenCalledWith('create_catalog_product', expect.objectContaining({ p_sku: null, p_name: 'Polvo nuevo' }));
        }
    });

    it('con código: viaja recortado', async () => {
        await post({ ...NEW, sku: ' POL-2 ' });
        expect(rpc).toHaveBeenCalledWith('create_catalog_product', expect.objectContaining({ p_sku: 'POL-2' }));
    });

    it('devuelve el producto creado aunque no tenga código (lo busca por nombre, que es único)', async () => {
        products = [REAL, { ...REAL, id: 'nuevo', name: 'Polvo nuevo', sku: '' }];
        const res = await post({ ...NEW, sku: '' });
        expect((await res.json()).id).toBe('nuevo');
    });
});

describe('GET /api/products/stats · valor del inventario', () => {
    // 54 × $80 + 54 × $180 = $14,040 a precio de venta; 54 × $27 + 54 × $80 = $5,778 a costo.
    it('gerencia, cuenta principal y consulta: valor a precio de venta Y a costo', async () => {
        for (const role of ['admin', 'owner', 'viewer']) {
            SESSION.role = role;
            loadOptions.length = 0;
            const body = await (await STATS()).json();
            expect(body).toMatchObject({ total: 2, totalValue: 14040, totalCost: 5778 });
            expect(loadOptions[0]).toEqual({ withCost: true });
        }
    });

    it('recepción: solo el valor a precio de venta; el costo ni se pide ni se manda', async () => {
        SESSION.role = 'receptionist';
        const body = await (await STATS()).json();
        expect(body.totalValue).toBe(14040);
        expect(body).not.toHaveProperty('totalCost');
        expect(loadOptions[0]).toEqual({ withCost: false });
    });
});
