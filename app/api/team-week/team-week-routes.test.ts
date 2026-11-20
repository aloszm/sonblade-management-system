import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';

// La semana del equipo la ve quien ve la pantalla Equipo (dueño, gerencia, consulta): ni recepción ni barberos.
let roles: unknown;
const EMP = '11111111-1111-4111-8111-111111111111';

function builder(table: string) {
    const rows: Record<string, unknown[]> = {
        employees: [{ id: EMP, display_name: 'Deya', is_barber: true, is_active: true }],
        sales: [{ id: 's1', folio: 'V2611-0001', status: 'paid', paid_at: '2026-11-16T17:00:00Z' }],
        sale_items: [{ id: 'i1', sale_id: 's1', item_type: 'service', item_name_snapshot: 'Barba', quantity: 2, line_total: 240, employee_id: EMP, commission_employee_id: null }],
        commission_entries: [{ id: 'c1', sale_id: 's1', sale_item_id: 'i1', employee_id: EMP, status: 'generated', commission_amount: 120, basis_amount: 240, percentage_snapshot: 50 }],
        sale_tips: [],
    };
    const q = {
        select: () => q, eq: () => q, in: () => q, gte: () => q, lt: () => q, order: () => q,
        range: async () => ({ data: rows[table] ?? [], error: null }),
        single: async () => ({ data: table === 'businesses' ? { timezone: 'America/Mexico_City' } : null, error: null }),
    };
    return q;
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth/context', () => ({
    requireAuthContext: async (r: unknown) => { roles = r; return { businessId: 'b1', branchId: 'br1', role: 'admin', userId: 'u1' }; },
    authErrorResponse: (error: Error) => Response.json({ error: error.message }, { status: 500 }),
}));
vi.mock('@/lib/supabase/server', () => ({ createSupabaseServerClient: async () => ({ from: (t: string) => builder(t) }) }));

import { GET as list } from './route';
import { GET as one } from './[employeeId]/route';

beforeEach(() => { roles = undefined; });

describe('/api/team-week', () => {
    it('lista la semana de cada persona y solo para los puestos de Equipo', async () => {
        const res = await list();
        expect(roles).toEqual(MANAGEMENT_READ_ROLES);
        const body = await res.json();
        expect(body.window.startDay).toMatch(/^\d{4}-\d{2}-\d{2}$/);
        expect(body.people[0]).toMatchObject({ employeeId: EMP, revenue: 240, commission: 120, services: { count: 2, percent: 50 } });
    });

    it('el desglose de una persona trae sus renglones y los mismos totales', async () => {
        const res = await one(new NextRequest(`http://x/api/team-week/${EMP}`), { params: Promise.resolve({ employeeId: EMP }) });
        expect(roles).toEqual(MANAGEMENT_READ_ROLES);
        const body = await res.json();
        expect(body.lines).toHaveLength(1);
        expect(body.lines[0]).toMatchObject({ saleId: 's1', folio: 'V2611-0001', base: 240, percent: 50, commission: 120 });
        expect(body.summary.earned).toBe(120);
    });

    it('un identificador que no es de persona da 404', async () => {
        const res = await one(new NextRequest('http://x/api/team-week/zzz'), { params: Promise.resolve({ employeeId: 'zzz' }) });
        expect(res.status).toBe(404);
    });
});
