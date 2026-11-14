import { describe, expect, it } from 'vitest';
import { addDays, isSunday, latestClosedWeekStart, weekLabel } from './week';

const MX = 'America/Mexico_City'; // UTC-6 todo el año

describe('latestClosedWeekStart (corte sábado 8:00 pm)', () => {
    it('sábado antes de las 8 pm: la semana en curso aún no cierra, vale la anterior', () => {
        // Sábado 14-nov-2026 01:00 hora de México
        expect(latestClosedWeekStart(new Date('2026-11-14T07:00:00Z'), MX)).toBe('2026-11-01');
        // Sábado 14-nov-2026 19:59
        expect(latestClosedWeekStart(new Date('2026-11-15T01:59:00Z'), MX)).toBe('2026-11-01');
    });

    it('sábado desde las 8 pm: la semana ya cerró', () => {
        // Sábado 14-nov-2026 20:00
        expect(latestClosedWeekStart(new Date('2026-11-15T02:00:00Z'), MX)).toBe('2026-11-08');
    });

    it('domingo y entre semana: la última semana cerrada es la que terminó el sábado anterior', () => {
        expect(latestClosedWeekStart(new Date('2026-11-15T20:00:00Z'), MX)).toBe('2026-11-08'); // domingo
        expect(latestClosedWeekStart(new Date('2026-11-18T18:00:00Z'), MX)).toBe('2026-11-08'); // miércoles
        expect(latestClosedWeekStart(new Date('2026-11-21T01:00:00Z'), MX)).toBe('2026-11-08'); // viernes 19:00
    });

    it('siempre devuelve un domingo', () => {
        for (let day = 0; day < 14; day++) {
            const now = new Date(Date.UTC(2026, 10, 1 + day, 12, 0, 0));
            expect(isSunday(latestClosedWeekStart(now, MX))).toBe(true);
        }
    });
});

describe('fechas', () => {
    it('suma días cruzando meses', () => {
        expect(addDays('2026-11-28', 6)).toBe('2026-12-04');
        expect(addDays('2026-11-08', -7)).toBe('2026-11-01');
    });

    it('solo acepta domingos', () => {
        expect(isSunday('2026-11-01')).toBe(true);
        expect(isSunday('2026-11-02')).toBe(false);
        expect(isSunday('no-es-fecha')).toBe(false);
    });

    it('describe la semana en español', () => {
        expect(weekLabel('2026-11-01')).toBe('1 al 7 de noviembre de 2026');
        expect(weekLabel('2026-11-29')).toContain('29 de noviembre al 5 de diciembre');
    });
});
