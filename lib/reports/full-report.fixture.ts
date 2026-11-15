// Reporte de ejemplo para las pruebas (forma de public.business_full_report). No son datos reales.
import type { Audience, FullReport } from './full-report-types';

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
    };
}
