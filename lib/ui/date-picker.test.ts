import { describe, expect, it } from 'vitest';
import {
    addMonthsKey, clampDay, daysInRange, formatDayLabel, formatRangeLabel, formatTime12, isDayDisabled, monthGrid,
    moveFocus, nearestOptionIndex, normalizeRange, parseDay, rangeShortcuts, startOfWeekKey, timeOptions,
    todayInBusiness, withValue,
} from './date-picker';

describe('fechas', () => {
    it('parseDay usa el día local y rechaza fechas inexistentes', () => {
        const d = parseDay('2026-11-16')!;
        expect([d.getFullYear(), d.getMonth(), d.getDate()]).toEqual([2026, 10, 16]);
        expect(parseDay('2026-02-30')).toBeNull();
        expect(parseDay('')).toBeNull();
    });
    it('formatea en español', () => {
        expect(formatDayLabel('2026-11-16')).toBe('lun 16 nov 2026');
        expect(formatRangeLabel('2026-11-08', '2026-11-14')).toBe('8 nov – 14 nov 2026');
    });
    it('hoy es el día de la barbería, no el UTC', () => {
        // 2026-11-17 02:00 UTC son las 8:00 pm del 16 en Ciudad de México.
        expect(todayInBusiness(new Date('2026-11-17T02:00:00Z'))).toBe('2026-11-16');
        expect(todayInBusiness(new Date('2026-11-17T07:00:00Z'))).toBe('2026-11-17');
    });
    it('el mes empieza en domingo y completa semanas', () => {
        const grid = monthGrid('2026-11-16');
        expect(grid[0][0].key).toBe('2026-11-01'); // 1 nov 2026 es domingo
        expect(grid).toHaveLength(5);
        expect(grid.every((w) => w.length === 7)).toBe(true);
        const oct = monthGrid('2026-10-10'); // 1 oct 2026 es jueves
        expect(oct[0][0].key).toBe('2026-09-27');
        expect(oct[0][4]).toMatchObject({ key: '2026-10-01', inMonth: true });
        expect(oct[0][0].inMonth).toBe(false);
    });
    it('febrero bisiesto tiene 29 días', () => {
        const days = monthGrid('2028-02-10').flat().filter((d) => d.inMonth);
        expect(days).toHaveLength(29);
        expect(monthGrid('2027-02-10').flat().filter((d) => d.inMonth)).toHaveLength(28);
    });
    it('cambio de mes y de año conservan o ajustan el día', () => {
        expect(addMonthsKey('2026-12-15', 1)).toBe('2027-01-15');
        expect(addMonthsKey('2026-01-15', -1)).toBe('2025-12-15');
        expect(addMonthsKey('2028-01-31', 1)).toBe('2028-02-29');
        expect(addMonthsKey('2027-01-31', 1)).toBe('2027-02-28');
    });
    it('teclas mueven el foco', () => {
        expect(moveFocus('2026-11-16', 'ArrowRight')).toBe('2026-11-17');
        expect(moveFocus('2026-11-30', 'ArrowRight')).toBe('2026-12-01');
        expect(moveFocus('2026-11-16', 'ArrowUp')).toBe('2026-11-09');
        expect(moveFocus('2026-11-16', 'ArrowDown')).toBe('2026-11-23');
        expect(moveFocus('2026-11-16', 'PageDown')).toBe('2026-12-16');
        expect(moveFocus('2026-11-16', 'PageUp', { shift: true })).toBe('2025-11-16');
        expect(moveFocus('2026-11-18', 'Home')).toBe('2026-11-15');
        expect(moveFocus('2026-11-18', 'End')).toBe('2026-11-21');
    });
    it('respeta min y max', () => {
        expect(isDayDisabled('2026-11-09', '2026-11-10', '2026-11-20')).toBe(true);
        expect(isDayDisabled('2026-11-21', '2026-11-10', '2026-11-20')).toBe(true);
        expect(isDayDisabled('2026-11-15', '2026-11-10', '2026-11-20')).toBe(false);
        expect(clampDay('2026-12-01', '2026-11-10', '2026-11-20')).toBe('2026-11-20');
        expect(moveFocus('2026-11-10', 'ArrowLeft', { min: '2026-11-10' })).toBe('2026-11-10');
        expect(monthGrid('2026-11-16', '2026-11-10')[0][0].disabled).toBe(true);
    });
    it('la semana empieza en domingo', () => {
        expect(startOfWeekKey('2026-11-16')).toBe('2026-11-15');
        expect(startOfWeekKey('2026-11-15')).toBe('2026-11-15');
        expect(startOfWeekKey('2026-11-21')).toBe('2026-11-15');
    });
    it('atajos de rango (lunes 16 nov 2026)', () => {
        const s = Object.fromEntries(rangeShortcuts('2026-11-16').map((x) => [x.id, [x.from, x.to]]));
        expect(s.today).toEqual(['2026-11-16', '2026-11-16']);
        expect(s.week).toEqual(['2026-11-15', '2026-11-21']);
        expect(s.lastWeek).toEqual(['2026-11-08', '2026-11-14']);
        expect(s.month).toEqual(['2026-11-01', '2026-11-30']);
        expect(s.lastMonth).toEqual(['2026-10-01', '2026-10-31']);
        expect(rangeShortcuts('2027-01-05').find((x) => x.id === 'lastMonth')).toMatchObject({ from: '2026-12-01', to: '2026-12-31' });
    });
    it('normaliza y valida rangos', () => {
        expect(normalizeRange('2026-11-20', '2026-11-10')).toEqual({ ok: true, from: '2026-11-10', to: '2026-11-20' });
        expect(daysInRange('2026-11-10', '2026-11-10')).toBe(1);
        expect(normalizeRange('2026-11-01', '2026-11-30', 31).ok).toBe(true);
        expect(normalizeRange('2026-11-01', '2026-12-05', 31).ok).toBe(false);
    });
});

describe('horas', () => {
    it('formato de 12 horas a medianoche y mediodía', () => {
        expect(formatTime12('00:00')).toBe('12:00 a. m.');
        expect(formatTime12('00:30')).toBe('12:30 a. m.');
        expect(formatTime12('12:00')).toBe('12:00 p. m.');
        expect(formatTime12('12:30')).toBe('12:30 p. m.');
        expect(formatTime12('13:05')).toBe('1:05 p. m.');
        expect(formatTime12('23:59')).toBe('11:59 p. m.');
        expect(formatTime12('x')).toBe('');
    });
    it('paso de 30 minutos por omisión', () => {
        const o = timeOptions();
        expect(o).toHaveLength(48);
        expect(o[0]).toEqual({ value: '00:00', label: '12:00 a. m.' });
        expect(o[1].value).toBe('00:30');
        expect(timeOptions(60)).toHaveLength(24);
        expect(timeOptions(15)).toHaveLength(96);
    });
    it('respeta min y max', () => {
        const o = timeOptions(30, '09:00', '10:30');
        expect(o.map((x) => x.value)).toEqual(['09:00', '09:30', '10:00', '10:30']);
    });
    it('conserva un valor fuera del paso y elige la opción más cercana', () => {
        const o = withValue(timeOptions(30, '09:00', '11:00'), '09:45');
        expect(o.map((x) => x.value)).toEqual(['09:00', '09:30', '09:45', '10:00', '10:30', '11:00']);
        expect(nearestOptionIndex(timeOptions(), '14:20')).toBe(29); // 14:30
        expect(nearestOptionIndex([], '14:20')).toBe(-1);
    });
});
