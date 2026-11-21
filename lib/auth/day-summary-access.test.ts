import { describe, expect, it } from 'vitest';
import type { BusinessRole } from '@/lib/auth/context';
import { canSeeDaySummary, daySummaryDayAllowed } from '@/lib/auth/roles';
import { canEnter } from '@/lib/auth/route-access';
import { CAPABILITIES } from '@/lib/auth/capabilities';

const TODAY = '2026-11-21';

describe('resumen de caja del día: quién y qué día', () => {
    it.each<BusinessRole>(['owner', 'admin', 'viewer'])('%s ve cualquier día', (r) => {
        expect(canSeeDaySummary(r)).toBe(true);
        for (const d of ['2026-11-21', '2026-11-20', '2026-11-01', '2025-01-01']) expect(daySummaryDayAllowed(r, d, TODAY)).toBe(true);
    });
    it.each<BusinessRole>(['receptionist', 'cashier'])('%s solo hoy y ayer', (r) => {
        expect(daySummaryDayAllowed(r, '2026-11-21', TODAY)).toBe(true);
        expect(daySummaryDayAllowed(r, '2026-11-20', TODAY)).toBe(true);
        expect(daySummaryDayAllowed(r, '2026-11-19', TODAY)).toBe(false);
        expect(daySummaryDayAllowed(r, '2025-11-20', TODAY)).toBe(false);
    });
    it('«ayer» cruza bien el cambio de mes y de año', () => {
        expect(daySummaryDayAllowed('receptionist', '2026-10-31', '2026-11-01')).toBe(true);
        expect(daySummaryDayAllowed('receptionist', '2025-12-31', '2026-01-01')).toBe(true);
        expect(daySummaryDayAllowed('receptionist', '2026-02-28', '2026-03-01')).toBe(true);
    });
    it('el barbero no entra, ni a la pantalla ni a ningún día', () => {
        expect(canSeeDaySummary('barber')).toBe(false);
        expect(daySummaryDayAllowed('barber', TODAY, TODAY)).toBe(false);
        expect(canEnter('barber', '/caja/resumen')).toBe(false);
    });
    it('la pantalla /caja/resumen la abren todos menos el barbero', () => {
        for (const r of ['owner', 'admin', 'viewer', 'receptionist', 'cashier']) expect(canEnter(r, '/caja/resumen')).toBe(true);
    });
    it('«Quién ve qué» lo anota: sí/sí/sí/solo hoy y ayer/no', () => {
        const cap = CAPABILITIES.find((c) => c.id === 'caja.resumen');
        expect(cap?.label).toBe('Ver el resumen de caja del día');
        expect((['owner', 'admin', 'viewer', 'receptionist', 'barber'] as BusinessRole[]).map((r) => cap!.evaluate(r))).toEqual([
            { level: 'si' }, { level: 'si' }, { level: 'si' }, { level: 'si', note: 'Solo hoy y ayer.' }, { level: 'no' },
        ]);
    });
});
