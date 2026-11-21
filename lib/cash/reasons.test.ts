import { describe, expect, it } from 'vitest';
import {
    DIFFERENCE_OTHER, DIFFERENCE_SUGGESTIONS, closingNeedsReason, closingWarning, differenceNeedsReason, differenceReasonMessage, differenceReasonProblem,
    differenceText, isDifferenceReasonError, openingNeedsReason, openingReference, openingWarning, reasonProblem,
} from '@/lib/cash/reasons';
import { isUserFacingDbMessage } from '@/lib/auth/db-messages';

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
    it('diferencia al cerrar: con sobrante o faltante pide motivo; si cuadra (al centavo), no', () => {
        expect(differenceNeedsReason(0)).toBe(false);
        expect(differenceNeedsReason(0.1 + 0.2 - 0.3)).toBe(false);
        expect(differenceNeedsReason(-30)).toBe(true);
        expect(differenceNeedsReason(0.01)).toBe(true);
        expect(differenceText(-30)).toBe('Faltan $30');
        expect(differenceText(50)).toBe('Sobran $50');
        expect(differenceText(-0.5)).toBe('Faltan $0.50');
        expect(differenceText(0)).toBe('Cuadra');
    });
    it('el mensaje es el mismo que da la base (close_cash_session)', () => {
        // Textos copiados de supabase/tests/cash_difference_reason.test.sql (casos 2 y 6).
        expect(differenceReasonMessage(-30)).toBe('Hay una diferencia de $30 (faltante): escribe el motivo para cerrar (de 5 a 300 letras).');
        expect(differenceReasonMessage(50)).toBe('Hay una diferencia de $50 (sobrante): escribe el motivo para cerrar (de 5 a 300 letras).');
        expect(differenceReasonMessage(-1500.5)).toBe('Hay una diferencia de $1,500.50 (faltante): escribe el motivo para cerrar (de 5 a 300 letras).');
        expect(isDifferenceReasonError(differenceReasonMessage(-30))).toBe(true);
        expect(isDifferenceReasonError('Se recomienda dejar $500 para mañana; vas a dejar $300. Escribe el motivo (de 5 a 300 letras).')).toBe(false);
        expect(isUserFacingDbMessage(differenceReasonMessage(-1_000_000))).toBe(true);
    });
    it('motivo de la diferencia: de 5 a 300 letras; si cuadra no se pide', () => {
        expect(differenceReasonProblem(0, '')).toBeNull();
        expect(differenceReasonProblem(-30, '')).toBe(differenceReasonMessage(-30));
        expect(differenceReasonProblem(-30, '  abcd  ')).toBe(differenceReasonMessage(-30));
        expect(differenceReasonProblem(-30, 'Cambio mal dado')).toBeNull();
        expect(differenceReasonProblem(50, 'x'.repeat(300))).toBeNull();
        expect(differenceReasonProblem(50, 'x'.repeat(301))).not.toBeNull();
        // «Otro» no es motivo: deja el campo vacío para escribir.
        expect(DIFFERENCE_SUGGESTIONS).not.toContain(DIFFERENCE_OTHER);
        for (const s of DIFFERENCE_SUGGESTIONS) expect(differenceReasonProblem(-30, s)).toBeNull();
    });
});
