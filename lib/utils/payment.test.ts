import { describe, expect, it } from 'vitest';
import { PAYMENT_METHOD_LABELS, paymentMethodLabel } from './payment';

describe('paymentMethodLabel', () => {
    it('nombra cada forma de pago igual en toda la app', () => {
        expect(paymentMethodLabel('cash')).toBe('Efectivo');
        expect(paymentMethodLabel('card')).toBe('Tarjeta');
        expect(paymentMethodLabel('transfer')).toBe('Transferencia');
        expect(paymentMethodLabel('mixed')).toBe('Mixto');
    });
    it('Tarjeta y Transferencia son distintas, también en corto', () => {
        expect(PAYMENT_METHOD_LABELS.card).not.toBe(PAYMENT_METHOD_LABELS.transfer);
        expect(paymentMethodLabel('transfer', true)).toBe('Transf.');
        expect(paymentMethodLabel('card', true)).toBe('Tarj.');
    });
    it('deja pasar lo desconocido y tolera vacíos', () => {
        expect(paymentMethodLabel('crypto')).toBe('crypto');
        expect(paymentMethodLabel(null)).toBe('');
    });
});
