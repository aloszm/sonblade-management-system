import React from 'react';
import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { comparePeriods, computeProfit, type ProfitReport } from '@/lib/admin/profit';
import { Waterfall, KpiStrip, Per100 } from '@/app/administracion/sections';
import { formatMoney } from '@/lib/utils/money';
import { waterfallRows } from './waterfall';

/** Reporte real de `computeProfit` (la misma fórmula de Finanzas) con sueldos y, si se pide, bonos. */
function report(opts: { bonus?: number } = {}): ProfitReport {
    const input = {
        sales: [{ id: 's1', status: 'paid', paid_at: '2026-11-18T18:00:00Z' }],
        items: [
            { id: 'i1', sale_id: 's1', item_type: 'service' as const, product_id: null, item_name_snapshot: 'Corte', quantity: 1, discount_amount: 0, line_total: 3000, employee_id: 'e1' },
            { id: 'i2', sale_id: 's1', item_type: 'product' as const, product_id: 'p1', item_name_snapshot: 'Cera', quantity: 2, discount_amount: 0, line_total: 400, unit_cost_snapshot: 50, commission_employee_id: 'e-dago' },
        ],
        commissions: [{ sale_id: 's1', sale_item_id: 'i1', commission_amount: 1000, status: 'generated', employee_id: 'e1' }],
        tips: [], payments: [{ sale_id: 's1', method: 'cash', amount: 3400, status: 'confirmed' }],
        products: [], expenses: [{ amount: 150, category: 'Renta', status: 'posted' }],
        staffCosts: [
            { employee_id: 'e-dago', kind: 'wage' as const, cost_date: '2026-11-16', amount: 320 },
            { employee_id: 'e-dago', kind: 'wage' as const, cost_date: '2026-11-17', amount: 320 },
            { employee_id: 'e-dago', kind: 'wage' as const, cost_date: '2026-11-18', amount: 320 },
            ...(opts.bonus ? [{ employee_id: 'e1', kind: 'bonus' as const, cost_date: '2026-11-18', amount: opts.bonus }] : []),
        ],
    };
    const current = computeProfit(input);
    const before = computeProfit({ ...input, sales: [], items: [], commissions: [], tips: [], payments: [], expenses: [], staffCosts: [] });
    return { period: { from: '2026-11-15', to: '2026-11-21', timezone: 'America/Mexico_City' }, ...current, comparison: comparePeriods(current, before, { from: '2026-11-08', to: '2026-11-14' }) };
}

describe('cascada de utilidad (Finanzas)', () => {
    it('"Sueldos" es un paso propio, separado de "Comisiones", y la cascada suma exactamente a la utilidad de la API', () => {
        const data = report();
        const rows = waterfallRows(data);
        expect(rows.map((r) => r.key)).toEqual(['rev', 'com', 'wage', 'cost', 'exp', 'net']);
        const by = Object.fromEntries(rows.map((r) => [r.key, r.amount]));
        expect(by.wage).toBe(960);
        expect(by.com).toBe(1000);
        expect(by.wage).not.toBe(by.com);
        const outflows = rows.filter((r) => r.sign === '−').reduce((n, r) => n + r.amount, 0);
        expect(Math.round((by.rev - outflows) * 100) / 100).toBe(by.net);
        expect(by.net).toBe(data.profit);
        // El último paso de salida termina exactamente en la utilidad que devolvió la API.
        expect(rows.find((r) => r.key === 'exp')!.start).toBe(data.profit);
    });

    it('"Bonos" solo aparece si es mayor que cero, y la cascada sigue sumando a la utilidad', () => {
        expect(waterfallRows(report()).map((r) => r.key)).not.toContain('bonus');
        const data = report({ bonus: 300 });
        const rows = waterfallRows(data);
        expect(rows.map((r) => r.key)).toEqual(['rev', 'com', 'wage', 'bonus', 'cost', 'exp', 'net']);
        const outflows = rows.filter((r) => r.sign === '−').reduce((n, r) => n + r.amount, 0);
        expect(Math.round((rows[0].amount - outflows) * 100) / 100).toBe(data.profit);
        expect(data.profit).toBe(report().profit - 300);
    });

    it('la pantalla dibuja cada paso con su importe y la utilidad neta', () => {
        const data = report({ bonus: 300 });
        render(<Waterfall data={data} />);
        const waterfall = screen.getByTestId('waterfall');
        expect(within(screen.getByTestId('step-wage')).getByText('Sueldos')).toBeInTheDocument();
        expect(screen.getByTestId('step-wage')).toHaveTextContent('$960.00');
        expect(screen.getByTestId('step-com')).toHaveTextContent('$1,000.00');
        expect(screen.getByTestId('step-bonus')).toHaveTextContent('$300.00');
        expect(screen.getByTestId('step-net')).toHaveTextContent(formatMoney(data.profit, { cents: true }));
        expect(waterfall).toHaveTextContent('3 días trabajados');
    });

    it('los KPI muestran "Sueldos" aparte de "Comisiones"; sin bonos no hay tarjeta de bonos', () => {
        const { unmount } = render(<KpiStrip data={report()} />);
        expect(screen.getByTestId('kpi-sueldos')).toHaveTextContent('$960.00');
        expect(screen.getByTestId('kpi-comisiones')).toHaveTextContent('$1,000.00');
        expect(screen.queryByTestId('kpi-bonos')).toBeNull();
        unmount();
        render(<KpiStrip data={report({ bonus: 300 })} />);
        expect(screen.getByTestId('kpi-bonos')).toHaveTextContent('$300.00');
    });

    it('"A dónde va cada $100" también reparte los sueldos', () => {
        render(<Per100 data={report()} />);
        expect(screen.getByText('Sueldos')).toBeInTheDocument();
    });
});
