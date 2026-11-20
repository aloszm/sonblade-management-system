import { describe, expect, it } from 'vitest';
import {
    businessDayKey, comparePeriods, compareValues, computeProfit, eachDay, isValidDay, previousPeriod, profitPresetRange, rangeDays, toCents,
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
        expect(r.tips).toMatchObject({ total: 40, count: 1 });
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

describe('desglose del tablero financiero', () => {
    const employees = [{ id: 'e1', display_name: 'Luis' }, { id: 'e2', display_name: 'Marco' }, { id: 'e3', display_name: 'Ana' }];
    const svc = (id: string, saleId: string, total: number, employee: string): SaleItemRow => ({ ...service(id, saleId, total), employee_id: employee });

    it('propinas por barbero y por método; la propina anulada o de venta anulada no cuenta', () => {
        const r = computeProfit({
            ...empty, employees, sales: [sale('s1'), sale('s2', 'refunded')],
            items: [svc('i1', 's1', 200, 'e1')],
            tips: [
                { sale_id: 's1', amount: 30, status: 'generated', employee_id: 'e1', method: 'cash' },
                { sale_id: 's1', amount: '20.50', status: 'generated', employee_id: 'e1', method: 'card' },
                { sale_id: 's1', amount: 10, status: 'reversed', employee_id: 'e1', method: 'cash' },
                { sale_id: 's2', amount: 99, status: 'generated', employee_id: 'e2', method: 'cash' },
            ],
        });
        expect(r.tips.total).toBe(50.5);
        expect(r.tips.byBarber).toEqual([{ employeeId: 'e1', name: 'Luis', total: 50.5, count: 2 }]);
        expect(r.tips.byMethod).toEqual([
            { method: 'cash', total: 30, count: 1 }, { method: 'card', total: 20.5, count: 1 }, { method: 'transfer', total: 0, count: 0 },
        ]);
    });

    it('barbero con propina pero sin venta propia aparece con ventas en cero', () => {
        const r = computeProfit({
            ...empty, employees, sales: [sale('s1')], items: [svc('i1', 's1', 200, 'e1')],
            commissions: [{ ...comm('s1', 'i1', 100), employee_id: 'e1' }],
            tips: [{ sale_id: 's1', amount: 25, status: 'generated', employee_id: 'e3', method: 'transfer' }],
        });
        const ana = r.barbers.find((b) => b.employeeId === 'e3');
        expect(ana).toMatchObject({ name: 'Ana', sales: 0, commission: 0, keeps: 0, tips: 25, tipCount: 1 });
        const luis = r.barbers.find((b) => b.employeeId === 'e1');
        expect(luis).toMatchObject({ sales: 200, services: 200, commission: 100, keeps: 100, tips: 0, serviceUnits: 1 });
        expect(r.profit).toBe(100); // la propina de Ana no mueve la utilidad
    });

    it('por barbero: ventas de servicios y productos, comisión y lo que deja al negocio', () => {
        const r = computeProfit({
            ...empty, employees, sales: [sale('s1'), sale('s2')],
            items: [svc('i1', 's1', 300, 'e1'), svc('i2', 's2', 100, 'e2'), { ...product('i3', 's2', 'p1', 2, 200), commission_employee_id: 'e2' }, product('i4', 's2', 'p1', 1, 100)],
            commissions: [
                { ...comm('s1', 'i1', 150), employee_id: 'e1' }, { ...comm('s2', 'i2', 50), employee_id: 'e2' }, { ...comm('s2', 'i3', 20), employee_id: 'e2' },
            ],
            products: [{ id: 'p1', name: 'Cera', cost_price: 40 }],
        });
        const marco = r.barbers.find((b) => b.employeeId === 'e2');
        expect(marco).toMatchObject({ services: 100, products: 200, sales: 300, commission: 70, productCost: 80, keeps: 150 });
        const sinAsignar = r.barbers.find((b) => b.employeeId === null);
        expect(sinAsignar).toMatchObject({ name: 'Sin asignar', products: 100, productCost: 40, keeps: 60 });
        // lo que dejan todos = ingresos − comisiones − costo (antes de gastos)
        const keeps = r.barbers.reduce((n, b) => n + b.keeps, 0);
        expect(keeps).toBe(r.revenue.total - r.commissions.total - r.productCost.total);
        expect(r.barbers.map((b) => b.name)).toEqual(['Luis', 'Marco', 'Sin asignar']);
    });

    it('cobros por método de pago, solo confirmados y de ventas cobradas', () => {
        const r = computeProfit({
            ...empty, sales: [sale('s1'), sale('s2', 'refunded')],
            payments: [
                { sale_id: 's1', method: 'cash', amount: 150, status: 'confirmed' },
                { sale_id: 's1', method: 'card', amount: 50, status: 'confirmed' },
                { sale_id: 's1', method: 'card', amount: 80, status: 'reversed' },
                { sale_id: 's2', method: 'transfer', amount: 500, status: 'confirmed' },
            ],
        });
        expect(r.payments.total).toBe(200);
        expect(r.payments.byMethod).toEqual([
            { method: 'cash', total: 150, count: 1, sharePct: 75 },
            { method: 'card', total: 50, count: 1, sharePct: 25 },
            { method: 'transfer', total: 0, count: 0, sharePct: 0 },
        ]);
        expect(computeProfit(empty).payments.byMethod.every((m) => m.sharePct === null)).toBe(true);
    });

    it('serie por día en la hora de la barbería: 11 pm en México no cae al día siguiente', () => {
        const tz = 'America/Mexico_City'; // UTC-6 en noviembre
        expect(businessDayKey('2026-11-11T05:30:00Z', tz)).toBe('2026-11-10');
        const r = computeProfit({
            ...empty, period: { from: '2026-11-10', to: '2026-11-12', timezone: tz },
            sales: [
                { id: 's1', status: 'paid', paid_at: '2026-11-11T05:30:00Z' }, // 10 nov, 11:30 pm
                { id: 's2', status: 'paid', paid_at: '2026-11-11T18:00:00Z' }, // 11 nov, 12:00 pm
            ],
            items: [service('i1', 's1', 200), product('i2', 's2', 'p1', 1, 100)],
            commissions: [comm('s1', 'i1', 100)],
            products: [{ id: 'p1', name: 'Cera', cost_price: 30 }],
            expenses: [{ amount: 50, category: 'General', status: 'posted', incurred_at: '2026-11-12T03:00:00Z' }], // 11 nov, 9 pm
        });
        expect(r.daily.map((d) => d.date)).toEqual(['2026-11-10', '2026-11-11', '2026-11-12']);
        expect(r.daily[0]).toMatchObject({ revenue: 200, commissions: 100, outflow: 100, net: 100 });
        expect(r.daily[1]).toMatchObject({ revenue: 100, productCost: 30, expenses: 50, outflow: 80, net: 20 });
        expect(r.daily[2]).toMatchObject({ revenue: 0, outflow: 0, net: 0 });
        const sum = (k: 'revenue' | 'outflow') => r.daily.reduce((n, d) => n + d[k], 0);
        expect(sum('revenue')).toBe(r.revenue.total);
        expect(sum('outflow')).toBe(r.commissions.total + r.productCost.total + r.expenses.total);
    });

    it('sin periodo no arma serie por día', () => {
        expect(computeProfit(empty).daily).toEqual([]);
        expect(eachDay('2026-02-27', '2026-03-02')).toEqual(['2026-02-27', '2026-02-28', '2026-03-01', '2026-03-02']);
    });
});

describe('comparación con el periodo anterior', () => {
    it('el periodo anterior tiene la misma duración y termina el día previo', () => {
        expect(previousPeriod('2026-11-01', '2026-11-15')).toEqual({ from: '2026-10-17', to: '2026-10-31' });
        expect(previousPeriod('2026-11-15', '2026-11-15')).toEqual({ from: '2026-11-14', to: '2026-11-14' });
        expect(previousPeriod('2026-03-01', '2026-03-31')).toEqual({ from: '2026-01-29', to: '2026-02-28' });
    });

    it('diferencia en pesos y en %', () => {
        expect(compareValues(150, 100)).toEqual({ current: 150, previous: 100, delta: 50, pct: 50 });
        expect(compareValues(80, 100)).toMatchObject({ delta: -20, pct: -20 });
        expect(compareValues(100.1, 100)).toMatchObject({ delta: 0.1, pct: 0.1 });
    });

    it('sin base (anterior en cero): pct es null y no se divide entre cero', () => {
        expect(compareValues(120, 0)).toEqual({ current: 120, previous: 0, delta: 120, pct: null });
        expect(compareValues(0, 0)).toEqual({ current: 0, previous: 0, delta: 0, pct: null });
    });

    it('utilidad que pasa de pérdida a ganancia usa el valor absoluto de la base', () => {
        expect(compareValues(50, -100)).toMatchObject({ delta: 150, pct: 150 });
    });

    it('periodo anterior vacío: hasBase falso y todos los pct null', () => {
        const current = computeProfit({ ...empty, sales: [sale('s1')], items: [service('i1', 's1', 200)], commissions: [comm('s1', 'i1', 100)] });
        const c = comparePeriods(current, computeProfit(empty), { from: '2026-10-01', to: '2026-10-31' });
        expect(c.hasBase).toBe(false);
        expect(c.profit).toMatchObject({ current: 100, previous: 0, delta: 100, pct: null });
        expect(c.revenue.pct).toBeNull();
        expect(c.tips.pct).toBeNull();
    });

    it('con base: hasBase verdadero y % de cada concepto', () => {
        const mk = (rev: number, comm_: number, exp: number) => computeProfit({
            ...empty, sales: [sale('s1')], items: [service('i1', 's1', rev)], commissions: [comm('s1', 'i1', comm_)],
            expenses: [{ amount: exp, category: 'General', status: 'posted' }],
        });
        const c = comparePeriods(mk(300, 100, 50), mk(200, 80, 20), { from: '2026-10-01', to: '2026-10-31' });
        expect(c.hasBase).toBe(true);
        expect(c.revenue).toMatchObject({ delta: 100, pct: 50 });
        expect(c.profit).toMatchObject({ current: 150, previous: 100, delta: 50, pct: 50 });
        expect(c.expenses).toMatchObject({ delta: 30, pct: 150 });
    });
});

describe('costo guardado en la venta', () => {
    it('usa unit_cost_snapshot aunque el costo actual del producto haya cambiado', () => {
        const r = computeProfit({
            sales: [{ id: 's1', status: 'paid', paid_at: '2026-11-10T18:00:00Z' }],
            items: [{ id: 'i1', sale_id: 's1', item_type: 'product', product_id: 'p1', item_name_snapshot: 'Polvo de textura', quantity: 2, discount_amount: 0, line_total: 450, unit_cost_snapshot: 115 }],
            commissions: [], tips: [], expenses: [],
            products: [{ id: 'p1', name: 'Polvo de textura', cost_price: 999 }],
        });
        expect(r.productCost.total).toBe(230);
        expect(r.profit).toBe(220);
    });

    it('recurre al costo actual si el renglón no trae costo guardado', () => {
        const r = computeProfit({
            sales: [{ id: 's1', status: 'paid', paid_at: '2026-11-10T18:00:00Z' }],
            items: [{ id: 'i1', sale_id: 's1', item_type: 'product', product_id: 'p1', item_name_snapshot: 'Peine de textura', quantity: 1, discount_amount: 0, line_total: 80, unit_cost_snapshot: null }],
            commissions: [], tips: [], expenses: [],
            products: [{ id: 'p1', name: 'Peine de textura', cost_price: 27 }],
        });
        expect(r.productCost.total).toBe(27);
        expect(r.productsWithoutCost).toBe(0);
    });
});

describe('sueldos por día y bonos (costos de personal, misma fuente que la base)', () => {
    const tz = 'America/Mexico_City';
    const base: ProfitInput = {
        ...empty, period: { from: '2026-11-15', to: '2026-11-21', timezone: tz },
        sales: [{ id: 's1', status: 'paid', paid_at: '2026-11-16T18:00:00Z' }],
        items: [{ ...service('i1', 's1', 1000), employee_id: 'e-dani' }],
        commissions: [{ ...comm('s1', 'i1', 500), employee_id: 'e-dani' }],
        employees: [{ id: 'e-dani', display_name: 'Dani' }, { id: 'e-dago', display_name: 'Dago' }, { id: 'e-emi', display_name: 'Emi' }],
    };
    // Dago lunes a viernes y Emi el domingo, $320 por día devengado; un bono de $100 a Dani el sábado.
    const staffCosts = [
        ...['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'].map((d) => ({ employee_id: 'e-dago', kind: 'wage', cost_date: d, amount: '320.00' })),
        { employee_id: 'e-emi', kind: 'wage', cost_date: '2026-11-15', amount: 320 },
        { employee_id: 'e-dani', kind: 'bonus', cost_date: '2026-11-21', amount: 100 },
    ];

    it('sin costos de personal la utilidad queda exactamente igual que antes', () => {
        const before = computeProfit(base);
        const same = computeProfit({ ...base, staffCosts: [] });
        expect(same.profit).toBe(500);
        expect(same.profit).toBe(before.profit);
        expect(same.wages).toEqual({ total: 0, days: 0, byEmployee: [] });
        expect(same.bonuses).toEqual({ total: 0, count: 0 });
    });

    it('la utilidad baja exactamente en sueldos y bonos, en un concepto aparte de comisiones', () => {
        const r = computeProfit({ ...base, staffCosts });
        expect(r.commissions.total).toBe(500);
        expect(r.wages.total).toBe(1920);
        expect(r.wages.days).toBe(6);
        expect(r.bonuses).toEqual({ total: 100, count: 1 });
        expect(r.profit).toBe(1000 - 500 - 1920 - 100);
        expect(r.marginPct).toBe(-152);
        expect(r.wages.byEmployee).toEqual([
            { employeeId: 'e-dago', name: 'Dago', total: 1600, days: 5 },
            { employeeId: 'e-emi', name: 'Emi', total: 320, days: 1 },
        ]);
        const dago = r.barbers.find((b) => b.employeeId === 'e-dago')!;
        expect(dago).toMatchObject({ sales: 0, wage: 1600, bonus: 0, keeps: -1600 });
        const dani = r.barbers.find((b) => b.employeeId === 'e-dani')!;
        expect(dani).toMatchObject({ sales: 1000, commission: 500, bonus: 100, keeps: 400 });
    });

    it('la serie por día lleva el sueldo en su día y cuadra con el total', () => {
        const r = computeProfit({ ...base, staffCosts });
        expect(r.daily.find((d) => d.date === '2026-11-15')).toMatchObject({ wages: 320, outflow: 320, net: -320 });
        expect(r.daily.find((d) => d.date === '2026-11-16')).toMatchObject({ revenue: 1000, commissions: 500, wages: 320, outflow: 820, net: 180 });
        expect(r.daily.find((d) => d.date === '2026-11-21')).toMatchObject({ bonuses: 100, outflow: 100 });
        const net = r.daily.reduce((n, d) => n + d.net, 0);
        expect(net).toBe(r.profit);
    });

    it('la comparación incluye sueldos y cuenta como base aunque no haya ventas', () => {
        const current = computeProfit({ ...base, staffCosts });
        const previous = computeProfit({ ...empty, staffCosts: [{ employee_id: 'e-dago', kind: 'wage', cost_date: '2026-11-09', amount: 320 }] });
        const c = comparePeriods(current, previous, { from: '2026-11-08', to: '2026-11-14' });
        expect(c.hasBase).toBe(true);
        expect(c.wages).toMatchObject({ current: 1920, previous: 320, delta: 1600 });
    });
});
