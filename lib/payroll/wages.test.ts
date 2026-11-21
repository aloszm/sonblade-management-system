import { describe, expect, it } from 'vitest';
import { currentPayWeekStart, mapWageWeek, rateAt, shortDayLabel, wageDayDetails, wageSummaryText, workDaysLabel } from './wages';

describe('wageSummaryText (mismo texto que la base)', () => {
    it('una tarifa', () => {
        expect(wageSummaryText([{ rate: 320, days: 5 }], 1600)).toBe('5 días × $320 = $1,600');
        expect(wageSummaryText([{ rate: 320, days: 1 }], 320)).toBe('1 día × $320 = $320');
    });
    it('cambio de tarifa a mitad de semana', () => {
        expect(wageSummaryText([{ rate: 350, days: 3 }, { rate: 320, days: 2 }], 1690)).toBe('2 días × $320 + 3 días × $350 = $1,690');
    });
    it('sin días pagados', () => {
        expect(wageSummaryText([], 0)).toBe('0 días');
    });
});

describe('mapWageWeek', () => {
    it('null si no hay sueldo', () => {
        expect(mapWageWeek(null)).toBeNull();
        expect(mapWageWeek(undefined)).toBeNull();
    });
    it('normaliza números y cuenta días aunque falten los totales', () => {
        const w = mapWageWeek({
            amount: '960.00',
            groups: [{ rate: '320.00', days: 3, amount: '960.00' }],
            days: [
                { date: '2026-11-15', status: 'worked', rate: '320', amount: '320' },
                { date: '2026-11-18', status: 'extra', rate: '320', amount: '320', reason: 'Cubre a Dago' },
                { date: '2026-11-21', status: 'worked', rate: '320', amount: '320' },
            ],
        })!;
        expect(w.amount).toBe(960);
        expect(w.paidDays).toBe(3);
        expect(w.extraDays).toBe(1);
        expect(w.days[1]).toMatchObject({ weekday: 3, status: 'extra', amount: 320, reason: 'Cubre a Dago' });
        expect(w.summary).toBe('3 días × $320 = $960');
    });
    it('detalle día por día', () => {
        const w = mapWageWeek({ amount: 320, summary: '1 día × $320 = $320', days: [{ date: '2026-11-21', status: 'extra', rate: 320, amount: 320, reason: 'Cubre' }] })!;
        expect(wageDayDetails(w)).toEqual([{ key: 'wage-2026-11-21', text: 'sáb 21 nov · Día extra (Cubre)', amount: 320 }]);
        expect(shortDayLabel('2026-11-16')).toBe('lun 16 nov');
    });
});

describe('workDaysLabel', () => {
    it('lee los días como en la barbería', () => {
        expect(workDaysLabel([1, 2, 3, 4, 5])).toBe('lunes a viernes');
        expect(workDaysLabel([0, 6])).toBe('sábado y domingo');
        expect(workDaysLabel([1, 3])).toBe('lunes y miércoles');
        expect(workDaysLabel([])).toBe('sin días fijos');
        expect(workDaysLabel([0, 1, 2, 3, 4, 5, 6])).toBe('toda la semana');
    });
});

describe('rateAt (vigencia)', () => {
    const rows = [
        { id: 'a', effective_from: '2026-11-15', created_at: '2026-11-20T10:00:00Z', daily_amount: 320 },
        { id: 'b', effective_from: '2026-11-18', created_at: '2026-11-20T11:00:00Z', daily_amount: 350 },
        { id: 'c', effective_from: '2026-11-18', created_at: '2026-11-20T12:00:00Z', daily_amount: 360 },
    ];
    it('la vigencia más reciente <= fecha; empate: la última capturada', () => {
        expect(rateAt(rows, '2026-11-14')).toBeNull();
        expect(rateAt(rows, '2026-11-17')?.id).toBe('a');
        expect(rateAt(rows, '2026-11-18')?.id).toBe('c');
    });
});

describe('currentPayWeekStart (igual que private.pay_week_start)', () => {
    const tz = 'America/Mexico_City';
    it('regla vieja hasta el sábado 14 nov a las 8 pm; después, la transición', () => {
        expect(currentPayWeekStart(new Date('2026-11-15T01:00:00Z'), tz)).toBe('2026-11-08'); // sábado 14, 7 pm
        expect(currentPayWeekStart(new Date('2026-11-15T03:00:00Z'), tz)).toBe('2026-11-15'); // sábado 14, 9 pm
        expect(currentPayWeekStart(new Date('2026-11-19T05:59:00Z'), tz)).toBe('2026-11-15'); // miércoles 18, 11:59 pm
    });
    it('periodo en curso de jueves a miércoles (la semana del 15 al 21 ya no existe)', () => {
        expect(currentPayWeekStart(new Date('2026-11-19T06:01:00Z'), tz)).toBe('2026-11-19'); // jueves 19, 00:01
        expect(currentPayWeekStart(new Date('2026-11-20T18:00:00Z'), tz)).toBe('2026-11-19'); // viernes
        expect(currentPayWeekStart(new Date('2026-11-21T20:00:00Z'), tz)).toBe('2026-11-19'); // sábado 2 pm
        expect(currentPayWeekStart(new Date('2026-11-22T03:00:00Z'), tz)).toBe('2026-11-19'); // sábado 9 pm
        expect(currentPayWeekStart(new Date('2026-11-22T18:00:00Z'), tz)).toBe('2026-11-19'); // domingo
        expect(currentPayWeekStart(new Date('2026-11-26T06:01:00Z'), tz)).toBe('2026-11-26'); // jueves 26, 00:01
    });
});
