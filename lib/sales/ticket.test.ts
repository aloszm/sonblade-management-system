import { describe, expect, it } from 'vitest';
import { ticketFolio, toTicket, type TicketSaleRow } from './ticket';

const row: TicketSaleRow = {
    id: 'ab12cd34-0000-4000-8000-000000000000',
    created_at: '2026-11-15T02:30:00Z', // sábado 14, 8:30 pm en CDMX
    status: 'paid',
    subtotal_amount: '360.00', discount_amount: '50.00', total_amount: '310.00',
    client_id: 'c1', created_by: 'u1',
    sale_items: [
        { item_type: 'service', item_name_snapshot: 'Corte de cabello', quantity: 1, unit_price: '200.00', discount_amount: '50.00', line_total: '150.00', employee_id: 'e1' },
        { item_type: 'product', item_name_snapshot: 'Pomada mate', quantity: 1, unit_price: '160.00', discount_amount: '0.00', line_total: '160.00', employee_id: null },
    ],
    payments: [
        { method: 'cash', amount: '150.00', status: 'confirmed' },
        { method: 'card', amount: '160.00', status: 'confirmed' },
    ],
    sale_tips: [{ amount: '40.00', method: 'card', status: 'generated' }],
};
const names = { employees: new Map([['e1', 'Deya']]), client: 'Juan Pérez', cashier: 'Dago' };

describe('ticket de venta', () => {
    it('el folio usa la fecha de la barbería, no la de UTC', () => {
        expect(ticketFolio(row.id, row.created_at, 'America/Mexico_City')).toBe('V-20261114-AB12CD');
    });

    it('separa venta, descuento y propina, y suma lo pagado por método', () => {
        const t = toTicket(row, names, 'America/Mexico_City');
        expect(t.subtotal).toBe(360);
        expect(t.discount).toBe(50);
        expect(t.total).toBe(310);
        expect(t.tip).toBe(40);
        expect(t.grand_total).toBe(350);
        expect(t.payments).toEqual([{ method: 'cash', amount: 150 }, { method: 'card', amount: 200 }]);
        expect(t.attended_by).toEqual(['Deya']);
        expect(t.lines[0]).toEqual({ name: 'Corte de cabello', quantity: 1, unit_price: 200, discount: 50, total: 150 });
        expect(t.cancelled).toBe(false);
    });

    it('una venta anulada se marca y no cuenta pagos ni propinas revertidos', () => {
        const t = toTicket({
            ...row, status: 'refunded',
            payments: row.payments.map((p) => ({ ...p, status: 'reversed' })),
            sale_tips: [{ amount: '40.00', method: 'card', status: 'reversed' }],
        }, names, 'America/Mexico_City');
        expect(t.cancelled).toBe(true);
        expect(t.tip).toBe(0);
        expect(t.payments).toEqual([]);
    });
});
