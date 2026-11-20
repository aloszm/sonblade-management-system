import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Sesiones de prueba por puesto (nombres reales del equipo; sin PIN).
const BASE = { employeeId: null, businessId: 'biz', branchId: 'br1' };
const PEOPLE = {
    owner: { ...BASE, userId: 'u-alonso', email: 'alonso@x.invalid', displayName: 'Alonso', role: 'owner' as const },
    admin: { ...BASE, userId: 'u-sonia', email: 'sonia@x.invalid', displayName: 'Sonia', role: 'admin' as const },
    viewer: { ...BASE, userId: 'u-lucia', email: 'lucia@x.invalid', displayName: 'Lucía', role: 'viewer' as const },
    receptionist: { ...BASE, userId: 'u-emi', email: 'emi@x.invalid', displayName: 'Emi', role: 'receptionist' as const },
    cashier: { ...BASE, userId: 'u-dago', email: 'dago@x.invalid', displayName: 'Dago', role: 'cashier' as const },
    barber: { ...BASE, userId: 'u-dani', email: 'dani@x.invalid', displayName: 'Dani', role: 'barber' as const },
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
const rpc = vi.fn();
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({ rpc: (...args: unknown[]) => rpc(...args) }),
    getPublicConfig: () => ({ url: 'https://example.supabase.co', key: 'x' }),
}));

import { GET } from './route';
import { PATCH as updateTemplate, POST as createTemplate } from '../recurring-expenses/route';
import { POST as reorder } from '../recurring-expenses/reorder/route';

const req = (url: string, method = 'GET', body?: unknown) =>
    new NextRequest(new URL(url, 'http://localhost'), { method, body: body === undefined ? undefined : JSON.stringify(body), headers: { 'content-type': 'application/json' } });
const RAW = { month: '2026-11', today: '2026-11-20', status: 'current', needs_setup: false, fixed: { total: '13570.00', items: [] }, derived: { progress_pct: '86.0', covered: false } };
const CAT = '0b7e67f1-6c71-4bd3-8b50-c41fe6155499';
const A = '6c3ee0f8-5e86-4703-bd99-eaf0df33e862';
const B = '7d4ff1f9-6f97-4804-8e0a-fbf1ef44f973';

beforeEach(() => {
    current = PEOPLE.owner;
    rpc.mockReset();
    rpc.mockImplementation(async (fn: string) => {
        if (fn === 'break_even_period') return { data: RAW, error: null };
        if (fn === 'save_recurring_expense') return { data: { id: A, name: 'Luz', suggested_amount: '1000.00', every_months: 2 }, error: null };
        if (fn === 'reorder_recurring_expenses') return { data: [{ id: B, sort_order: 1 }, { id: A, sort_order: 2 }], error: null };
        return { data: null, error: null };
    });
});

describe('GET /api/break-even', () => {
    it.each(['owner', 'admin', 'viewer'] as const)('%s lo ve; solo la cuenta principal edita', async (who) => {
        current = PEOPLE[who];
        const res = await GET(req('/api/break-even?month=2026-10'));
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        const body = await res.json();
        expect(body.fixed.total).toBe(13570);
        expect(body.derived.progress_pct).toBe(86);
        expect(body.can_edit).toBe(who === 'owner');
        expect(rpc).toHaveBeenCalledWith('break_even_period', { p_branch_id: 'br1', p_month: '2026-10-01' });
    });
    it('sin mes: el mes en curso del negocio (la base decide)', async () => {
        await GET(req('/api/break-even'));
        expect(rpc).toHaveBeenCalledWith('break_even_period', { p_branch_id: 'br1', p_month: undefined });
    });
    it.each(['receptionist', 'cashier', 'barber'] as const)('%s: 403 sin llegar a la base', async (who) => {
        current = PEOPLE[who];
        expect((await GET(req('/api/break-even'))).status).toBe(403);
        expect(rpc).not.toHaveBeenCalled();
    });
    it.each(['2026-13', '2026-1', 'noviembre'])('mes inválido %s: 400', async (month) => {
        expect((await GET(req(`/api/break-even?month=${month}`))).status).toBe(400);
    });
    it('errores de la base con el mismo patrón que Finanzas (42501 → 403, 22023 → 400)', async () => {
        rpc.mockResolvedValueOnce({ data: null, error: { code: '42501', message: 'Solo la cuenta principal, gerencia y consulta ven el punto de equilibrio.' } });
        let res = await GET(req('/api/break-even'));
        expect(res.status).toBe(403);
        expect((await res.json()).error).toBe('Solo la cuenta principal, gerencia y consulta ven el punto de equilibrio.');
        rpc.mockResolvedValueOnce({ data: null, error: { code: '22023', message: 'El mes no es válido.' } });
        res = await GET(req('/api/break-even?month=2040-01'));
        expect(res.status).toBe(400);
    });
});

describe('gastos fijos: periodicidad, orden y estimado', () => {
    it('alta con cada 2 meses y estimado', async () => {
        const res = await createTemplate(req('/api/recurring-expenses', 'POST', {
            name: 'Luz', category_id: CAT, suggested_amount: 1000, day_of_month: 1, paid_from: 'envelope', every_months: 2, is_estimate: true,
        }));
        expect(res.status).toBe(201);
        expect(rpc).toHaveBeenCalledWith('save_recurring_expense', expect.objectContaining({ p_every_months: 2, p_is_estimate: true, p_sort_order: undefined }));
    });
    it('cambio de monto y periodicidad', async () => {
        const res = await updateTemplate(req('/api/recurring-expenses', 'PATCH', { id: A, suggested_amount: 1200, every_months: 2, is_estimate: false }));
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith('save_recurring_expense', expect.objectContaining({ p_id: A, p_suggested_amount: 1200, p_every_months: 2, p_is_estimate: false }));
    });
    it.each([[0], [13], [1.5]])('cada %s meses: 400', async (every) => {
        expect((await updateTemplate(req('/api/recurring-expenses', 'PATCH', { id: A, every_months: every }))).status).toBe(400);
        expect(rpc).not.toHaveBeenCalled();
    });
    it('reordenar: cuenta principal y gerencia; consulta y mostrador no', async () => {
        const res = await reorder(req('/api/recurring-expenses/reorder', 'POST', { ids: [B, A] }));
        expect(res.status).toBe(200);
        expect(rpc).toHaveBeenCalledWith('reorder_recurring_expenses', { p_branch_id: 'br1', p_ids: [B, A] });
        current = PEOPLE.admin;
        expect((await reorder(req('/api/recurring-expenses/reorder', 'POST', { ids: [A] }))).status).toBe(200);
        for (const who of ['viewer', 'receptionist', 'barber'] as const) {
            current = PEOPLE[who];
            expect((await reorder(req('/api/recurring-expenses/reorder', 'POST', { ids: [A] }))).status).toBe(403);
        }
    });
    it('reordenar con repetidos o vacío: 400', async () => {
        expect((await reorder(req('/api/recurring-expenses/reorder', 'POST', { ids: [A, A] }))).status).toBe(400);
        expect((await reorder(req('/api/recurring-expenses/reorder', 'POST', { ids: [] }))).status).toBe(400);
        expect((await reorder(req('/api/recurring-expenses/reorder', 'POST', { ids: ['x'] }))).status).toBe(400);
    });
});
