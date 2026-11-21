import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { RECONCILIATION_LABELS, reconciliationRowText, reconciliationSummaryText } from './labels';

// Auditoría del 21 nov 2026: Cuadre decía «Servicios cobrados 112» y el Panel «Servicios 137» para la misma semana.
// Cuadre cuenta visitas (ventas con servicio), no servicios: se corrige el nombre, no el cálculo.
describe('Cuadre: cuenta visitas, no servicios', () => {
    it('los rótulos dicen «visitas» y explican la diferencia con el Panel', () => {
        expect(RECONCILIATION_LABELS.agenda).toBe('Visitas atendidas en la agenda');
        expect(RECONCILIATION_LABELS.charged).toBe('Visitas cobradas');
        expect(RECONCILIATION_LABELS.note).toContain('El número de servicios está en el Panel');
        for (const text of Object.values(RECONCILIATION_LABELS)) expect(text).not.toMatch(/^Servicios/);
    });

    it('la frase compara visitas, con singular y plural', () => {
        expect(reconciliationSummaryText(112, 112)).toBe('La agenda y los cobros cuentan las mismas visitas.');
        expect(reconciliationSummaryText(113, 112)).toBe('Se cobraron 1 visita más de las que hay en la agenda. Las diferencias de abajo dicen cuáles.');
        expect(reconciliationSummaryText(110, 112)).toBe('La agenda tiene 2 visitas más de las que se cobraron. Las diferencias de abajo dicen cuáles.');
    });

    it('el renglón de celular también habla de visitas', () => {
        expect(reconciliationRowText({ agenda_services: 5, agenda_walk_in: 1, charged_services: 5 }, '$750.00')).toBe('Visitas: agenda 5 (1 sin cita) · cobradas 5 por $750.00');
        expect(reconciliationRowText({ agenda_services: 3, agenda_walk_in: 0, charged_services: 2 }, '$300.00')).toBe('Visitas: agenda 3 · cobradas 2 por $300.00');
    });

    it('la pantalla ya no rotula esas cifras como «Servicios»', () => {
        const src = readFileSync(path.join(process.cwd(), 'app/cuadre/page.tsx'), 'utf8');
        expect(src).not.toContain('Servicios cobrados');
        expect(src).not.toContain('Servicios en la agenda');
        expect(src).not.toContain('mismos servicios');
        expect(src).toContain('RECONCILIATION_LABELS.charged');
        expect(src).toContain('reconciliationSummaryText(sum.charged, sum.agenda)');
    });
});
