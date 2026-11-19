// B4 — Una sola utilidad. Mismo juego de datos que supabase/tests/one_profit.test.sql:
// venta pagada = corte $300 (Dani, comisión $150) + 2 ceras a $100 con costo guardado $40 (vendió Dago,
// comisión $40) + propina $50; venta anulada de $500; gasto A $120 hecho en el periodo; gasto C $70 cancelado.
// La base (private.profit_kpis → report_financial_period) devolvió net 110 y aporte de Dani 150: aquí se
// comprueba que computeProfit (Finanzas) y toAdminSummary dicen lo mismo.
import { describe, expect, it } from 'vitest';
import { computeProfit, type ProfitInput } from '@/lib/admin/profit';
import { adminMoney, toAdminSummary, type BusinessReport } from '@/lib/reports/business-report';

const DANI = 'dani';
const DAGO = 'dago';
const input: ProfitInput = {
    sales: [
        { id: 's1', status: 'paid', paid_at: '2031-03-05T19:00:00Z' },
        { id: 's2', status: 'refunded', paid_at: '2031-03-05T19:00:00Z' },
    ],
    items: [
        { id: 'i1', sale_id: 's1', item_type: 'service', product_id: null, item_name_snapshot: 'Corte', quantity: 1, discount_amount: 0, line_total: 300, employee_id: DANI },
        { id: 'i2', sale_id: 's1', item_type: 'product', product_id: 'cera', item_name_snapshot: 'Cera', quantity: 2, discount_amount: 0, line_total: 200, unit_cost_snapshot: 40, commission_employee_id: DAGO },
        { id: 'i3', sale_id: 's2', item_type: 'service', product_id: null, item_name_snapshot: 'Corte anulado', quantity: 1, discount_amount: 0, line_total: 500, employee_id: DANI },
    ],
    commissions: [
        { sale_id: 's1', sale_item_id: 'i1', commission_amount: 150, status: 'generated', employee_id: DANI },
        { sale_id: 's1', sale_item_id: 'i2', commission_amount: 40, status: 'generated', employee_id: DAGO },
        { sale_id: 's2', sale_item_id: 'i3', commission_amount: 250, status: 'reversed', employee_id: DANI },
    ],
    tips: [{ sale_id: 's1', amount: 50, status: 'generated', employee_id: DANI, method: 'cash' }],
    products: [{ id: 'cera', name: 'Cera', cost_price: 55 }],
    expenses: [
        { amount: 120, category: 'Prueba', status: 'posted', incurred_at: '2031-03-05T19:00:00Z' },
        { amount: 70, category: 'Prueba', status: 'cancelled', incurred_at: '2031-03-05T19:00:00Z' },
    ],
};

// Lo que entregó la base en la prueba SQL (kpis.profit de business_report).
const dbReport = (profit: NonNullable<BusinessReport['kpis']>['profit']): BusinessReport => ({
    window: { start: '', end: '', timezone: 'America/Mexico_City' },
    kpis: { total_revenue: 500, total_sales: 1, avg_ticket: 500, total_commissions: 190, expenses: 999, cuts: 1, profit },
    payment_breakdown: { cash: 500, card: 0, transfer: 0, other: 0 },
    barbers: [], service_breakdown: [], hourly: [], daily: [], weekly: [], low_stock: [], sales: null,
});

describe('B4: una sola utilidad', () => {
    const finance = computeProfit(input);

    it('Finanzas: ventas − comisiones − costo guardado − gastos = 110', () => {
        expect(finance.revenue.total).toBe(500);
        expect(finance.commissions.total).toBe(190);
        expect(finance.productCost.total).toBe(80); // usa el costo guardado (40), no el del catálogo (55)
        expect(finance.expenses.total).toBe(120);
        expect(finance.profit).toBe(110);
    });

    it('toAdminSummary usa el bloque profit de la base y coincide con Finanzas', () => {
        const summary = toAdminSummary(dbReport({
            revenue: 500, commissions: 190, product_cost: 80, expenses: 120, net: 110, net_kind: 'profit', units_without_cost: 0,
        }));
        expect(summary.kpis.netProfit).toBe(finance.profit);
        expect(summary.kpis.totalCommissions).toBe(finance.commissions.total);
        expect(summary.kpis.totalProductCost).toBe(finance.productCost.total);
        expect(summary.kpis.totalExpenses).toBe(finance.expenses.total);
        expect(summary.kpis.totalRevenue).toBe(finance.revenue.total);
    });

    it('el aporte por persona (sin gastos generales) coincide con "keeps" de Finanzas', () => {
        const dani = finance.barbers.find((b) => b.employeeId === DANI);
        expect(dani?.keeps).toBe(150);
    });

    it('con una base anterior (sin profit) sigue respondiendo con la fórmula vieja', () => {
        const money = adminMoney(dbReport(undefined).kpis);
        expect(money.net).toBe(500 - 190 - 999);
        expect(money.productCost).toBe(0);
    });
});
