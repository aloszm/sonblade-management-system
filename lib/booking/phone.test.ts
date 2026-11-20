import { describe, expect, it } from 'vitest';
import { normalizeBookingPhone } from './phone';

describe('normalizeBookingPhone', () => {
    it('acepta 10 dígitos con separadores y prefijos de México', () => {
        expect(normalizeBookingPhone('55 1234 5678')).toBe('5512345678');
        expect(normalizeBookingPhone('+52 (55) 1234-5678')).toBe('5512345678');
        expect(normalizeBookingPhone('+521 55 1234 5678')).toBe('5512345678');
    });
    it('rechaza todos los dígitos iguales, también con prefijo o separadores', () => {
        for (const bad of ['0000000000', '1111111111', '5555555555', '+52 5555555555', '55 5555 5555', '999-999-9999']) {
            expect(normalizeBookingPhone(bad)).toBeNull();
        }
    });
    it('rechaza longitudes distintas de 10, letras y ceros iniciales', () => {
        for (const bad of ['', '123', '551234567', '55123456789', '0512345678', '55-ABCD-5678', 'x'.repeat(40)]) {
            expect(normalizeBookingPhone(bad)).toBeNull();
        }
        expect(normalizeBookingPhone(5512345678)).toBeNull();
        expect(normalizeBookingPhone(null)).toBeNull();
    });
});
