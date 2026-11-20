import { describe, expect, it } from 'vitest';
import { sentLabel } from './sent-label';

// 20 nov 2026, 15:30 en Ciudad de México (UTC-6) = 21:30 UTC.
const NOW = new Date('2026-11-20T21:30:00Z');

describe('sentLabel', () => {
    it('hoy: "Enviado por Dago, hoy 3:15 p. m."', () => {
        expect(sentLabel({ at: '2026-11-20T21:15:00Z', by_name: 'Dago' }, NOW)).toBe('Enviado por Dago, hoy 3:15 p. m.');
    });
    it('ayer y días anteriores', () => {
        expect(sentLabel({ at: '2026-11-19T18:00:00Z', by_name: 'Dago' }, NOW)).toBe('Enviado por Dago, ayer 12:00 p. m.');
        expect(sentLabel({ at: '2026-11-17T18:00:00Z', by_name: 'Sonia' }, NOW)).toMatch(/^Enviado por Sonia, mar 17 nov, 12:00 p\. m\.$/);
    });
    it('la medianoche del negocio cuenta como el día del negocio, no el de UTC', () => {
        // 21 nov 02:30 UTC es todavía 20 nov 8:30 p. m. en México.
        expect(sentLabel({ at: '2026-11-21T02:30:00Z', by_name: null }, NOW)).toBe('Enviado, hoy 8:30 p. m.');
    });
});
