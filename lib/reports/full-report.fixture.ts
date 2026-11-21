// Reporte de ejemplo para las pruebas (forma de public.business_full_report). No son datos reales.
import type { Audience, FinancialPeriod, FullReport } from './full-report-types';

/**
 * Resultado financiero coherente con el resto del ejemplo: ingresos 3,000 − comisiones 1,300 −
 * costo de producto 180 − gastos 200 = utilidad 1,320 (44 %). Propinas 120, aparte.
 */
export function sampleFinancial(): NonNullable<FullReport['financial']> {
    const current: FinancialPeriod = {
        revenue: { services: 2400, products: 600, total: 3000, discounts: 50 },
        commissions: { services: 1180, products: 120, total: 1300 },
        product_cost: { total: 180, source: 'catalog', units_without_cost: 0, missing: [] },
        expenses: {
            total: 200,
            by_category: [{ category: 'General', total: 150, count: 2 }, { category: 'Limpieza', total: 50, count: 1 }],
            by_method: { cash: 200, card: 0, transfer: 0, other: 0 },
        },
        tips: { total: 120, count: 3, by_method: { cash: 80, card: 40, transfer: 0, other: 0 } },
        profit: 1320,
        margin_pct: 44,
        counts: { sales: 10, voided_excluded: 1, service_units: 12, product_units: 2 },
        by_person: [
            { id: 'e1', name: 'Deya', is_barber: true, services: 1600, products: 400, revenue: 2000, service_count: 8, product_count: 1, commission: 900, tips: 80, tip_count: 2, product_cost: 120, sales_commissions: 900, contribution: 980 },
            { id: 'e2', name: 'Sonia', is_barber: true, services: 800, products: 200, revenue: 1000, service_count: 4, product_count: 1, commission: 400, tips: 40, tip_count: 1, product_cost: 60, sales_commissions: 400, contribution: 540 },
        ],
    };
    const previous: FinancialPeriod = {
        revenue: { services: 1700, products: 300, total: 2000, discounts: 0 },
        commissions: { services: 850, products: 50, total: 900 },
        product_cost: { total: 90, source: 'catalog', units_without_cost: 0, missing: [] },
        expenses: { total: 100, by_category: [{ category: 'General', total: 100, count: 1 }], by_method: { cash: 100, card: 0, transfer: 0, other: 0 } },
        tips: { total: 60, count: 2, by_method: { cash: 60, card: 0, transfer: 0, other: 0 } },
        profit: 910,
        margin_pct: 45.5,
        counts: { sales: 7, voided_excluded: 0, service_units: 9, product_units: 1 },
        by_person: null,
    };
    return { current, previous };
}

export function sampleReport(audience: Audience = 'interno'): FullReport {
    const internal = audience === 'interno';
    const kpis = { revenue: 3000, cuts: 12, products: 2, tickets: 10, tips: 120, commissions: 1300, expenses: 200, avg_ticket: 300, net: 1500, discounts_total: 50, discounts_count: 1, reversals_total: 150, reversals_count: 1 };
    return {
        version: 1,
        audience,
        cover: {
            business: { id: 'b1', name: 'Gallo 420' },
            branch: { id: 'br1', name: 'Sucursal Principal', address: 'Calle Prueba 420' },
            timezone: 'America/Mexico_City',
            period: { from: '2026-11-09', to: '2026-11-15', days: 7, previous_from: '2026-11-02', previous_to: '2026-11-08' },
            generated_at: '2026-11-16T03:30:00+00:00',
            generated_by: { id: 'u1', name: 'Dueño Gallo 420', role: 'owner' },
            folio: 'REP-000007',
        },
        summary: { kpis, previous: { ...kpis, revenue: 2000, net: 1200, avg_ticket: 0, discounts_total: 0, discounts_count: 0, reversals_total: 0, reversals_count: 0 } },
        sales: {
            daily: Array.from({ length: 7 }, (_, i) => ({ day: `2026-11-${String(9 + i).padStart(2, '0')}`, revenue: i * 100, cuts: i, tickets: i })),
            payments: { cash: 2000, card: 800, transfer: 200, other: 0 },
            by_person: [
                { id: 'e1', name: 'Deya', is_barber: true, cuts: 8, products: 1, revenue: 2000, tickets: 7, tips: 80, commission: 900 },
                { id: 'e2', name: 'Sonia', is_barber: true, cuts: 4, products: 1, revenue: 1000, tickets: 3, tips: 40, commission: 400 },
            ],
            by_item: [{ name: 'Corte de cabello', type: 'service', count: 12, revenue: 2400 }, { name: '=HYPERLINK("http://x")', type: 'product', count: 2, revenue: 600 }],
            discounts: [{ at: '2026-11-10T20:00:00+00:00', sale: '428B9EE5', subtotal: 200, discount: 50, total: 150, reason: 'Cliente frecuente', status: 'paid', authorized_by: 'Sonia', sold_by: 'Dago' }],
            reversals: [{ at: '2026-11-11T19:00:00+00:00', sale: '790BA00F', sold_at: '2026-11-11T18:00:00+00:00', amount: 150, reason: 'Cobro duplicado', reversed_by: 'Dueño Gallo 420', sold_by: 'Dago' }],
        },
        cash: {
            reserve_label: 'Renta y gastos',
            sessions: [{
                id: 's1', status: 'closed', opened_at: '2026-11-10T15:00:00+00:00', opened_by: 'Dago', opening_cash: 500, opening_expected: 500,
                closed_at: '2026-11-11T02:00:00+00:00', closed_by: 'Dago', sales: 1000, sales_cash: 700, sales_card: 300, sales_transfer: 0, refunds: 0, tips: 20,
                expenses: 30, withdrawals: 100, commission_payouts: 0, deposits: 50, expected_cash: 1120, counted_cash: 1100, difference: -20,
                counted_breakdown: { '500': 2, '50': 2 }, float_left: 500, reserve_amount: 400, reserve_label: 'Renta y gastos', withdrawn_amount: 200,
                movements: [{ at: '2026-11-10T17:00:00+00:00', type: 'expense', direction: 'out', method: 'cash', amount: 30, description: 'Agua', by: 'Dago' }],
            }],
        },
        expenses: [{ at: '2026-11-10T17:00:00+00:00', incurred_at: '2026-11-10T17:00:00+00:00', category: 'General', concept: 'Agua', amount: 30, method: 'cash', status: 'posted', by: 'Dago' }],
        payouts: {
            settlements: [{ receipt: 'LIQ-000001', employee: 'Deya', period_start: '2026-11-01', period_end: '2026-11-07', total: 275, cash: 200, transfer: 75, other: 0, paid_at: '2026-11-14T13:15:00+00:00', paid_by: 'Dueño Gallo 420', reference: null }],
            adjustments: [],
        },
        inventory: {
            stock: [{ product: 'Aceite para barba', sku: 'ACE-001', quantity: 7, minimum: 2, unit_cost: 85, value: 595, low: false }, { product: 'Pomada', sku: null, quantity: 1, minimum: 3, unit_cost: 60, value: 60, low: true }],
            movements: [{ at: '2026-11-10T20:00:00+00:00', product: 'Pomada', type: 'sale', quantity: -1, unit_cost: null, reference: 'x', note: 'Venta', by: 'Dago' }],
        },
        agenda: {
            by_status: [{ status: 'cancelled', count: 1 }, { status: 'completed', count: 3 }],
            cancelled: [{ at: '2026-11-12T20:00:00+00:00', barber: 'Sonia', reason: 'Avisó que no puede venir', ...(internal ? { client: 'Juan Pérez', phone: '5551234567' } : {}) }],
            no_show: [{ at: '2026-11-13T20:00:00+00:00', barber: 'Deya', ...(internal ? { client: 'María López', phone: '5557654321' } : {}) }],
        },
        audit: [
            { at: '2026-11-11T19:00:00+00:00', action: 'sale_reversed', entity: 'sale', entity_id: 's', actor: 'Dueño Gallo 420', role: 'owner', reason: 'Cobro duplicado', details: { before: { status: 'paid' }, after: { status: 'refunded', refunded_amount: 150 } } },
            { at: '2026-11-12T19:00:00+00:00', action: 'services.update', entity: 'services', entity_id: 'x', actor: 'Sonia', role: 'admin', reason: null, details: { changes: { price: { from: 200, to: 220 } } } },
        ],
        annex: [
            { at: '2026-11-10T20:06:09+00:00', sale: '5DD4C7BF', type: 'service', item: 'Corte de cabello', quantity: 1, unit_price: 200, discount: 0, amount: 200, employee: 'Deya', methods: 'cash', ...(internal ? { client: 'Juan Pérez' } : {}) },
            { at: '2026-11-10T21:00:00+00:00', sale: '5DD4C7C0', type: 'product', item: 'Pomada', quantity: 1, unit_price: 100, discount: 0, amount: 100, employee: 'Sonia', methods: 'card,cash', ...(internal ? { client: null } : {}) },
        ],
        financial: sampleFinancial(),
    };
}

/**
 * El mismo ejemplo con lo que la base entrega desde los sueldos por día y el libro del personal:
 * sueldos 400 (5 días) y bonos 100, así que la utilidad baja a 3,000 − 1,300 − 400 − 100 − 180 − 200 = 820 (27.3 %).
 * Dago (recepción) no vendió y solo cobra sueldo; Deya ganó el bono. Tres recibos con desglose (uno con neto negativo),
 * dos asientos del libro y tres cierres de caja: uno con el retiro a nombre de Sonia en la bitácora, otro sin nombre y otro sin retiro.
 */
export function sampleReportWithWages(audience: Audience = 'interno'): FullReport {
    const report = sampleReport(audience);
    const fin = report.financial!;
    const [deya, sonia] = fin.current.by_person!;
    fin.current = {
        ...fin.current,
        wages: { total: 400, days: 5 },
        bonuses: { total: 100, count: 1 },
        profit: 820,
        margin_pct: 27.3,
        by_person: [
            { ...deya, wage: 0, bonus: 100, contribution: 880 },
            { ...sonia, wage: 0, bonus: 0 },
            { id: 'e3', name: 'Dago', is_barber: false, services: 0, products: 0, revenue: 0, service_count: 0, product_count: 0, commission: 0, tips: 0, tip_count: 0, product_cost: 0, sales_commissions: 0, wage: 400, bonus: 0, contribution: -400 },
        ],
    };
    fin.previous = { ...fin.previous, wages: { total: 0, days: 0 }, bonuses: { total: 0, count: 0 } };
    report.summary.kpis = { ...report.summary.kpis, net: 820, wages: 400, bonuses: 100 };
    report.payouts = {
        ...report.payouts,
        settlements: [
            // 300 − 20 (ajuste) + 25 (propinas) − 30 (adelanto) = 275
            { ...report.payouts.settlements[0], commissions: 300, adjustments: 20, tips: 25, bonuses: 0, advances: 30, loan_payments: 0, staff_deductions: 0, carryover_in: 0, carryover_out: 0, wages: 0 },
            // 400 (sueldo) − 100 (abono) − 50 (descuento) = 250
            { receipt: 'LIQ-000002', employee: 'Dago', period_start: '2026-11-01', period_end: '2026-11-07', total: 250, cash: 250, transfer: 0, other: 0, paid_at: '2026-11-14T13:20:00+00:00', paid_by: 'Dueño Gallo 420', reference: null,
                commissions: 0, adjustments: 0, tips: 0, bonuses: 0, advances: 0, loan_payments: 100, staff_deductions: 50, carryover_in: 0, carryover_out: 0, wages: 400 },
            // 100 − 150 (adelanto) = −50: se paga $0 y los $50 pasan a la semana siguiente
            { receipt: 'LIQ-000003', employee: 'Sonia', period_start: '2026-11-01', period_end: '2026-11-07', total: 0, cash: 0, transfer: 0, other: 0, paid_at: '2026-11-14T13:25:00+00:00', paid_by: 'Dueño Gallo 420', reference: null,
                commissions: 100, adjustments: 0, tips: 0, bonuses: 0, advances: 150, loan_payments: 0, staff_deductions: 0, carryover_in: 0, carryover_out: 50, wages: 0 },
        ],
        staff_ledger: [
            { at: '2026-11-10T18:00:00+00:00', effective_at: '2026-11-10T18:00:00+00:00', employee: 'Deya', type: 'advance', amount: 30, receipt_effect: -30, reason: 'Adelanto para pasaje', paid_from: 'cash_drawer', method: 'cash', receipt: 'LIQ-000001', cancelled: false, by: 'Dueño Gallo 420' },
            { at: '2026-11-12T18:00:00+00:00', effective_at: '2026-11-12T18:00:00+00:00', employee: 'Dago', type: 'deduction', amount: 50, receipt_effect: -50, reason: 'Se llevó un peine', paid_from: null, method: null, receipt: null, cancelled: false, by: 'Sonia' },
        ],
        staff_totals: { advances: 30, loans: 0, loan_payments: 100, deductions: 50, bonuses: 100, carryovers: 0, reversals: 0, wages: 400 },
    };
    const [s1] = report.cash.sessions;
    report.cash.sessions = [
        s1,
        { ...s1, id: 's2', opened_at: '2026-11-11T15:00:00+00:00', closed_at: '2026-11-12T02:00:00+00:00', difference: 0, counted_cash: 1120, withdrawn_amount: 300, reserve_amount: 320, counted_breakdown: null, movements: [] },
        { ...s1, id: 's3', opened_at: '2026-11-12T15:00:00+00:00', closed_at: '2026-11-13T02:00:00+00:00', difference: 0, counted_cash: 1120, withdrawn_amount: 0, reserve_amount: 620, counted_breakdown: null, movements: [] },
    ];
    report.audit.push(
        { at: '2026-11-11T02:00:00+00:00', action: 'cash_closed', entity: 'cash_session', entity_id: 's1', actor: 'Dago', role: 'receptionist', reason: null,
            details: { after: { expected_cash: 1120, counted_cash: 1100, difference: -20, float_left: 500, reserve_amount: 400, withdrawn_amount: 200, withdrawal_delivered_to: 'Sonia' } } },
        // Cierre con retiro y sin destinatario anotado.
        { at: '2026-11-12T02:00:00+00:00', action: 'cash_closed', entity: 'cash_session', entity_id: 's2', actor: 'Dago', role: 'receptionist', reason: null,
            details: { after: { expected_cash: 1120, counted_cash: 1120, difference: 0, float_left: 500, reserve_amount: 320, withdrawn_amount: 300 } } },
    );
    return report;
}
