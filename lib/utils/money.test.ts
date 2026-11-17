import { describe, expect, it } from 'vitest';
import { formatMoney } from './money';

describe('formatMoney', () => {
    it('sin centavos si es entero', () => {
        expect(formatMoney(150)).toBe('$150');
        expect(formatMoney(1250)).toBe('$1,250');
        expect(formatMoney(0)).toBe('$0');
    });
    it('con centavos si no es entero', () => {
        expect(formatMoney(150.5)).toBe('$150.50');
        expect(formatMoney(149.999)).toBe('$150');
    });
    it('cents: true siempre con dos decimales', () => {
        expect(formatMoney(150, { cents: true })).toBe('$150.00');
        expect(formatMoney(12345.6, { cents: true })).toBe('$12,345.60');
    });
    it('negativos, textos y valores vacíos', () => {
        expect(formatMoney(-80)).toBe('-$80');
        expect(formatMoney('45', { cents: true })).toBe('$45.00');
        expect(formatMoney(null)).toBe('$0');
        expect(formatMoney(NaN)).toBe('$0');
    });
});
