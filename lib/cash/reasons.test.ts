import { describe, expect, it } from 'vitest';
import { closingNeedsReason, closingWarning, openingNeedsReason, openingReference, openingWarning, reasonProblem } from '@/lib/cash/reasons';

describe('motivos de la caja', () => {
    it('el motivo debe tener de 5 a 300 letras (sin contar espacios de los lados)', () => {
        expect(reasonProblem('')).toMatch(/de 5 a 300/);
        expect(reasonProblem('   abc   ')).not.toBeNull();
        expect(reasonProblem('Pago a proveedor')).toBeNull();
        expect(reasonProblem('x'.repeat(300))).toBeNull();
        expect(reasonProblem('x'.repeat(301))).not.toBeNull();
        expect(reasonProblem(null, 'un comentario')).toBe('Escribe un comentario (de 5 a 300 letras).');
    });
    it('cierre: dejar menos del fondo recomendado pide motivo; igual o más, no', () => {
        expect(closingNeedsReason(300, 500)).toBe(true);
        expect(closingNeedsReason(499.99, 500)).toBe(true);
        expect(closingNeedsReason(500, 500)).toBe(false);
        expect(closingNeedsReason(650, 500)).toBe(false);
        expect(closingWarning(300, 500)).toBe('Se recomienda dejar $500 para mañana; vas a dejar $300.');
    });
    it('apertura: se compara con lo que dejó el cierre anterior o, si no hay, con el fondo recomendado', () => {
        expect(openingReference(300, 500)).toBe(300);
        expect(openingReference(null, 500)).toBe(500);
        expect(openingNeedsReason(250, 300, 500)).toBe(true);
        expect(openingNeedsReason(300, 300, 500)).toBe(false);
        expect(openingNeedsReason(500, null, 500)).toBe(false);
        expect(openingNeedsReason(400, null, 500)).toBe(true);
        expect(openingNeedsReason(0.1 + 0.2, 0.3, 500)).toBe(false);
        expect(openingWarning(250, 300, 500)).toBe('Ayer se dejaron $300; estás abriendo con $250.');
        expect(openingWarning(400, null, 500)).toBe('El fondo recomendado es $500; estás abriendo con $400.');
    });
});
