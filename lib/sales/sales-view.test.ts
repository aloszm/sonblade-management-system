import { describe, expect, it } from 'vitest';
import { toSaleView, type SaleRow } from './sales-view';

const row: SaleRow = {
    id: 's1',
    created_at: '2026-11-04T22:09:00Z',
    status: 'paid',
    total_amount: '350.00',
    notes: null,
    client_id: 'c1',
    sale_items: [
        { id: 'i1', item_type: 'service', item_name_snapshot: 'Corte de cabello', unit_price: '200.00', quantity: '1.000', service_id: 'sv1', product_id: null, employee_id: 'e1', commission_employee_id: null },
        { id: 'i2', item_type: 'product', item_name_snapshot: 'Pomada mate', unit_price: '150.00', quantity: '1.000', service_id: null, product_id: 'p1', employee_id: null, commission_employee_id: 'e1' },
    ],
    payments: [{ method: 'cash', amount: '150.00', status: 'confirmed' }, { method: 'card', amount: '200.00', status: 'confirmed' }],
};
const employees = new Map([['e1', 'Deya']]);
const clients = new Map([['c1', 'Cliente Prueba']]);

describe('toSaleView', () => {
    it('muestra barbero, cliente, conceptos y total', () => {
        const sale = toSaleView(row, employees, clients);
        expect(sale.total).toBe(350);
        expect(sale.barber?.name).toBe('Deya');
        expect(sale.client?.name).toBe('Cliente Prueba');
        expect(sale.items?.map((i) => `${i.item_type}:${i.item_name}`)).toEqual(['service:Corte de cabello', 'product:Pomada mate']);
        expect(sale.tip).toBe(0);
    });

    it('reparte el pago por método y marca el pago mixto', () => {
        const sale = toSaleView(row, employees, clients);
        expect([sale.cash_amount, sale.card_amount, sale.transfer_amount]).toEqual([150, 200, 0]);
        expect(sale.payment_method).toBe('mixed');
    });

    it('un solo método se muestra tal cual y una venta anulada conserva su estado', () => {
        const sale = toSaleView({ ...row, status: 'refunded', payments: [{ method: 'transfer', amount: 350, status: 'reversed' }] }, employees, clients);
        expect(sale.payment_method).toBe('transfer');
        expect(sale.status).toBe('refunded');
    });

    it('si falta el nombre usa un texto neutro', () => {
        const sale = toSaleView(row, new Map(), new Map());
        expect(sale.barber?.name).toBe('Barbero');
        expect(sale.client?.name).toBe('Cliente');
    });
});
