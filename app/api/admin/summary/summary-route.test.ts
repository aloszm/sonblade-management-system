import { beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

// Cuenta qué lee la ruta: cada viaje a la base cuenta cuando varias pantallas cargan a la vez.
let reads: string[] = [];
let rpcs: string[] = [];

const report = {
    window: { start: '2026-11-15T06:00:00Z', end: '2026-11-22T06:00:00Z', timezone: 'America/Mexico_City' },
    kpis: { total_revenue: 0, total_sales: 0, avg_ticket: 0, total_commissions: 0, expenses: 0, cuts: 0 },
    payment_breakdown: { cash: 0, card: 0, transfer: 0, other: 0 },
    barbers: [], service_breakdown: [], hourly: [], daily: [], weekly: [], low_stock: [], sales: null,
};

function builder(table: string) {
    const q = {
        select: () => q, eq: () => q, in: () => q, gte: () => q, lt: () => q, order: () => q,
        range: async () => ({ data: [], error: null }),
        single: async () => ({ data: table === 'businesses' ? { timezone: 'America/Mexico_City' } : null, error: null }),
    };
    return q;
}

vi.mock('@/lib/auth/context', () => ({
    requireAuthContext: async () => ({ businessId: 'b1', branchId: 'br1', role: 'owner', userId: 'u1' }),
    authErrorResponse: (error: Error) => Response.json({ error: error.message }, { status: 500 }),
}));
vi.mock('@/lib/supabase/server', () => ({
    createSupabaseServerClient: async () => ({
        from: (table: string) => { reads.push(table); return builder(table); },
        rpc: async (name: string) => { rpcs.push(name); return { data: name === 'business_report' ? report : [], error: null }; },
    }),
}));

import { GET } from './route';

beforeEach(() => { reads = []; rpcs = []; });

describe('GET /api/admin/summary', () => {
    it('Equipo (sin basis): una sola llamada a la base, business_report', async () => {
        const res = await GET(new NextRequest('http://x/api/admin/summary?period=week'));
        expect(res.status).toBe(200);
        expect(rpcs).toEqual(['business_report']);
        expect(reads).toEqual([]);
    });

    it('Panel (basis=finanzas): la zona horaria se lee una sola vez y se reutiliza para Finanzas', async () => {
        const res = await GET(new NextRequest('http://x/api/admin/summary?period=week&basis=finanzas'));
        expect(res.status).toBe(200);
        expect(reads.filter((t) => t === 'businesses')).toHaveLength(1);
        // Periodo actual y anterior: una lectura de ventas y de gastos por cada uno.
        expect(reads.filter((t) => t === 'sales')).toHaveLength(2);
        expect(reads.filter((t) => t === 'employees')).toHaveLength(1);
        // Más los costos de personal (sueldos por día y bonos) del periodo actual y del anterior, igual que Finanzas.
        expect([...rpcs].sort()).toEqual(['business_report', 'staff_cost_lines', 'staff_cost_lines']);
        const body = await res.json();
        expect(body.finance.period.timezone).toBe('America/Mexico_City');
        expect(body.kpis.netProfit).toBe(0);
    });
});
