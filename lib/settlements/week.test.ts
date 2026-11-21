import { describe, expect, it } from 'vitest';
import { addDays, localClock } from './week';

// La semana de pago se prueba en lib/payroll/pay-period.test.ts.
describe('fechas', () => {
    it('suma días cruzando meses', () => {
        expect(addDays('2026-11-28', 6)).toBe('2026-12-04');
        expect(addDays('2026-11-08', -7)).toBe('2026-11-01');
    });

    it('reloj local de la barbería', () => {
        expect(localClock(new Date('2026-11-15T01:59:00Z'), 'America/Mexico_City')).toEqual({ date: '2026-11-14', dow: 6, hour: 19 });
    });
});
