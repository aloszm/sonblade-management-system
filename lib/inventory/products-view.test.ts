import { describe, expect, it } from 'vitest';
import { PRODUCT_COST_REQUIRED, productCostProblem, productsWithoutCost, stockStatus, summarizeProducts, toProductView, type ProductRow } from './products-view';

describe('costo obligatorio del producto', () => {
    it('productCostProblem: vacío, cero, negativo o no numérico no se aceptan', () => {
        for (const v of [undefined, null, '', ' ', 0, -1, 'abc', Number.NaN]) expect(productCostProblem(v)).toBe(PRODUCT_COST_REQUIRED);
        expect(productCostProblem(1_000_001)).toMatch(/no puede pasar/);
        expect(productCostProblem(0.01)).toBeNull();
        expect(productCostProblem('85.50')).toBeNull();
    });
    it('productsWithoutCost: solo cuenta productos que traen el costo y no es mayor que cero', () => {
        const list = [{ id: 'a', cost: 0 }, { id: 'b', cost: 45 }, { id: 'c' } as { id: string; cost: number }];
        expect(productsWithoutCost(list).map((p) => p.id)).toEqual(['a']);
    });
});

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

// Auditoría del 21 nov 2026 (Inventario): código opcional, categoría real y valor rotulado.
import { productCategoryOptions, productFormProblems, skuProblem } from './products-view';

describe('summarizeProducts · valor a costo', () => {
    const base = { id: 'a', sku: '', category: 'General', min_stock: 0, status: 'ok' as const, created_at: '', updated_at: '' };
    const items = [
        { ...base, name: 'Peine', stock: 54, cost: 27, price: 80 },
        { ...base, id: 'b', name: 'Polvo', stock: 48, cost: 115, price: 225 },
    ];
    it('sin withCost no manda totalCost (recepción no recibe costos)', () => {
        expect(summarizeProducts(items)).not.toHaveProperty('totalCost');
        expect(summarizeProducts(items).totalValue).toBe(54 * 80 + 48 * 225);
    });
    it('con withCost suma existencias × costo, aparte del valor a precio de venta', () => {
        expect(summarizeProducts(items, { withCost: true })).toMatchObject({ totalValue: 15120, totalCost: 54 * 27 + 48 * 115 });
    });
});

describe('formulario de producto', () => {
    it('el código vacío es válido; 1 carácter o más de 60, no', () => {
        expect(productFormProblems({ name: 'Peine de textura', sku: '', price: 80 })).toEqual({});
        expect(productFormProblems({ name: 'Peine de textura', sku: '   ', price: 80 })).toEqual({});
        expect(productFormProblems({ name: 'Peine de textura', sku: 'PE', price: 80 })).toEqual({});
        expect(productFormProblems({ name: 'Peine de textura', sku: 'P', price: 80 }).sku).toBe('El código debe tener al menos 2 caracteres, o déjalo vacío.');
        expect(productFormProblems({ name: 'Peine de textura', sku: 'x'.repeat(61), price: 80 }).sku).toBe('El código es muy largo (máximo 60 caracteres).');
        expect(skuProblem('')).toBeNull();
        expect(skuProblem(' A ')).toBe('El código debe tener al menos 2 caracteres, o déjalo vacío.');
    });
    it('nombre y precio: avisos en español', () => {
        expect(productFormProblems({ name: ' ', sku: '', price: 80 }).name).toBe('Escribe el nombre del producto (al menos 2 letras).');
        expect(productFormProblems({ name: 'Peine', sku: '', price: NaN }).price).toBe('Escribe el precio de venta (en pesos).');
        expect(productFormProblems({ name: 'Peine', sku: '', price: -1 }).price).toBe('Escribe el precio de venta (en pesos).');
        expect(productFormProblems({ name: 'Peine', sku: '', price: 0 })).toEqual({});
    });
    it('la lista de categorías siempre incluye «General» y la que ya tiene el producto', () => {
        expect(productCategoryOptions('General')).toEqual(['General', 'Ceras', 'Pomadas', 'Geles', 'Shampoos', 'Aceites', 'Accesorios']);
        expect(productCategoryOptions(' Fijación media ')).toContain('Fijación media');
        expect(productCategoryOptions(null)[0]).toBe('General');
    });
});
