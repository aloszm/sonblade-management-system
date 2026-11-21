import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { paidSalesText, reversedSalesText, summarizeSalesHistory } from './history-summary';

// Auditoría del 21 nov 2026: en la semana del 8 al 14 de noviembre Ventas decía «118 ventas» y Panel, Finanzas y
// Reportes 116, porque Ventas contaba también las 2 anuladas (pero no las sumaba en el total ni en el ticket).
describe('Ventas: las anuladas no cuentan como ventas', () => {
    const paid = Array.from({ length: 116 }, (_, i) => ({ status: 'paid', total: i === 0 ? 245 : 200 }));
    const sales = [...paid, { status: 'refunded', total: 150 }, { status: 'refunded', total: '225.00' }];

    it('cuenta 116 cobradas y 2 anuladas, y el total y el ticket salen solo de las cobradas', () => {
        const s = summarizeSalesHistory(sales);
        expect(s.paidCount).toBe(116);
        expect(s.reversedCount).toBe(2);
        expect(s.total).toBe(245 + 115 * 200);
        expect(s.averageTicket).toBeCloseTo((245 + 115 * 200) / 116, 6);
    });

    it('sin ventas cobradas no hay ticket promedio (no divide entre cero)', () => {
        expect(summarizeSalesHistory([])).toEqual({ paidCount: 0, reversedCount: 0, total: 0, averageTicket: null });
        expect(summarizeSalesHistory([{ status: 'refunded', total: 150 }])).toEqual({ paidCount: 0, reversedCount: 1, total: 0, averageTicket: null });
    });

    it('acepta totales como texto (así llegan de la base) y redondea a centavos', () => {
        expect(summarizeSalesHistory([{ status: 'paid', total: '0.10' }, { status: 'paid', total: '0.20' }]).total).toBe(0.3);
    });

    it('los textos distinguen singular y plural, y las anuladas van aparte', () => {
        expect(paidSalesText(116)).toBe('116 ventas cobradas');
        expect(paidSalesText(1)).toBe('1 venta cobrada');
        expect(paidSalesText(0)).toBe('0 ventas cobradas');
        expect(reversedSalesText(2)).toBe('2 anuladas');
        expect(reversedSalesText(1)).toBe('1 anulada');
        expect(reversedSalesText(0)).toBe('');
    });

    it('la pantalla usa este resumen: ya no cuenta con sales.length en el encabezado ni en la tarjeta', () => {
        const src = readFileSync(path.join(process.cwd(), 'app/ventas/historial/page.tsx'), 'utf8');
        expect(src).toContain('summarizeSalesHistory(sales)');
        expect(src).not.toMatch(/\{sales\.length\} ventas/);
        expect(src).not.toMatch(/>Ventas<\/p><p[^>]*>\{sales\.length\}/);
        expect(src).toContain('data-testid="sales-reversed-count"');
    });
});
