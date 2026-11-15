import { describe, expect, it } from 'vitest';
import { formatHour, validWeekHours, workingWindow, type ScheduleData } from './hours';

const data: Pick<ScheduleData, 'hours' | 'barbers'> = {
    hours: {
        0: { open: '10:00', close: '19:00' }, 1: { open: '10:00', close: '19:00' }, 2: { open: '12:30', close: '20:00' },
        3: { open: '12:30', close: '20:00' }, 4: { open: '12:30', close: '20:00' }, 5: { open: '12:30', close: '20:00' }, 6: null,
    },
    barbers: { dani: [{ weekday: 2, off: true, starts: null, ends: null }, { weekday: 3, off: false, starts: '15:00', ends: '21:00' }] },
};

describe('horario', () => {
    it('usa el horario del negocio por día', () => {
        expect(workingWindow(data, '2026-11-15')).toEqual({ open: 600, close: 1140 }); // domingo
        expect(workingWindow(data, '2026-11-17')).toEqual({ open: 750, close: 1200 }); // martes
        expect(workingWindow(data, '2026-11-21')).toBeNull(); // sábado cerrado en este ejemplo
    });

    it('el horario del barbero se recorta al del negocio y respeta sus descansos', () => {
        expect(workingWindow(data, '2026-11-17', 'dani')).toBeNull(); // descansa martes
        expect(workingWindow(data, '2026-11-18', 'dani')).toEqual({ open: 900, close: 1200 }); // 15:00 a 20:00 (no 21:00)
        expect(workingWindow(data, '2026-11-18', 'otro')).toEqual({ open: 750, close: 1200 });
    });

    it('sin horario configurado no restringe', () => {
        expect(workingWindow({ hours: null, barbers: {} }, '2026-11-17')).toBeUndefined();
    });

    it('valida como la base y da formato legible', () => {
        expect(validWeekHours({ 2: { open: '20:00', close: '12:30' } })).toMatch('martes');
        expect(validWeekHours({ 2: { open: '12:30', close: '20:00' }, 6: null })).toBeNull();
        expect(formatHour('12:30')).toBe('12:30 p.m.');
        expect(formatHour('10:00')).toBe('10 a.m.');
        expect(formatHour('20:00')).toBe('8 p.m.');
    });
});
