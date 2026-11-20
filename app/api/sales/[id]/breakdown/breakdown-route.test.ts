import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

type Role = 'owner' | 'admin' | 'viewer' | 'receptionist' | 'cashier' | 'barber';
const SESSION = { userId: 'u1', email: 'x@gallo-420.barberos.invalid', displayName: 'X', employeeId: null, businessId: 'biz', branchId: 'br1' };
let role: Role = 'admin';
vi.mock('@/lib/auth/context', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/context')>();
    return {
        ...real,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(role)) throw new real.AuthorizationError();
            return { ...SESSION, role };
        },
    };
});

// Base falsa: responde por tabla y anota qué columnas se pidieron (para comprobar que recepción nunca pide el costo).
const SALE_ID = '9b2f6a3c-0a8e-4c1e-9f1a-2d3c4b5a6e7f';
let tables: Record<string, unknown>;
let errors: Record<string, { code: string; message: string }> = {};
const selects: { table: string; columns: string }[] = [];
const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({
        from: (table: string) => {
            const query = {
                select: (columns: string) => { selects.push({ table, columns }); return query; },
                match: () => query, eq: () => query, in: () => query, order: () => query,
                maybeSingle: async () => ({ data: tables[table] ?? null, error: errors[table] ?? null }),
                then: (resolve: (v: unknown) => unknown) => resolve({ data: tables[table] ?? [], error: errors[table] ?? null }),
            };
            return query;
        },
        rpc: (...args: unknown[]) => rpc(...args),
    }),
    getPublicConfig: () => ({ url: 'https://example.supabase.co', key: 'x' }),
}));

import { GET } from './route';

const call = (id = SALE_ID) => GET(new NextRequest(new URL(`/api/sales/${id}/breakdown`, 'http://localhost')), { params: Promise.resolve({ id }) });

beforeEach(() => {
    role = 'admin';
    selects.length = 0;
    errors = {};
    rpc.mockReset();
    rpc.mockResolvedValue({ data: [{ product_id: 'p1', cost_price: 45 }], error: null });
    tables = {
        sales: { id: SALE_ID, folio: 'V2611-0177', status: 'paid', subtotal_amount: 330, discount_amount: 0, total_amount: 330 },
        sale_items: [
            { id: 'i1', item_type: 'product', product_id: 'p1', item_name_snapshot: 'Pomada Negra', quantity: 1, unit_price: 180, discount_amount: 0, line_total: 180, employee_id: null, commission_employee_id: 'e-sonia', unit_cost_snapshot: 45 },
            { id: 'i2', item_type: 'service', product_id: null, item_name_snapshot: 'Corte adulto', quantity: 1, unit_price: 150, discount_amount: 0, line_total: 150, employee_id: 'e-sonia', commission_employee_id: null },
        ],
        commission_entries: [
            { sale_item_id: 'i1', employee_id: 'e-sonia', basis: 'price_after_discount', basis_amount: 180, calculation_type: 'percentage', percentage_snapshot: 20, fixed_amount_snapshot: null, commission_amount: 36, status: 'generated' },
            { sale_item_id: 'i2', employee_id: 'e-sonia', basis: 'price_before_discount', basis_amount: 150, calculation_type: 'percentage', percentage_snapshot: 50, fixed_amount_snapshot: null, commission_amount: 75, status: 'generated' },
        ],
        sale_tips: [{ employee_id: 'e-sonia', amount: 30, method: 'cash', status: 'generated' }],
        payments: [{ method: 'cash', amount: 330, status: 'confirmed' }],
        commission_holds: [],
        employees: [{ id: 'e-sonia', display_name: 'Sonia Martínez' }],
    };
});

describe('GET /api/sales/[id]/breakdown: quién recibe qué', () => {
    for (const r of ['owner', 'admin', 'viewer'] as const) {
        it(`${r}: recibe todo, con el costo y lo que le queda a la barbería`, async () => {
            role = r;
            const res = await call();
            expect(res.status).toBe(200);
            expect(res.headers.get('Cache-Control')).toBe('no-store');
            const body = await res.json();
            expect(body.scope).toBe('full');
            expect(body.shop).toMatchObject({ productCost: 45, keeps: 174 }); // 330 − 111 − 45
            expect(body.summary).toMatchObject({ charged: 360, toTeam: 141 });
            expect(body.lines[0]).toMatchObject({ name: 'Pomada Negra', commission: 36, beneficiaryName: 'Sonia', cost: 45 });
            expect(selects.find((s) => s.table === 'sale_items')?.columns).toContain('unit_cost_snapshot');
            expect(selects.some((s) => s.table === 'commission_holds')).toBe(true);
        });
    }

    for (const r of ['receptionist', 'cashier'] as const) {
        it(`${r}: recibe comisiones y propina, y NADA del costo ni del resultado de la barbería`, async () => {
            role = r;
            const res = await call();
            expect(res.status).toBe(200);
            const text = await res.text();
            const body = JSON.parse(text);
            expect(body.scope).toBe('front_desk');
            expect(body.shop).toBeUndefined();
            expect(body.summary).toMatchObject({ commissionsTotal: 111, tipsTotal: 30, toTeam: 141, charged: 360 });
            expect(body.lines[0]).toMatchObject({ commission: 36, percentage: 20, beneficiaryName: 'Sonia' });
            expect(body.tips).toHaveLength(1);
            // Ni el nombre de los campos ni su valor (45 es el costo; 174 lo que queda) salen en la respuesta.
            expect(text).not.toMatch(/cost|keeps|shop|formula/i);
            expect(text).not.toContain('174');
            // Y el servidor ni siquiera lo pide a la base.
            expect(selects.find((s) => s.table === 'sale_items')?.columns).not.toContain('cost');
            expect(selects.some((s) => s.table === 'commission_holds')).toBe(false);
            expect(rpc).not.toHaveBeenCalled();
        });
    }

    it('barbero: 403, como el ticket (hoy no puede abrir ventas)', async () => {
        role = 'barber';
        const res = await call();
        expect(res.status).toBe(403);
        expect(selects).toHaveLength(0);
    });
});

describe('GET /api/sales/[id]/breakdown: errores', () => {
    it('id que no es un uuid: 404', async () => {
        const res = await call('no-es-uuid');
        expect(res.status).toBe(404);
        expect((await res.json()).error).toBe('Venta no encontrada.');
    });
    it('venta que no existe en la sucursal: 404', async () => {
        tables.sales = null;
        const res = await call();
        expect(res.status).toBe(404);
    });
    it('sin comisiones todavía: responde 200 con los renglones en espera y generatedCount 0', async () => {
        tables.commission_entries = [];
        tables.sale_tips = [];
        const body = await (await call()).json();
        expect(body.generatedCount).toBe(0);
        expect(body.pendingCount).toBe(2);
        expect(body.lines.every((l: { pending: boolean }) => l.pending)).toBe(true);
    });
    it('venta anulada: montos revertidos', async () => {
        tables.sales = { ...(tables.sales as object), status: 'refunded' };
        tables.commission_entries = (tables.commission_entries as { status: string }[]).map((c) => ({ ...c, status: 'reversed' }));
        tables.sale_tips = (tables.sale_tips as { status: string }[]).map((t) => ({ ...t, status: 'reversed' }));
        tables.payments = (tables.payments as { status: string }[]).map((p) => ({ ...p, status: 'reversed' }));
        const body = await (await call()).json();
        expect(body.voided).toBe(true);
        expect(body.summary).toMatchObject({ commissionsTotal: 111, tipsTotal: 30 });
        expect(body.lines.every((l: { reversed: boolean }) => l.reversed)).toBe(true);
    });
    it('si el costo no está guardado en el renglón, gerencia lo toma del catálogo (product_costs)', async () => {
        (tables.sale_items as { unit_cost_snapshot?: unknown }[])[0].unit_cost_snapshot = null;
        const body = await (await call()).json();
        expect(rpc).toHaveBeenCalledWith('product_costs', { p_branch_id: 'br1' });
        expect(body.shop.productCost).toBe(45);
    });
    it('un error de permiso de la base se traduce a 403 con el formato de siempre', async () => {
        errors.commission_entries = { code: '42501', message: 'permission denied' };
        const res = await call();
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe('No tienes permiso para esta operación.');
    });
});
