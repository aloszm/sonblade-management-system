import { describe, expect, it } from 'vitest';
import { daysBefore, incurredOnProblem } from './rules';

describe('reglas de fecha de gastos (B6)', () => {
    it('cuenta días de calendario hacia atrás', () => {
        expect(daysBefore('2026-11-20', 31)).toBe('2026-10-20');
        expect(daysBefore('2026-03-01', 1)).toBe('2026-02-28');
    });
    it('acepta hoy y hasta 31 días atrás; rechaza futuro y más de 31 días', () => {
        expect(incurredOnProblem('2026-11-20', '2026-11-20', 'bank')).toBeNull();
        expect(incurredOnProblem('2026-11-10', '2026-11-20', 'envelope')).toBeNull();
        expect(incurredOnProblem('2026-10-20', '2026-11-20', 'bank')).toBeNull();
        expect(incurredOnProblem('2026-10-19', '2026-11-20', 'bank')).toMatch(/31 días/);
        expect(incurredOnProblem('2026-11-21', '2026-11-20', 'bank')).toMatch(/futura/);
    });
    it('el gasto de caja solo con fecha de hoy', () => {
        expect(incurredOnProblem('2026-11-19', '2026-11-20', 'cash_drawer')).toMatch(/caja del día/);
        expect(incurredOnProblem('2026-11-20', '2026-11-20', 'cash_drawer')).toBeNull();
    });
});
