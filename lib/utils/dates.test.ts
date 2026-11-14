import { afterEach, describe, expect, it, vi } from 'vitest';
import { localDateKey, zonedDayStartIso } from './dates';

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
