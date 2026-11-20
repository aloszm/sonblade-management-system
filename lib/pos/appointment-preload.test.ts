import { describe, expect, it } from 'vitest';
import type { AppointmentProductLine, AppointmentProducts } from '@/lib/appointments/extras';
import type { Product, Service } from '@/types';
import { appointmentCartLines, productLineSeller } from './appointment-preload';

const DEYA = 'e-deya';
const DAGO = 'e-dago';
const service = (id: string, name: string, price: number, variable = false) => ({ id, name, price, variable_price: variable, duration: 30 }) as unknown as Service;
const product = (id: string, name: string, price: number, stock: number) => ({ id, name, price, stock }) as unknown as Product;
const line = (over: Partial<AppointmentProductLine>): AppointmentProductLine => ({
    id: 'l1', appointment_id: 'a1', product_id: 'p1', name: 'Prueba cera', quantity: 1, unit_price: 150, product_active: true,
    tracks_inventory: true, stock: 5, short_stock: false, seller_employee_id: DEYA, seller_name: 'Deya', added_by: 'u-dago',
    added_by_name: 'Dago', added_at: '2026-11-20T15:00:00Z', updated_at: null, ...over,
});
const block = (lines: AppointmentProductLine[]): AppointmentProducts => ({
    barber: { id: DEYA, name: 'Deya' }, session_employee: null, open: true, can_edit: true, can_choose_seller: true, lines,
});
const SERVICES = [service('s1', 'Corte clásico', 200), service('s2', 'Grecas', 0, true)];
const PRODUCTS = [product('p1', 'Prueba cera', 160, 5), product('p2', 'Prueba shampoo', 120, 0), product('p3', 'Prueba aceite', 180, 2)];
let counter = 0;
const nextId = (id: string) => `s-${id}-${++counter}`;

describe('appointmentCartLines', () => {
    it('precarga servicios (con precio libre) y productos con su vendedor y precio vigente del catálogo', () => {
        const { items, skipped } = appointmentCartLines({
            services: [{ service_id: 's1', name: 'Corte clásico', price: 180, duration_minutes: 30 }, { service_id: 's2', name: 'Grecas', price: 0, duration_minutes: 30 }],
            products: block([line({ quantity: 2 }), line({ id: 'l2', product_id: 'p3', name: 'Prueba aceite', seller_employee_id: DAGO, seller_name: 'Dago' })]),
        }, SERVICES, PRODUCTS, nextId);
        expect(skipped).toEqual([]);
        expect(items).toEqual([
            { id: 's-s1', name: 'Corte clásico', price: 200, type: 'service', quantity: 1, service_id: 's1' },
            expect.objectContaining({ type: 'service', service_id: 's2', variable_price: true, price_input: '', price: 0 }),
            { id: 'p-p1-e-deya', name: 'Prueba cera', price: 160, type: 'product', quantity: 2, product_id: 'p1', seller_id: DEYA, seller_name: 'Deya' },
            { id: 'p-p3-e-dago', name: 'Prueba aceite', price: 180, type: 'product', quantity: 1, product_id: 'p3', seller_id: DAGO, seller_name: 'Dago' },
        ]);
    });

    it('sin productos en la cita se comporta como antes (solo servicios)', () => {
        const { items } = appointmentCartLines({ services: [{ service_id: 's1', name: 'Corte clásico', price: 200, duration_minutes: 30 }] }, SERVICES, null, nextId);
        expect(items).toEqual([{ id: 's-s1', name: 'Corte clásico', price: 200, type: 'service', quantity: 1, service_id: 's1' }]);
    });

    it('omite productos inactivos o sin existencias y recorta a las existencias (también entre dos vendedores)', () => {
        const { items, skipped } = appointmentCartLines({
            services: [],
            products: block([
                line({ product_id: 'p2', name: 'Prueba shampoo' }),
                line({ id: 'l3', product_id: 'p9', name: 'Prueba retirado', product_active: false }),
                line({ id: 'l4', product_id: 'p3', name: 'Prueba aceite', quantity: 2 }),
                line({ id: 'l5', product_id: 'p3', name: 'Prueba aceite', quantity: 1, seller_employee_id: DAGO }),
            ]),
        }, SERVICES, PRODUCTS, nextId);
        expect(items.map((i) => [i.product_id, i.seller_id, i.quantity])).toEqual([['p3', DEYA, 2]]);
        expect(skipped).toEqual([
            { name: 'Prueba shampoo', reason: 'no_stock' },
            { name: 'Prueba retirado', reason: 'inactive' },
            { name: 'Prueba aceite', reason: 'no_stock' },
        ]);
    });

    it('recorta y avisa cuando no alcanzan las piezas', () => {
        const { items, skipped } = appointmentCartLines({ services: [], products: block([line({ product_id: 'p3', name: 'Prueba aceite', quantity: 5 })]) }, SERVICES, PRODUCTS, nextId);
        expect(items[0].quantity).toBe(2);
        expect(skipped).toEqual([{ name: 'Prueba aceite', reason: 'short_stock' }]);
    });

    it('producto que no lleva inventario no se recorta', () => {
        const { items } = appointmentCartLines({ services: [], products: block([line({ product_id: 'p2', tracks_inventory: false, stock: null, quantity: 3 })]) }, SERVICES, PRODUCTS, nextId);
        expect(items[0].quantity).toBe(3);
    });
});

describe('productLineSeller', () => {
    it('usa el vendedor de la partida y, si no tiene, el del cobro', () => {
        expect(productLineSeller({ type: 'product', seller_id: DAGO }, DEYA)).toBe(DAGO);
        expect(productLineSeller({ type: 'product' }, DEYA)).toBe(DEYA);
        expect(productLineSeller({ type: 'service', seller_id: DAGO }, DEYA)).toBe(DEYA);
    });
});
