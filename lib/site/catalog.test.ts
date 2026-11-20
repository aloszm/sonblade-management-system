import { afterEach, describe, expect, it, vi } from 'vitest';

const callBooking = vi.fn();
vi.mock('@/lib/booking/db', () => ({ callBooking: (...args: unknown[]) => callBooking(...args) }));

import { canBookOnline, hoursToday, loadCatalog, loadPublicCatalog, type Catalog } from './catalog';

const HOURS = { '0': { open: '10:00', close: '19:00' }, '3': { open: '12:30', close: '20:00' } };
const RAW = {
    booking_enabled: false,
    timezone: 'America/Mexico_City',
    hours: HOURS,
    services: [
        { id: 's2', name: 'Barba', description: null, category: 'barba', price: '100.00', variable_price: false, duration_minutes: 30 },
        { id: 's1', name: 'Corte adulto', description: 'Diseño y corte', category: 'cortes', price: 150, variable_price: false, duration_minutes: 30 },
    ],
    barbers: [{ id: 'b1', name: 'Deya', title: null }, { id: 'b2', name: 'Sonia', title: 'Gerente Barbera' }],
};

afterEach(() => { callBooking.mockReset(); vi.unstubAllEnvs(); });

describe('loadPublicCatalog (public.public_catalog)', () => {
    it('llama la función nueva con el slug del negocio y normaliza servicios (orden del cartel, precio numérico, etiqueta)', async () => {
        vi.stubEnv('BOOKING_BUSINESS_SLUG', 'gallo-420');
        callBooking.mockResolvedValue(RAW);
        const loaded = await loadPublicCatalog();
        expect(callBooking).toHaveBeenCalledWith('public_catalog', { p_slug: 'gallo-420' });
        expect(loaded.enabled).toBe(true);
        expect(loaded.bookingEnabled).toBe(false);
        expect(loaded.services?.map((s) => [s.id, s.price, s.category_label])).toEqual([['s1', 150, 'Cortes'], ['s2', 100, 'Barba y afeitado']]);
        // El título interno no se publica: solo id y nombre.
        expect(loaded.barbers).toEqual([{ id: 'b1', name: 'Deya' }, { id: 'b2', name: 'Sonia' }]);
        expect(loaded.hours).toEqual(HOURS);
        expect(loaded.timezone).toBe('America/Mexico_City');
    });

    it('slug inexistente (objeto vacío): sin catálogo', async () => {
        callBooking.mockResolvedValue({});
        expect(await loadPublicCatalog()).toEqual({ enabled: false });
    });
});

describe('loadCatalog con el catálogo público', () => {
    it('reservas APAGADAS: igual muestra servicios y barberos, con bookingEnabled false', async () => {
        callBooking.mockResolvedValue(RAW);
        const catalog = await loadCatalog();
        expect(catalog.state).toBe('on');
        if (catalog.state !== 'on') return;
        expect(catalog.services).toHaveLength(2);
        expect(catalog.barbers.map((b) => b.name)).toEqual(['Deya', 'Sonia']);
        expect(catalog.bookingEnabled).toBe(false);
        expect(canBookOnline(catalog)).toBe(false);
    });

    it('reservas encendidas: bookingEnabled true y se puede reservar', async () => {
        callBooking.mockResolvedValue({ ...RAW, booking_enabled: true });
        const catalog = await loadCatalog();
        expect(catalog).toMatchObject({ state: 'on', bookingEnabled: true });
        expect(canBookOnline(catalog)).toBe(true);
    });

    it('base caída: estado error, sin lanzar', async () => {
        const spy = vi.spyOn(console, 'error').mockImplementation(() => {});
        callBooking.mockRejectedValue(new Error('booking rpc public_catalog: down'));
        expect(await loadCatalog()).toEqual({ state: 'error' });
        spy.mockRestore();
    });

    it('con la configuración de reservas (forma anterior) se conserva: encendida = se puede reservar', async () => {
        const catalog = await loadCatalog(async () => ({ enabled: true, services: [], barbers: [{ id: 'b1', name: 'Deya' }] }));
        expect(catalog).toEqual({ state: 'on', services: [], barbers: [{ id: 'b1', name: 'Deya' }] });
        expect(canBookOnline(catalog)).toBe(true);
        expect(canBookOnline({ state: 'off' })).toBe(false);
        expect(canBookOnline({ state: 'error' })).toBe(false);
    });
});

describe('hoursToday', () => {
    const on: Catalog = { state: 'on', services: [], barbers: [], hours: HOURS, timezone: 'America/Mexico_City' };
    it('usa el día en la zona del negocio', () => {
        // Domingo 22 nov 2026, 03:00 UTC = sábado 21 nov 21:00 en CDMX → sábado sin horario.
        expect(hoursToday(on, new Date('2026-11-22T03:00:00Z'))).toBeNull();
        // Domingo 22 nov 2026, 18:00 UTC = domingo 12:00 en CDMX.
        expect(hoursToday(on, new Date('2026-11-22T18:00:00Z'))).toEqual({ open: '10:00', close: '19:00' });
        // Miércoles 25 nov 2026.
        expect(hoursToday(on, new Date('2026-11-25T18:00:00Z'))).toEqual({ open: '12:30', close: '20:00' });
    });
    it('sin catálogo u horario: null', () => {
        expect(hoursToday({ state: 'off' })).toBeNull();
        expect(hoursToday({ state: 'on', services: [], barbers: [] })).toBeNull();
    });
});
