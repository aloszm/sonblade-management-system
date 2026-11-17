import { describe, expect, it } from 'vitest';
import { VISIBLE_DAY_RANGE, hourMarks, isHappening, weekGridRange } from './calendar-grid';

describe('cuadrícula semanal', () => {
    it('siempre muestra de 8:00 a 22:00, sin importar el horario del negocio', () => {
        expect(weekGridRange()).toEqual({ start: 480, end: 1320 });
        expect(weekGridRange([{ start: 12 * 60 + 30, end: 20 * 60 }])).toEqual(VISIBLE_DAY_RANGE);
    });
    it('se amplía solo si una cita cae fuera de ese rango', () => {
        expect(weekGridRange([{ start: 7 * 60, end: 7 * 60 + 30 }]).start).toBe(7 * 60);
        expect(weekGridRange([{ start: 22 * 60, end: 22 * 60 + 30 }]).end).toBe(22 * 60 + 30);
    });
    it('marca solo las horas en punto: 8 a.m. a 9 p.m. (14 marcas)', () => {
        const marks = hourMarks({ start: 480, end: 1320 });
        expect(marks).toHaveLength(14);
        expect(marks[0]).toBe(480);
        expect(marks[13]).toBe(21 * 60);
    });
    it('hourMarks parte de la primera hora en punto si el rango empieza en media hora', () => {
        expect(hourMarks({ start: 450, end: 600 })).toEqual([480, 540]);
    });
    it('isHappening incluye el inicio y excluye el fin', () => {
        expect(isHappening({ start: 600, end: 630 }, 600)).toBe(true);
        expect(isHappening({ start: 600, end: 630 }, 630)).toBe(false);
    });
});
