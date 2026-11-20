import { describe, expect, it } from 'vitest';
import { mapWageWeek } from '@/lib/payroll/wages';
import {
    DAY_ORDER, accruedText, canRegisterExceptions, dayLabel, exceptionDayOptions, longDayLabel, rateSentence, toggleWorkDay, weekDates,
} from './wage-ui';

// Semana del domingo 15 al sábado 21 de noviembre de 2026; Dago trabaja lunes a viernes.
const WEEK = '2026-11-15';
const FIXED = ['2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20'];
const wageWith = (overrides: Record<string, { status: string; amount: number }> = {}) => mapWageWeek({
    amount: 1600, groups: [{ rate: 320, days: 5, amount: 1600 }],
    days: FIXED.map((date) => ({ date, status: overrides[date]?.status ?? 'worked', rate: 320, amount: overrides[date]?.amount ?? 320 })),
})!;

describe('botones de días', () => {
    it('quedan ordenados de lunes a domingo y sin repetirse', () => {
        expect(DAY_ORDER).toEqual([1, 2, 3, 4, 5, 6, 0]);
        expect(toggleWorkDay([], 0)).toEqual([0]);
        expect(toggleWorkDay([0], 6)).toEqual([6, 0]);
        expect(toggleWorkDay([1, 2, 3], 2)).toEqual([1, 3]);
        expect(toggleWorkDay([1, 3], 2)).toEqual([1, 2, 3]);
    });
});

describe('textos del sueldo', () => {
    it('"$320 por día · lunes a viernes · desde 15 nov 2026"', () => {
        expect(rateSentence({ daily_amount: 320, work_days_label: 'lunes a viernes', effective_from: '2026-11-15' }))
            .toBe('$320 por día · lunes a viernes · desde 15 nov 2026');
        expect(dayLabel('2026-11-15')).toBe('15 nov 2026');
        expect(longDayLabel('2026-11-18')).toBe('miércoles 18 nov');
    });
    it('lo devengado concuerda en singular y plural', () => {
        expect(accruedText(1, 320)).toBe('1 día · $320 devengados');
        expect(accruedText(4, 1280)).toBe('4 días · $1,280 devengados');
    });
    it('la semana tiene 7 fechas de domingo a sábado', () => {
        const dates = weekDates(WEEK);
        expect(dates).toHaveLength(7);
        expect(dates[0]).toBe('2026-11-15');
        expect(dates[6]).toBe('2026-11-21');
    });
});

describe('días que se pueden elegir al registrar una excepción', () => {
    it('una falta solo cae en un día fijo que se da por trabajado', () => {
        expect(exceptionDayOptions('absent', wageWith(), WEEK)).toEqual(FIXED);
        // Un día que ya tiene falta no se ofrece otra vez.
        const absent = wageWith({ '2026-11-18': { status: 'absent', amount: 0 } });
        expect(exceptionDayOptions('absent', absent, WEEK)).toEqual(FIXED.filter((d) => d !== '2026-11-18'));
    });
    it('un día extra solo cae en un día sin sueldo (descanso)', () => {
        expect(exceptionDayOptions('extra', wageWith(), WEEK)).toEqual(['2026-11-15', '2026-11-21']);
        // El sábado ya tiene un día extra registrado: deja de ofrecerse.
        const withExtra = mapWageWeek({
            amount: 1920,
            days: [...FIXED, '2026-11-21'].map((date) => ({ date, status: date === '2026-11-21' ? 'extra' : 'worked', rate: 320, amount: 320 })),
        })!;
        expect(exceptionDayOptions('extra', withExtra, WEEK)).toEqual(['2026-11-15']);
    });
    it('sin sueldo en la semana no hay días que elegir para la falta', () => {
        expect(exceptionDayOptions('absent', null, WEEK)).toEqual([]);
    });
});

describe('quién puede registrar faltas y días extra', () => {
    it('solo con permiso de edición y la semana sin pagar', () => {
        expect(canRegisterExceptions({ can_edit: true, settled: false })).toBe(true);
        expect(canRegisterExceptions({ can_edit: true, settled: true })).toBe(false);
        expect(canRegisterExceptions({ can_edit: false, settled: false })).toBe(false);
    });
});
