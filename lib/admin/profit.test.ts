import { describe, expect, it } from 'vitest';
import {
    computeProfit, isValidDay, profitPresetRange, rangeDays, toCents,
    type CommissionRow, type ProfitInput, type SaleItemRow,
} from './profit';

const sale = (id: string, status = 'paid') => ({ id, status, paid_at: '2026-11-10T18:00:00Z' });
const service = (id: string, saleId: string, lineTotal: number, discount = 0): SaleItemRow => ({
    id, sale_id: saleId, item_type: 'service', product_id: null, item_name_snapshot: 'Corte',
    quantity: 1, discount_amount: discount, line_total: lineTotal,
});
const product = (id: string, saleId: string, productId: string, qty: number, lineTotal: number): SaleItemRow => ({
    id, sale_id: saleId, item_type: 'product', product_id: productId, item_name_snapshot: 'Cera',
    quantity: qty, discount_amount: 0, line_total: lineTotal,
});
const comm = (saleId: string, itemId: string, amount: number | string, status = 'generated'): CommissionRow => ({
    sale_id: saleId, sale_item_id: itemId, commission_amount: amount, status,
});
const empty: ProfitInput = { sales: [], items: [], commissions: [], tips: [], products: [], expenses: [] };

describe('utilidad real', () => {
    it('caso normal: ingresos − comisiones − costo de producto − gastos', () => {
        const r = computeProfit({
            sales: [sale('s1'), sale('s2')],
            items: [service('i1', 's1', 200), product('i2', 's2', 'p1', 2, 300)],
            commissions: [comm('s1', 'i1', 100), comm('s2', 'i2', 60)],
            tips: [],
            products: [{ id: 'p1', name: 'Cera', cost_price: 80 }],
            expenses: [
                { amount: 50, category: 'General', status: 'posted' },
                { amount: '25.50', category: 'Limpieza', status: 'posted' },
                { amount: 999, category: 'General', status: 'cancelled' },
            ],
        });
        expect(r.revenue).toEqual({ services: 200, products: 300, total: 500, discounts: 0 });
        expect(r.commissions).toEqual({ services: 100, products: 60, total: 160 });
        expect(r.productCost.total).toBe(160);
        expect(r.expenses.total).toBe(75.5);
        expect(r.expenses.byCategory).toEqual([
            { category: 'General', total: 50, count: 1 },
            { category: 'Limpieza', total: 25.5, count: 1 },
        ]);
        expect(r.profit).toBe(104.5); // 500 − 160 − 160 − 75.5
        expect(r.marginPct).toBe(20.9);
        expect(r.productsWithoutCost).toBe(0);
        expect(r.counts).toMatchObject({ sales: 2, voidedExcluded: 0, serviceUnits: 1, productUnits: 2 });
    });

    it('excluye la venta anulada con sus comisiones y propinas', () => {
        const r = computeProfit({
            ...empty,
            sales: [sale('s1'), sale('s2', 'refunded')],
            items: [service('i1', 's1', 200), service('i2', 's2', 250)],
            commissions: [comm('s1', 'i1', 100), comm('s2', 'i2', 125, 'reversed'), comm('s2', 'i2', 125)],
            tips: [{ sale_id: 's2', amount: 30, status: 'generated' }],
        });
        expect(r.revenue.total).toBe(200);
        expect(r.commissions.total).toBe(100);
        expect(r.tips.total).toBe(0);
        expect(r.counts.voidedExcluded).toBe(1);
        expect(r.profit).toBe(100);
    });

    it('el descuento ya viene restado en line_total; no se resta otra vez', () => {
        // Corte de $200 con $50 de descuento: line_total 150; la comisión (RB-04) es sobre 200.
        const r = computeProfit({ ...empty, sales: [sale('s1')], items: [service('i1', 's1', 150, 50)], commissions: [comm('s1', 'i1', 100)] });
        expect(r.revenue.total).toBe(150);
        expect(r.revenue.discounts).toBe(50);
        expect(r.profit).toBe(50);
    });

    it('la propina se muestra aparte y no cuenta como ingreso ni se resta', () => {
        const r = computeProfit({
            ...empty, sales: [sale('s1')], items: [service('i1', 's1', 200)], commissions: [comm('s1', 'i1', 100)],
            tips: [{ sale_id: 's1', amount: 40, status: 'generated' }, { sale_id: 's1', amount: 10, status: 'reversed' }],
        });
        expect(r.tips).toEqual({ total: 40, count: 1 });
        expect(r.revenue.total).toBe(200);
        expect(r.profit).toBe(100);
    });

    it('un producto sin costo no se toma como cero en silencio', () => {
        const r = computeProfit({
            ...empty, sales: [sale('s1')],
            items: [product('i1', 's1', 'p1', 3, 300), product('i2', 's1', 'p2', 1, 100)],
            products: [{ id: 'p1', name: 'Cera', cost_price: null }, { id: 'p2', name: 'Shampoo', cost_price: '40.00' }],
        });
        expect(r.productsWithoutCost).toBe(1);
        expect(r.productCost.unitsWithoutCost).toBe(3);
        expect(r.productCost.missing).toEqual([{ productId: 'p1', name: 'Cera', units: 3 }]);
        expect(r.productCost.total).toBe(40);
    });

    it('un costo de cero registrado sí cuenta como costo', () => {
        const r = computeProfit({ ...empty, sales: [sale('s1')], items: [product('i1', 's1', 'p1', 1, 50)], products: [{ id: 'p1', name: 'Muestra', cost_price: 0 }] });
        expect(r.productsWithoutCost).toBe(0);
        expect(r.productCost.total).toBe(0);
    });

    it('periodo vacío: todo en cero y margen null (sin dividir entre cero)', () => {
        const r = computeProfit(empty);
        expect(r.profit).toBe(0);
        expect(r.marginPct).toBeNull();
        expect(r.expenses.byCategory).toEqual([]);
    });

    it('solo gastos: utilidad negativa y margen null', () => {
        const r = computeProfit({ ...empty, expenses: [{ amount: 120, category: null, status: 'posted' }] });
        expect(r.profit).toBe(-120);
        expect(r.marginPct).toBeNull();
        expect(r.expenses.byCategory).toEqual([{ category: 'General', total: 120, count: 1 }]);
    });

    it('redondeo: tres importes de 33.33 con comisión al 50 %', () => {
        const r = computeProfit({
            ...empty, sales: [sale('s1'), sale('s2'), sale('s3')],
            items: [service('i1', 's1', 33.33), service('i2', 's2', 33.33), service('i3', 's3', 33.33)],
            // La base guarda numeric(12,2): 33.33 × 0.5 = 16.665 → 16.67.
            commissions: [comm('s1', 'i1', '16.67'), comm('s2', 'i2', '16.67'), comm('s3', 'i3', '16.67')],
            expenses: [{ amount: 0.1, category: 'General', status: 'posted' }, { amount: 0.2, category: 'General', status: 'posted' }],
        });
        expect(r.revenue.total).toBe(99.99);
        expect(r.commissions.total).toBe(50.01);
        expect(r.expenses.total).toBe(0.3); // 0.1 + 0.2 en flotante daría 0.30000000000000004
        expect(r.profit).toBe(49.68);
        expect(r.marginPct).toBe(49.7);
    });

    it('costo con cantidad × costo unitario sin errores de flotante', () => {
        const r = computeProfit({ ...empty, sales: [sale('s1')], items: [product('i1', 's1', 'p1', 3, 150)], products: [{ id: 'p1', name: 'Cera', cost_price: '19.99' }] });
        expect(r.productCost.total).toBe(59.97);
    });

    it('convierte a centavos números y textos de numeric', () => {
        expect(toCents('16.67')).toBe(1667);
        expect(toCents(0.1 + 0.2)).toBe(30);
        expect(toCents(null)).toBe(0);
    });
});

describe('periodos de Administración', () => {
    it('valida fechas de calendario reales', () => {
        expect(isValidDay('2026-11-15')).toBe(true);
        expect(isValidDay('2026-02-30')).toBe(false);
        expect(isValidDay('15/11/2026')).toBe(false);
    });

    it('cuenta los días con ambos extremos', () => {
        expect(rangeDays('2026-11-01', '2026-11-30')).toBe(30);
        expect(rangeDays('2026-11-15', '2026-11-15')).toBe(1);
        expect(rangeDays('2024-01-01', '2024-12-31')).toBe(366);
    });

    it('atajos: semana desde domingo, este mes y mes pasado', () => {
        // 15 de noviembre de 2026 es domingo.
        expect(profitPresetRange('week', '2026-11-15')).toEqual({ from: '2026-11-15', to: '2026-11-15' });
        expect(profitPresetRange('week', '2026-11-18')).toEqual({ from: '2026-11-15', to: '2026-11-18' });
        expect(profitPresetRange('month', '2026-11-15')).toEqual({ from: '2026-11-01', to: '2026-11-15' });
        expect(profitPresetRange('last_month', '2026-11-15')).toEqual({ from: '2026-10-01', to: '2026-10-31' });
        expect(profitPresetRange('last_month', '2026-01-10')).toEqual({ from: '2025-12-01', to: '2025-12-31' });
        expect(profitPresetRange('last_month', '2028-03-31')).toEqual({ from: '2028-02-01', to: '2028-02-29' });
    });
});
