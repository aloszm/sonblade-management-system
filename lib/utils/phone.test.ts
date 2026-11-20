import { describe, expect, it } from 'vitest';
import { formatPhone } from './phone';

describe('formatPhone', () => {
    it('agrupa 10 dígitos como "55 7384 4043"', () => {
        expect(formatPhone('5573844043')).toBe('55 7384 4043');
        expect(formatPhone('(55) 7384-4043')).toBe('55 7384 4043');
    });
    it('conserva la lada +52', () => {
        expect(formatPhone('+52 5573844043')).toBe('+52 55 7384 4043');
    });
    it('no deforma lo que no es un teléfono de 10 dígitos y tolera vacíos', () => {
        expect(formatPhone('12345')).toBe('12345');
        expect(formatPhone('+1 415 555 0100')).toBe('+1 415 555 0100');
        expect(formatPhone(null)).toBe('');
        expect(formatPhone(undefined)).toBe('');
    });
});
