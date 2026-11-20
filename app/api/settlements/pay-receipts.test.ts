import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Recibos de pago: solo owner, admin y viewer (decisión temporal del dueño, 20 nov 2026).
const DANI = '3b1c3f58-8a39-4a63-9b2b-1f0f6c0c7a11';
const RECEIPT = '9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d';
const BASE = { businessId: 'biz', branchId: 'br1', userId: 'u1', email: 'x@gallo-420.barberos.invalid', displayName: 'Persona' };
let role: 'owner' | 'admin' | 'viewer' | 'receptionist' | 'cashier' | 'barber' = 'owner';

vi.mock('@/lib/auth/context', async (importOriginal) => {
    const real = await importOriginal<typeof import('@/lib/auth/context')>();
    return {
        ...real,
        requireAuthContext: async (roles?: string[]) => {
            if (roles && !roles.includes(role)) throw new real.AuthorizationError();
            return { ...BASE, employeeId: DANI, role };
        },
    };
});

const tables: Record<string, unknown> = {};
const touched: string[] = [];
function chain(table: string) {
    touched.push(table);
    const proxy: unknown = new Proxy({}, {
        get(_t, prop: string) {
            if (prop === 'then') return (resolve: (v: unknown) => void) => resolve({ data: tables[table] ?? [], error: null });
            if (prop === 'single' || prop === 'maybeSingle') return async () => ({ data: tables[`${table}:one`] ?? { timezone: 'America/Mexico_City', display_name: 'Dani' }, error: null });
            return () => proxy;
        },
    });
    return proxy;
}
const rpc = vi.fn(async () => ({ data: { receipt_number: 'R-0001' }, error: null }));
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({ from: (t: string) => chain(t), rpc }),
}));
vi.mock('@/lib/reports/business-report', () => ({
    fetchBusinessReport: async () => ({ barbers: [{ cuts: 4, service_commission: 100, product_commission: 30 }], sales: [] }),
    sumEmployeeTips: async () => 0, toBarberProfile: () => ({}), toBarberStats: () => ({}),
}));

import { GET as preview } from './route';
import { GET as history } from './history/route';
import { GET as receipt } from './[id]/receipt/route';
import { GET as stats } from '../barbers/[id]/stats/route';
import { PAY_RECEIPT_ROLES, canSeePayReceipts } from '@/lib/auth/roles';

const req = (url: string) => new NextRequest(new URL(url, 'http://localhost'));
const ALLOWED = ['owner', 'admin', 'viewer'] as const;
const DENIED = ['receptionist', 'cashier', 'barber'] as const;

beforeEach(() => {
    role = 'owner';
    touched.length = 0;
    for (const k of Object.keys(tables)) delete tables[k];
    rpc.mockClear();
});

describe('canSeePayReceipts: un solo punto de verdad', () => {
    it.each(ALLOWED)('%s sí', (r) => expect(canSeePayReceipts(r)).toBe(true));
    it.each(DENIED)('%s no', (r) => expect(canSeePayReceipts(r)).toBe(false));
    it('acepta también el rol de pantalla de /api/auth/me', () => {
        expect(canSeePayReceipts('admin')).toBe(true);
        expect(canSeePayReceipts('recepcion')).toBe(false);
        expect(canSeePayReceipts('barber')).toBe(false);
        expect(canSeePayReceipts(null)).toBe(false);
        expect(canSeePayReceipts(undefined)).toBe(false);
    });
    it('la lista es exactamente owner, admin y viewer', () => expect([...PAY_RECEIPT_ROLES].sort()).toEqual(['admin', 'owner', 'viewer']));
});

describe('API de recibos de pago por puesto', () => {
    it.each(DENIED)('%s recibe 403 en la lista de recibos, la vista previa y el recibo (aunque sea el suyo)', async (r) => {
        role = r;
        expect((await history()).status).toBe(403);
        expect((await preview(req('/api/settlements'))).status).toBe(403);
        expect((await receipt(req(`/api/settlements/${RECEIPT}/receipt`), { params: Promise.resolve({ id: RECEIPT }) })).status).toBe(403);
        expect(touched).not.toContain('commission_settlements');
        expect(rpc).not.toHaveBeenCalled();
    });

    it.each(ALLOWED)('%s sigue viendo la lista, la vista previa y el recibo', async (r) => {
        role = r;
        tables.commission_settlements = [{ id: RECEIPT, employee_id: DANI, receipt_number: 'R-0001', period_start: '2026-11-08', period_end: '2026-11-14', total_amount: 500, paid_at: '2026-11-14T22:00:00Z', status: 'paid' }];
        expect((await history()).status).toBe(200);
        expect((await preview(req('/api/settlements?period_start=2026-11-08'))).status).toBe(200);
        const res = await receipt(req(`/api/settlements/${RECEIPT}/receipt`), { params: Promise.resolve({ id: RECEIPT }) });
        expect(res.status).toBe(200);
        expect((await res.json()).receipt_number).toBe('R-0001');
    });
});

describe('«Mi semana» sigue con sus números, sin recibos para barbero y recepción', () => {
    const call = () => stats(req(`/api/barbers/${DANI}/stats?view=my-week`), { params: Promise.resolve({ id: DANI }) });

    it.each(['barber', 'receptionist', 'cashier'] as const)('%s ve lo que lleva (comisiones) pero no se consultan ni se devuelven recibos', async (r) => {
        role = r;
        tables.commission_settlements = [{ id: RECEIPT, receipt_number: 'R-0001', period_start: '2026-11-08', period_end: '2026-11-14', total_amount: 500, paid_at: '2026-11-14T22:00:00Z', status: 'paid' }];
        const res = await call();
        expect(res.status).toBe(200);
        const body = await res.json();
        expect(body.earnings.serviceCents).toBe(10000);
        expect(body.earnings.productCents).toBe(3000);
        expect(body.receiptsVisible).toBe(false);
        expect(body.receipts).toEqual([]);
        expect(body.payout.receipts).toEqual([]);
        expect(touched).not.toContain('commission_settlements');
        expect(JSON.stringify(body)).not.toContain('R-0001');
    });

    it.each(['owner', 'admin'] as const)('%s ve sus números y los recibos pagados', async (r) => {
        role = r;
        tables.commission_settlements = [{ id: RECEIPT, receipt_number: 'R-0001', period_start: '2026-11-08', period_end: '2026-11-14', total_amount: 500, paid_at: '2026-11-14T22:00:00Z', status: 'paid' }];
        const body = await (await call()).json();
        expect(body.earnings.serviceCents).toBe(10000);
        expect(body.receiptsVisible).toBe(true);
        expect(body.receipts).toHaveLength(1);
        expect(touched).toContain('commission_settlements');
    });
});
