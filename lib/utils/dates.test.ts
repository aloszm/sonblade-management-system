import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatDate, formatDateTime, formatTime, localDateKey, zonedDayStartIso } from './dates';

afterEach(() => vi.unstubAllEnvs());

describe('localDateKey', () => {
    it('a las 8:00 pm en México sigue siendo el mismo día', () => {
        vi.stubEnv('TZ', 'America/Mexico_City');
        expect(localDateKey(new Date('2026-11-17T02:00:00Z'))).toBe('2026-11-16');
    });
});

describe('zonedDayStartIso', () => {
    it('da la medianoche de la barbería aunque el servidor esté en UTC', () => {
        expect(zonedDayStartIso('2026-11-16', 'America/Mexico_City')).toBe('2026-11-16T06:00:00.000Z');
        expect(zonedDayStartIso('2026-11-16', 'UTC')).toBe('2026-11-16T00:00:00.000Z');
    });

    it('funciona con zonas al este de UTC', () => {
        expect(zonedDayStartIso('2026-11-16', 'Europe/Madrid')).toBe('2026-11-15T23:00:00.000Z');
    });
});

describe('businessDayRange', () => {
    it('una venta de las 9:30 pm en México cae dentro de "hoy"', async () => {
        const { businessDayRange } = await import('@/lib/business/timezone');
        const range = businessDayRange('2026-11-14', '2026-11-14', 'America/Mexico_City');
        expect(range).toEqual({ from: '2026-11-14T06:00:00.000Z', to: '2026-11-15T06:00:00.000Z' });
        const saleAt = '2026-11-15T03:30:00.000Z'; // sábado 14, 9:30 pm en CDMX
        expect(saleAt >= range.from && saleAt < range.to).toBe(true);
        // Antes el servidor filtraba por día UTC y esta venta quedaba fuera de "hoy".
        expect(saleAt <= '2026-11-14T23:59:59.999Z').toBe(false);
    });
});


describe('formato en la zona de la barbería', () => {
    it('hora en 12 horas', () => {
        expect(formatTime('2026-11-17T21:41:14Z')).toBe('3:41 p. m.');
        expect(formatTime('2026-11-17T18:00:00Z')).toBe('12:00 p. m.'); // mediodía en México
        expect(formatTime('2026-11-17T06:00:00Z')).toBe('12:00 a. m.'); // medianoche en México
    });
    it('el cambio de día sigue la zona, no el navegador ni UTC', () => {
        // 02:30 UTC del 18 aún es 17 por la noche en México.
        expect(formatDate('2026-11-18T02:30:00Z')).toBe('mar 17 nov 2026');
        expect(formatDateTime('2026-11-18T02:30:00Z')).toBe('mar 17 nov 2026, 8:30 p. m.');
        expect(formatDate('2026-11-18T06:00:00Z')).toBe('mié 18 nov 2026');
    });
    it('otra zona y sin año', () => {
        expect(formatTime('2026-11-17T21:41:14Z', 'America/Tijuana')).toBe('1:41 p. m.');
        expect(formatDate('2026-11-17T21:41:14Z', 'America/Mexico_City', { year: false })).toBe('mar 17 nov');
    });
});
