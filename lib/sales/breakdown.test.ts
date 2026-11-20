import { describe, expect, it } from 'vitest';
import { buildSaleBreakdown, firstName, type BreakdownCommission, type BreakdownInput, type BreakdownItem } from './breakdown';

const NAMES = { sonia: 'Sonia Martínez', dani: 'Dani Pérez', emi: 'Emi López' };

const item = (over: Partial<BreakdownItem> & { id: string }): BreakdownItem => ({
    item_type: 'service', product_id: null, item_name_snapshot: 'Corte adulto', quantity: 1, unit_price: 150, discount_amount: 0,
    line_total: 150, employee_id: 'sonia', commission_employee_id: null, unit_cost_snapshot: null, ...over,
});
const commission = (over: Partial<BreakdownCommission> & { sale_item_id: string }): BreakdownCommission => ({
    employee_id: 'sonia', basis: 'price_before_discount', basis_amount: 150, calculation_type: 'percentage',
    percentage_snapshot: 50, fixed_amount_snapshot: null, commission_amount: 75, status: 'generated', ...over,
});
const sale = (over: Partial<BreakdownInput['sale']> = {}): BreakdownInput['sale'] => ({
    id: 's1', folio: 'V2611-0001', status: 'paid', subtotal_amount: 0, discount_amount: 0, total_amount: 0, ...over,
});

// Servicio de Sonia + dos productos de vendedores distintos (Dani y Emi) + propina para Sonia. Pago dividido.
function mixedSale(): BreakdownInput {
    return {
        sale: sale({ subtotal_amount: 450, total_amount: 450 }),
        items: [
            item({ id: 'i1' }),
            item({ id: 'i2', item_type: 'product', product_id: 'p1', item_name_snapshot: 'Pomada Negra', unit_price: 180, line_total: 180, employee_id: null, commission_employee_id: 'dani', unit_cost_snapshot: 45 }),
            item({ id: 'i3', item_type: 'product', product_id: 'p2', item_name_snapshot: 'Shampoo', quantity: 2, unit_price: 60, line_total: 120, employee_id: null, commission_employee_id: 'emi', unit_cost_snapshot: 20.5 }),
        ],
        commissions: [
            commission({ sale_item_id: 'i1' }),
            commission({ sale_item_id: 'i2', employee_id: 'dani', basis: 'price_after_discount', basis_amount: 180, percentage_snapshot: 20, commission_amount: 36 }),
            commission({ sale_item_id: 'i3', employee_id: 'emi', basis: 'price_after_discount', basis_amount: 120, percentage_snapshot: 20, commission_amount: 24 }),
        ],
        tips: [{ employee_id: 'sonia', amount: 30, method: 'cash', status: 'generated' }],
        payments: [{ method: 'card', amount: 300, status: 'confirmed' }, { method: 'cash', amount: 150, status: 'confirmed' }],
        names: NAMES,
    };
}

describe('firstName', () => {
    it('toma el nombre de pila', () => {
        expect(firstName('Sonia Martínez')).toBe('Sonia');
        expect(firstName('  Dani  ')).toBe('Dani');
        expect(firstName('')).toBeNull();
        expect(firstName(undefined)).toBeNull();
    });
});

describe('buildSaleBreakdown: servicio + dos productos de vendedores distintos + propina', () => {
    const b = buildSaleBreakdown(mixedSale(), 'full');

    it('cada renglón dice su base, %, beneficiario (nombre de pila) y monto', () => {
        expect(b.lines.map((l) => [l.name, l.base, l.percentage, l.beneficiaryName, l.commission])).toEqual([
            ['Corte adulto', 150, 50, 'Sonia', 75],
            ['Pomada Negra', 180, 20, 'Dani', 36],
            ['Shampoo', 120, 20, 'Emi', 24],
        ]);
        expect(b.lines[2].quantity).toBe(2);
        expect(b.lines.every((l) => !l.pending && !l.reversed && !l.discounted)).toBe(true);
    });

    it('la propina es 100 % para quien atendió', () => {
        expect(b.tips).toEqual([{ name: 'Sonia', amount: 30, method: 'cash', percentage: 100, reversed: false }]);
    });

    it('resumen: cobrado, equipo, costo y lo que le queda a la barbería', () => {
        expect(b.summary).toMatchObject({ income: 450, charged: 480, commissionsTotal: 135, tipsTotal: 30, toTeam: 165 });
        // costo = 45 + 2 × 20.50 = 86 ; le queda = 450 − 135 − 86 = 229
        expect(b.shop).toMatchObject({ productCost: 86, keeps: 229, unitsWithoutCost: 0 });
        expect(b.lines.map((l) => l.cost)).toEqual([undefined, 45, 41]);
    });

    it('pago dividido: cobros por método más la propina en su método', () => {
        expect(b.summary.paymentsByMethod).toEqual([{ method: 'card', amount: 300 }, { method: 'cash', amount: 180 }]);
        const total = b.summary.paymentsByMethod.reduce((a, p) => a + p.amount, 0);
        expect(total).toBe(b.summary.charged);
    });

    it('conteos: todo generado, nada en espera', () => {
        expect(b.generatedCount).toBe(4);
        expect(b.pendingCount).toBe(0);
        expect(b.voided).toBe(false);
    });
});

describe('buildSaleBreakdown: alcance de recepción', () => {
    const b = buildSaleBreakdown({ ...mixedSale(), fallbackUnitCosts: { p1: 99 } }, 'front_desk');
    it('no trae costo ni resultado de la barbería: las claves no existen', () => {
        expect(b.shop).toBeUndefined();
        expect('shop' in b).toBe(false);
        for (const line of b.lines) expect('cost' in line).toBe(false);
        expect(JSON.stringify(b)).not.toMatch(/productCost|keeps|cost/);
    });
    it('sí trae comisiones y propina', () => {
        expect(b.summary).toMatchObject({ commissionsTotal: 135, tipsTotal: 30, toTeam: 165, charged: 480 });
        expect(b.lines[1]).toMatchObject({ beneficiaryName: 'Dani', commission: 36 });
    });
});

describe('buildSaleBreakdown: descuento', () => {
    it('servicio: la comisión va sobre el precio de lista y la nota lo dice con el descuento', () => {
        const b = buildSaleBreakdown({
            sale: sale({ status: 'paid', total_amount: 140 }),
            items: [item({ id: 'i1', discount_amount: 10, line_total: 140 })],
            commissions: [commission({ sale_item_id: 'i1' })],
            tips: [], payments: [{ method: 'cash', amount: 140, status: 'confirmed' }], names: NAMES,
        }, 'full');
        const l = b.lines[0];
        expect(l).toMatchObject({ discounted: true, discount: 10, listAmount: 150, base: 150, commission: 75 });
        expect(l.baseNote).toContain('Base sin descuento');
        expect(l.baseNote).toContain('$150.00');
        expect(l.baseNote).toContain('$10.00');
        expect(b.shop?.keeps).toBe(65); // 140 − 75
    });
    it('producto (venta nueva): la comisión va sobre el precio de lista, igual que el servicio', () => {
        const b = buildSaleBreakdown({
            sale: sale({ total_amount: 160 }),
            items: [item({ id: 'i2', item_type: 'product', item_name_snapshot: 'Pomada', unit_price: 180, discount_amount: 20, line_total: 160, employee_id: null, commission_employee_id: 'dani', unit_cost_snapshot: 45 })],
            commissions: [commission({ sale_item_id: 'i2', employee_id: 'dani', basis: 'price_before_discount', basis_amount: 180, percentage_snapshot: 20, commission_amount: 36 })],
            tips: [], payments: [{ method: 'cash', amount: 160, status: 'confirmed' }], names: NAMES,
        }, 'full');
        expect(b.lines[0]).toMatchObject({ base: 180, listAmount: 180, discount: 20, discounted: true, commission: 36 });
        expect(b.lines[0].baseNote).toContain('Base sin descuento');
        expect(b.lines[0].baseNote).toContain('$180.00');
        expect(b.lines[0].baseNote).toContain('$20.00');
        expect(b.shop?.keeps).toBe(79); // 160 − 36 − 45: el descuento lo absorbe la barbería
    });
    it('producto (venta anterior al cambio): muestra la base con descuento que quedó guardada, no la regla nueva', () => {
        const b = buildSaleBreakdown({
            sale: sale({ total_amount: 160 }),
            items: [item({ id: 'i2', item_type: 'product', item_name_snapshot: 'Pomada', unit_price: 180, discount_amount: 20, line_total: 160, employee_id: null, commission_employee_id: 'dani', unit_cost_snapshot: 45 })],
            commissions: [commission({ sale_item_id: 'i2', employee_id: 'dani', basis: 'price_after_discount', basis_amount: 160, percentage_snapshot: 20, commission_amount: 32 })],
            tips: [], payments: [{ method: 'cash', amount: 160, status: 'confirmed' }], names: NAMES,
        }, 'full');
        expect(b.lines[0]).toMatchObject({ base: 160, listAmount: 180, discount: 20, discounted: true });
        expect(b.lines[0].baseNote).toContain('Base con descuento');
        expect(b.lines[0].baseNote).toContain('$180.00');
        expect(b.lines[0].baseNote).toContain('las ventas nuevas usan el precio de lista');
        expect(b.shop?.keeps).toBe(83); // 160 − 32 − 45
    });
});

describe('buildSaleBreakdown: cortesía', () => {
    // Corte de Sonia cobrado ($150, 50 % = $75) + 2 pomadas regaladas (lista 2 × $180, descuento $360, cobrado $0, costo $45 c/u).
    const gift = item({ id: 'i2', item_type: 'product', product_id: 'p1', item_name_snapshot: 'Pomada', quantity: 2, unit_price: 180, discount_amount: 360, line_total: 0, employee_id: null, commission_employee_id: 'dani', unit_cost_snapshot: 45 });
    const giftEntry = commission({ sale_item_id: 'i2', employee_id: 'dani', basis: 'price_after_discount', basis_amount: 0, percentage_snapshot: 0, commission_amount: 0 });
    const input = (over: Partial<BreakdownInput> = {}): BreakdownInput => ({
        sale: sale({ subtotal_amount: 510, discount_amount: 360, total_amount: 150 }),
        items: [item({ id: 'i1' }), gift],
        commissions: [commission({ sale_item_id: 'i1' }), giftEntry],
        tips: [], payments: [{ method: 'cash', amount: 150, status: 'confirmed' }], names: NAMES, ...over,
    });

    it('producto regalado: "cortesía", sin base ni %, comisión $0, nunca en espera; el costo sí cuenta', () => {
        const b = buildSaleBreakdown(input(), 'full');
        expect(b.lines[1]).toMatchObject({ courtesy: true, pending: false, base: null, percentage: null, fixedAmount: null, commission: 0, listAmount: 360, discount: 360, beneficiaryName: 'Dani', cost: 90 });
        expect(b.lines[1].baseNote).toContain('no pagan comisión');
        expect(b.lines[0].courtesy).toBe(false);
        expect(b).toMatchObject({ courtesyCount: 1, pendingCount: 0 });
        expect(b.summary).toMatchObject({ income: 150, commissionsTotal: 75, toTeam: 75 });
        expect(b.shop).toMatchObject({ productCost: 90, keeps: -15 }); // 150 − 75 − 90
    });

    it('sin vendedor (queda la marca de la base): sigue siendo cortesía, no "en espera"', () => {
        const b = buildSaleBreakdown(input({
            items: [item({ id: 'i1' }), { ...gift, commission_employee_id: null }],
            commissions: [commission({ sale_item_id: 'i1' })],
            holds: [{ sale_item_id: 'i2', reason: 'beneficiary_missing', resolved_at: null }],
        }), 'full');
        expect(b.lines[1]).toMatchObject({ courtesy: true, pending: false, pendingReason: null, commission: 0, beneficiaryName: null });
        expect(b.pendingCount).toBe(0);
    });

    it('servicio regalado sí paga sobre lista (no es cortesía de producto)', () => {
        const b = buildSaleBreakdown({
            sale: sale({ total_amount: 180 }),
            items: [item({ id: 'i1', discount_amount: 150, line_total: 0 }), item({ id: 'i2', item_type: 'product', unit_price: 180, line_total: 180, employee_id: null, commission_employee_id: 'dani' })],
            commissions: [commission({ sale_item_id: 'i1' }), commission({ sale_item_id: 'i2', employee_id: 'dani', basis_amount: 180, percentage_snapshot: 20, commission_amount: 36 })],
            tips: [], payments: [{ method: 'cash', amount: 180, status: 'confirmed' }], names: NAMES,
        }, 'full');
        expect(b.lines[0]).toMatchObject({ courtesy: false, base: 150, percentage: 50, commission: 75 });
        expect(b.courtesyCount).toBe(0);
    });

    it('producto que queda en $0.01 no es cortesía', () => {
        const b = buildSaleBreakdown(input({
            items: [item({ id: 'i1' }), { ...gift, quantity: 1, discount_amount: 179.99, line_total: 0.01 }],
            commissions: [commission({ sale_item_id: 'i1' }), commission({ sale_item_id: 'i2', employee_id: 'dani', basis_amount: 180, percentage_snapshot: 20, commission_amount: 36 })],
        }), 'full');
        expect(b.lines[1]).toMatchObject({ courtesy: false, base: 180, commission: 36 });
    });

    it('venta vieja que sí pagó comisión por un producto en $0: se muestra lo pagado', () => {
        const b = buildSaleBreakdown(input({
            commissions: [commission({ sale_item_id: 'i1' }), commission({ sale_item_id: 'i2', employee_id: 'dani', basis_amount: 360, percentage_snapshot: 20, commission_amount: 72 })],
        }), 'full');
        expect(b.lines[1]).toMatchObject({ courtesy: false, base: 360, commission: 72 });
        expect(b.summary.commissionsTotal).toBe(147);
    });

    it('venta anulada con cortesía: el $0 se revierte y sigue diciendo cortesía', () => {
        const base = input();
        const b = buildSaleBreakdown({ ...base, sale: sale({ status: 'refunded', total_amount: 150 }), commissions: base.commissions.map((c) => ({ ...c, status: 'reversed' })) }, 'full');
        expect(b.lines[1]).toMatchObject({ courtesy: true, reversed: true, pending: false, commission: 0 });
        expect(b.summary.commissionsTotal).toBe(75);
    });
});

describe('buildSaleBreakdown: venta anulada', () => {
    const base = mixedSale();
    const voided: BreakdownInput = {
        ...base,
        sale: sale({ status: 'refunded', total_amount: 450 }),
        commissions: base.commissions.map((c) => ({ ...c, status: 'reversed' })),
        tips: base.tips.map((t) => ({ ...t, status: 'reversed' })),
        payments: base.payments.map((p) => ({ ...p, status: 'reversed' })),
    };
    const b = buildSaleBreakdown(voided, 'full');
    it('marca la venta como anulada y los montos como revertidos', () => {
        expect(b.voided).toBe(true);
        expect(b.lines.every((l) => l.reversed && !l.pending)).toBe(true);
        expect(b.tips[0].reversed).toBe(true);
        expect(b.summary).toMatchObject({ commissionsTotal: 135, tipsTotal: 30, toTeam: 165, charged: 480 });
    });
    it('las comisiones vigentes no se mezclan con las revertidas', () => {
        const mixed = buildSaleBreakdown({ ...voided, commissions: [...voided.commissions, commission({ sale_item_id: 'i1', status: 'generated', commission_amount: 999 })] }, 'full');
        expect(mixed.summary.commissionsTotal).toBe(135);
    });
    it('un renglón anulado sin comisión no se presenta "en espera"', () => {
        const noEntry = buildSaleBreakdown({ ...voided, commissions: [] }, 'full');
        expect(noEntry.pendingCount).toBe(0);
        expect(noEntry.lines.every((l) => !l.pending)).toBe(true);
    });
});

describe('buildSaleBreakdown: comisión en espera', () => {
    const input: BreakdownInput = {
        sale: sale({ total_amount: 330 }),
        items: [
            item({ id: 'i1', item_name_snapshot: 'Barba', unit_price: 180, line_total: 180 }),
            item({ id: 'i2', item_type: 'product', product_id: 'p1', item_name_snapshot: 'Pomada mate', employee_id: null, commission_employee_id: 'dani', line_total: 150, unit_price: 150, unit_cost_snapshot: 50 }),
        ],
        commissions: [],
        tips: [],
        payments: [{ method: 'cash', amount: 330, status: 'confirmed' }],
        holds: [{ sale_item_id: 'i1', reason: 'commission_rule_missing', resolved_at: null }],
        names: NAMES,
    };
    it('se dice en espera (no $0), con el motivo si se conoce, y sin nombre de beneficiario', () => {
        const b = buildSaleBreakdown(input, 'full');
        expect(b.lines[0]).toMatchObject({ pending: true, commission: null, base: null, beneficiaryName: null });
        expect(b.lines[0].pendingReason).toContain('regla de comisión');
        expect(b.lines[1]).toMatchObject({ pending: true, commission: null, beneficiaryName: null });
        expect(b.lines[1].pendingReason).toContain('Sin beneficiario');
        expect(b.pendingCount).toBe(2);
        expect(b.generatedCount).toBe(0);
        expect(b.summary.commissionsTotal).toBe(0);
    });
    it('una comisión en espera no se resta del resultado de la barbería', () => {
        const b = buildSaleBreakdown(input, 'full');
        expect(b.shop?.keeps).toBe(280); // 330 − 0 − 50
    });
    it('una retención ya resuelta no da motivo', () => {
        const b = buildSaleBreakdown({ ...input, holds: [{ sale_item_id: 'i1', reason: 'commission_rule_missing', resolved_at: '2026-11-20' }] }, 'full');
        expect(b.lines[0].pendingReason).toContain('Sin beneficiario');
    });
});

describe('buildSaleBreakdown: costos', () => {
    it('usa el costo del catálogo si el renglón no guardó el suyo, y avisa si no hay ninguno', () => {
        const input: BreakdownInput = {
            sale: sale({ total_amount: 250 }),
            items: [
                item({ id: 'i1', item_type: 'product', product_id: 'p1', quantity: 2, unit_price: 50, line_total: 100, employee_id: null, commission_employee_id: 'dani', unit_cost_snapshot: null }),
                item({ id: 'i2', item_type: 'product', product_id: 'p2', quantity: 3, unit_price: 50, line_total: 150, employee_id: null, commission_employee_id: 'dani', unit_cost_snapshot: null }),
            ],
            commissions: [], tips: [], payments: [], names: NAMES,
            fallbackUnitCosts: { p1: 10, p2: null },
        };
        const b = buildSaleBreakdown(input, 'full');
        expect(b.lines[0].cost).toBe(20);
        expect(b.lines[1].cost).toBeNull();
        expect(b.shop).toMatchObject({ productCost: 20, unitsWithoutCost: 3 });
    });
});

describe('buildSaleBreakdown: redondeos a centavos', () => {
    it('suma en centavos enteros, sin errores de coma flotante', () => {
        const input: BreakdownInput = {
            sale: sale({ total_amount: 0.3 }),
            items: [
                item({ id: 'i1', unit_price: 0.1, line_total: 0.1 }),
                item({ id: 'i2', unit_price: 0.2, line_total: 0.2 }),
                item({ id: 'i3', item_type: 'product', product_id: 'p1', quantity: 3, unit_price: 33.33, line_total: 99.99, employee_id: null, commission_employee_id: 'dani', unit_cost_snapshot: '12.35' }),
            ],
            commissions: [
                commission({ sale_item_id: 'i1', basis_amount: 0.1, commission_amount: '0.05' }),
                commission({ sale_item_id: 'i2', basis_amount: 0.2, commission_amount: '0.10' }),
                commission({ sale_item_id: 'i3', employee_id: 'dani', basis_amount: 99.99, percentage_snapshot: 20, commission_amount: '20.00' }),
            ],
            tips: [{ employee_id: 'sonia', amount: '0.10', method: 'card', status: 'generated' }, { employee_id: 'sonia', amount: '0.20', method: 'card', status: 'generated' }],
            payments: [{ method: 'card', amount: '100.29', status: 'confirmed' }],
            names: NAMES,
        };
        const b = buildSaleBreakdown(input, 'full');
        expect(b.summary.income).toBe(100.29);
        expect(b.summary.commissionsTotal).toBe(20.15);
        expect(b.summary.tipsTotal).toBe(0.3);
        expect(b.summary.toTeam).toBe(20.45);
        expect(b.summary.charged).toBe(100.59);
        expect(b.summary.paymentsByMethod).toEqual([{ method: 'card', amount: 100.59 }]);
        expect(b.shop?.productCost).toBe(37.05); // 3 × 12.35
        expect(b.shop?.keeps).toBe(43.09); // 100.29 − 20.15 − 37.05
    });
});

describe('buildSaleBreakdown: comisión de monto fijo', () => {
    it('no inventa un porcentaje', () => {
        const b = buildSaleBreakdown({
            sale: sale({ total_amount: 150 }),
            items: [item({ id: 'i1' })],
            commissions: [commission({ sale_item_id: 'i1', calculation_type: 'fixed_amount', percentage_snapshot: null, fixed_amount_snapshot: 40, commission_amount: 40 })],
            tips: [], payments: [], names: NAMES,
        }, 'full');
        expect(b.lines[0]).toMatchObject({ percentage: null, fixedAmount: 40, commission: 40 });
    });
});
