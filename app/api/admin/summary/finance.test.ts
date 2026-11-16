import { describe, expect, it } from 'vitest';
import { computeProfit, comparePeriods, type ProfitReport } from '@/lib/admin/profit';
import { financeFromProfit, summaryRange } from './finance';

function report(): ProfitReport {
    const input = {
        sales: [{ id: 's1', status: 'paid', paid_at: '2026-11-10T18:00:00Z' }, { id: 's2', status: 'refunded', paid_at: '2026-11-10T19:00:00Z' }],
        items: [
            { id: 'i1', sale_id: 's1', item_type: 'service' as const, product_id: null, item_name_snapshot: 'Corte', quantity: 1, discount_amount: 0, line_total: 200, employee_id: 'e1' },
            { id: 'i2', sale_id: 's1', item_type: 'product' as const, product_id: 'p1', item_name_snapshot: 'Cera', quantity: 2, discount_amount: 0, line_total: 300, unit_cost_snapshot: 50, commission_employee_id: 'e1' },
            { id: 'i3', sale_id: 's2', item_type: 'service' as const, product_id: null, item_name_snapshot: 'Corte', quantity: 1, discount_amount: 0, line_total: 999, employee_id: 'e1' },
        ],
        commissions: [{ sale_id: 's1', sale_item_id: 'i1', commission_amount: 100, status: 'generated', employee_id: 'e1' }],
        tips: [{ sale_id: 's1', amount: 40, status: 'generated', employee_id: 'e1', method: 'cash' }],
        payments: [{ sale_id: 's1', method: 'cash', amount: 500, status: 'confirmed' }],
        products: [], expenses: [{ amount: 30, category: 'Renta', status: 'posted' }],
    };
    const current = computeProfit(input);
    const before = computeProfit({ ...input, sales: [], items: [], commissions: [], tips: [], payments: [], expenses: [] });
    return { period: { from: '2026-11-10', to: '2026-11-10', timezone: 'America/Mexico_City' }, ...current, comparison: comparePeriods(current, before, { from: '2026-11-09', to: '2026-11-09' }) };
}

describe('cifras del Panel = Finanzas', () => {
    it('la utilidad resta comisiones, costo de producto y gastos; las propinas no entran', () => {
        const f = financeFromProfit(report());
        expect(f.revenue).toBe(500);
        expect(f.commissions).toBe(100);
        expect(f.productCost).toBe(100);
        expect(f.expenses).toBe(30);
        expect(f.profit).toBe(270);
        expect(f.tips).toBe(40);
        expect(f.sales).toBe(1);
        expect(f.avgTicket).toBe(500);
        expect(f.payments.cash).toBe(500);
        expect(f.previousProfit).toBeNull();
    });
    it('usa los mismos rangos que Finanzas', () => {
        expect(summaryRange('today', '2026-11-16')).toEqual({ from: '2026-11-16', to: '2026-11-16' });
        expect(summaryRange('week', '2026-11-16')).toEqual({ from: '2026-11-15', to: '2026-11-16' });
        expect(summaryRange('month', '2026-11-16')).toEqual({ from: '2026-11-01', to: '2026-11-16' });
    });
});
