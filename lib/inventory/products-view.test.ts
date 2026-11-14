import { describe, expect, it } from 'vitest';
import { stockStatus, summarizeProducts, toProductView, type ProductRow } from './products-view';

const product: ProductRow = {
    id: 'p1',
    name: 'Pomada mate',
    sku: 'POM-001',
    description: 'Fijación media',
    sale_price: '150.00',
    cost_price: '70.00',
    created_at: '2026-11-01T00:00:00Z',
    updated_at: '2026-11-01T00:00:00Z',
};

describe('stockStatus', () => {
    it('clasifica por existencias y mínimo', () => {
        expect(stockStatus(0, 3)).toBe('empty');
        expect(stockStatus(1, 4)).toBe('critical');
        expect(stockStatus(3, 5)).toBe('low');   // el shampoo de ejemplo: 3 de mínimo 5
        expect(stockStatus(8, 3)).toBe('ok');
        expect(stockStatus(5, 0)).toBe('ok');    // sin mínimo definido no hay alerta
    });
});

describe('toProductView', () => {
    it('une el catálogo con las existencias de la sucursal', () => {
        const view = toProductView(product, { product_id: 'p1', quantity_on_hand: '8.000', minimum_quantity: '3.000' });
        expect(view).toMatchObject({ id: 'p1', sku: 'POM-001', category: 'Fijación media', stock: 8, min_stock: 3, cost: 70, price: 150, status: 'ok' });
    });

    it('sin fila de inventario cuenta como agotado y usa categoría por defecto', () => {
        const view = toProductView({ ...product, description: null, sku: null }, undefined);
        expect(view).toMatchObject({ sku: '', category: 'General', stock: 0, status: 'empty' });
    });
});

describe('summarizeProducts', () => {
    it('cuenta bajos, agotados y calcula el valor del inventario', () => {
        const items = [
            toProductView(product, { product_id: 'p1', quantity_on_hand: 8, minimum_quantity: 3 }),
            toProductView({ ...product, id: 'p2', sale_price: 120 }, { product_id: 'p2', quantity_on_hand: 3, minimum_quantity: 5 }),
            toProductView({ ...product, id: 'p3' }, { product_id: 'p3', quantity_on_hand: 0, minimum_quantity: 2 }),
        ];
        expect(summarizeProducts(items)).toEqual({ total: 3, lowStock: 1, outOfStock: 1, totalValue: 1560 });
    });
});
