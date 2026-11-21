import { describe, expect, it } from 'vitest';
import {
    addDays, appointmentSpan, bookingSlotError, cardDetail, dayKeyIn, durationOptions, formatClock, formatRange, gridRange,
    isAllowedDuration, minuteOfDay, nearestOption, reconcileTime, slotStarts, snapDuration, spanBox, startsOnSlot, timeOptions, visualSpan, weekDays,
} from './calendar-grid';
import { layoutLanes } from './appointments-view';
import { workingWindow, type ScheduleData } from './hours';

const MX = 'America/Mexico_City';
// Horario real: domingo y lunes 10:00-19:00; martes a sábado 12:30-20:00.
const schedule: ScheduleData = {
    timezone: MX,
    hours: { 0: { open: '10:00', close: '19:00' }, 1: { open: '10:00', close: '19:00' }, 2: { open: '12:30', close: '20:00' }, 3: { open: '12:30', close: '20:00' }, 4: { open: '12:30', close: '20:00' }, 5: { open: '12:30', close: '20:00' }, 6: { open: '12:30', close: '20:00' } },
    barbers: {},
};
const TUESDAY = '2026-11-17';
const SUNDAY = '2026-11-15';

describe('hora y día en la zona de la barbería', () => {
    it('las 8:00 pm de México siguen siendo el mismo día aunque en UTC ya sea el siguiente', () => {
        const instant = '2026-11-17T02:00:00.000Z'; // lunes 16, 8:00 pm en CDMX
        expect(dayKeyIn(instant, MX)).toBe('2026-11-16');
        expect(minuteOfDay(instant, MX)).toBe(20 * 60);
        expect(dayKeyIn(instant, 'UTC')).toBe('2026-11-17');
    });

    it('la medianoche de México es el inicio de su día (cambio de día)', () => {
        expect(dayKeyIn('2026-11-17T05:59:00.000Z', MX)).toBe('2026-11-16');
        expect(minuteOfDay('2026-11-17T05:59:00.000Z', MX)).toBe(23 * 60 + 59);
        expect(dayKeyIn('2026-11-17T06:00:00.000Z', MX)).toBe('2026-11-17');
        expect(minuteOfDay('2026-11-17T06:00:00.000Z', MX)).toBe(0);
    });

    it('sin zona usa el reloj del dispositivo', () => {
        const d = new Date(2026, 10, 16, 13, 17);
        expect(minuteOfDay(d)).toBe(13 * 60 + 17);
        expect(dayKeyIn(d)).toBe('2026-11-16');
    });
});

describe('bloques de 30 minutos', () => {
    it('solo acepta inicios en :00 y :30 de la hora de la barbería', () => {
        expect(startsOnSlot('2026-11-17T18:30:00.000Z', MX)).toBe(true); // 12:30
        expect(startsOnSlot('2026-11-17T19:00:00.000Z', MX)).toBe(true); // 13:00
        expect(startsOnSlot('2026-11-17T19:17:00.000Z', MX)).toBe(false); // 13:17
        expect(startsOnSlot('2026-11-17T19:15:00.000Z', MX)).toBe(false);
        expect(startsOnSlot('2026-11-17T19:00:30.000Z', MX)).toBe(false);
        expect(startsOnSlot('basura', MX)).toBe(false);
    });

    it('en una zona con media hora de diferencia el :00 de la barbería no es el :00 de UTC', () => {
        expect(startsOnSlot('2026-11-17T19:00:00.000Z', 'Asia/Kolkata')).toBe(true); // 00:30 del día siguiente
        expect(startsOnSlot('2026-11-17T19:15:00.000Z', 'Asia/Kolkata')).toBe(false);
    });

    it('duraciones: 30, 60, 90 y 120; no 45 ni 20', () => {
        for (const m of [30, 60, 90, 120]) expect(isAllowedDuration(m)).toBe(true);
        for (const m of [0, 15, 20, 45, 75, 30.5, -30]) expect(isAllowedDuration(m)).toBe(false);
    });

    it('explica en español por qué se rechaza una cita nueva', () => {
        expect(bookingSlotError('2026-11-17T19:00:00.000Z', 60, MX)).toBeNull();
        expect(bookingSlotError('2026-11-17T19:17:00.000Z', 30, MX)).toMatch(/en punto o y media/);
        expect(bookingSlotError('2026-11-17T19:00:00.000Z', 45, MX)).toMatch(/múltiplos de 30/);
    });
});

describe('posición de las tarjetas', () => {
    it('una cita a la hora de apertura (12:30) cae exactamente en su línea', () => {
        const window = workingWindow(schedule, TUESDAY)!;
        const range = gridRange(window);
        expect(range).toEqual({ start: 8 * 60, end: 22 * 60 }); // siempre de 8 a.m. a 10 p.m.
        const span = appointmentSpan('2026-11-17T18:30:00.000Z', '2026-11-17T19:00:00.000Z', MX);
        expect(span).toEqual({ start: 750, end: 780 });
        expect(spanBox(visualSpan(span), range.start, 48)).toEqual({ top: (750 - 480) / 30 * 48, height: 48 });
    });

    it('una cita que termina al cierre (20:00) no se sale de la cuadrícula', () => {
        const window = workingWindow(schedule, TUESDAY)!;
        const range = gridRange(window);
        const span = appointmentSpan('2026-11-18T01:00:00.000Z', '2026-11-18T02:00:00.000Z', MX); // 19:00-20:00
        const box = spanBox(visualSpan(span), range.start, 48);
        expect(box).toEqual({ top: (19 * 60 - 480) / 30 * 48, height: 96 });
        expect(box.top + box.height).toBeLessThanOrEqual(slotStarts(range).length * 48);
    });

    it('el domingo usa su propio horario (10:00 a 19:00)', () => {
        expect(gridRange(workingWindow(schedule, SUNDAY)!)).toEqual({ start: 8 * 60, end: 22 * 60 }); // el horario no recorta lo visible
    });

    it('el cobro sin cita de las 13:17 se dibuja de 13:00 a 14:00 y conserva su hora real', () => {
        const span = appointmentSpan('2026-11-16T19:17:00.000Z', '2026-11-16T19:47:00.000Z', MX); // 13:17-13:47
        expect(span).toEqual({ start: 13 * 60 + 17, end: 13 * 60 + 47 });
        expect(visualSpan(span)).toEqual({ start: 13 * 60, end: 14 * 60 });
        expect(formatRange(span)).toBe('1:17–1:47 p.m.');
    });

    it('una cita de 30 minutos siempre ocupa un bloque; una de 45 se redondea hacia arriba', () => {
        expect(visualSpan({ start: 780, end: 810 })).toEqual({ start: 780, end: 810 });
        expect(visualSpan({ start: 780, end: 780 })).toEqual({ start: 780, end: 810 });
        expect(visualSpan({ start: 780, end: 825 })).toEqual({ start: 780, end: 840 });
    });

    it('la cita de 120 minutos (VIP) mide cuatro bloques', () => {
        const visual = visualSpan(appointmentSpan('2026-11-16T18:00:00.000Z', '2026-11-16T20:00:00.000Z', MX)); // 12:00-14:00
        expect(spanBox(visual, 11 * 60 + 30, 48).height).toBe(4 * 48);
        expect(cardDetail(visual)).toEqual({ showService: true, showBarber: true });
        expect(cardDetail({ start: 0, end: 30 })).toEqual({ showService: false, showBarber: false });
    });

    it('una cita que cruza la medianoche termina a las 24:00 en la cuadrícula', () => {
        const span = appointmentSpan('2026-11-17T05:30:00.000Z', '2026-11-17T07:00:00.000Z', MX); // 23:30 → 01:00
        expect(span).toEqual({ start: 23 * 60 + 30, end: 24 * 60 });
        expect(visualSpan(span)).toEqual({ start: 1410, end: 1440 });
    });

    it('la cuadrícula se amplía para que no se pierda una cita fuera de horario', () => {
        const window = workingWindow(schedule, TUESDAY)!;
        const early = appointmentSpan('2026-11-17T13:00:00.000Z', '2026-11-17T13:30:00.000Z', MX); // 7:00
        const late = appointmentSpan('2026-11-18T03:17:00.000Z', null, MX); // 21:17 sin fin
        expect(gridRange(window, [early, late])).toEqual({ start: 7 * 60, end: 22 * 60 });
        expect(gridRange(window, [early])).toEqual({ start: 7 * 60, end: 22 * 60 });
        const after = appointmentSpan('2026-11-18T05:00:00.000Z', '2026-11-18T05:30:00.000Z', MX); // 23:00
        expect(gridRange(window, [after])).toEqual({ start: 8 * 60, end: 23 * 60 + 30 });
    });

    it('la constante VISIBLE_DAY_RANGE es 8 a.m.–10 p.m. y sin horario (o negocio cerrado) también muestra de 8 a.m. a 10 p.m.', () => {
        expect(gridRange(undefined)).toEqual({ start: 480, end: 1320 });
        expect(gridRange(null)).toEqual({ start: 480, end: 1320 });
        expect(slotStarts({ start: 720, end: 840 })).toEqual([720, 750, 780, 810]);
    });
});

describe('carriles de citas empalmadas', () => {
    const lanes = (items: { id: string; start: number; end: number }[]) => Object.fromEntries([...layoutLanes(items)].map(([id, v]) => [id, `${v.lane}/${v.lanes}`]));

    it('citas contiguas de 30 minutos no se empalman', () => {
        expect(lanes([{ id: 'a', start: 600, end: 630 }, { id: 'b', start: 630, end: 660 }, { id: 'c', start: 660, end: 690 }]))
            .toEqual({ a: '0/1', b: '0/1', c: '0/1' });
    });

    it('el cobro de las 13:17 (visualmente 13:00-14:00) queda al lado de la cita de las 13:00', () => {
        const walkIn = visualSpan({ start: 13 * 60 + 17, end: 13 * 60 + 47 });
        const booked = visualSpan({ start: 13 * 60, end: 13 * 60 + 30 });
        expect(lanes([{ id: 'cita', ...booked }, { id: 'cobro', ...walkIn }])).toEqual({ cobro: '0/2', cita: '1/2' });
    });

    it('empalme triple: tres carriles, y el que termina antes libera su carril', () => {
        expect(lanes([
            { id: 'a', start: 780, end: 840 }, // 13:00-14:00
            { id: 'b', start: 780, end: 810 }, // 13:00-13:30
            { id: 'c', start: 795, end: 840 }, // 13:15-14:00 (visual 13:00-14:00)
            { id: 'd', start: 810, end: 840 }, // 13:30-14:00
        ])).toEqual({ a: '0/3', b: '1/3', c: '2/3', d: '1/3' });
    });

    it('grupos separados no se estrechan entre sí', () => {
        expect(lanes([{ id: 'a', start: 600, end: 660 }, { id: 'b', start: 600, end: 630 }, { id: 'c', start: 720, end: 750 }]))
            .toEqual({ a: '0/2', b: '1/2', c: '0/1' });
    });
});

describe('opciones del formulario', () => {
    it('martes: de 12:30 p.m. a 7:30 p.m. para una cita de 30 min (termina al cierre)', () => {
        const options = timeOptions(workingWindow(schedule, TUESDAY), 30);
        expect(options[0]).toEqual({ value: '12:30', label: '12:30 p.m.' });
        expect(options[options.length - 1]).toEqual({ value: '19:30', label: '7:30 p.m.' });
        expect(options).toHaveLength(15);
    });

    it('una cita de 2 horas deja de ofrecer las horas en que ya no cabe', () => {
        const options = timeOptions(workingWindow(schedule, TUESDAY), 120);
        expect(options[options.length - 1].value).toBe('18:00');
    });

    it('todas las horas son :00 o :30 y el domingo abre a las 10', () => {
        const options = timeOptions(workingWindow(schedule, SUNDAY), 60);
        expect(options[0].value).toBe('10:00');
        expect(options.every((o) => /:(00|30)$/.test(o.value))).toBe(true);
        expect(options[options.length - 1].value).toBe('18:00');
    });

    it('un día cerrado no ofrece horas; sin horario configurado ofrece 8 a.m. a 10 p.m.', () => {
        expect(timeOptions(null, 30)).toEqual([]);
        const open = timeOptions(undefined, 30);
        expect(open[0].value).toBe('08:00');
        expect(open[open.length - 1].value).toBe('21:30');
    });

    it('una hora antigua (13:17) se conserva para no romper la cita al editarla', () => {
        const options = timeOptions(workingWindow(schedule, SUNDAY), 30, '13:17');
        expect(options.find((o) => o.value === '13:17')).toMatchObject({ legacy: true, label: '1:17 p.m. (hora actual)' });
        expect(options.map((o) => o.value)).toEqual([...options.map((o) => o.value)].sort());
    });

    it('al cambiar de duración se conserva la hora si sigue valiendo y si no se vacía', () => {
        const window = workingWindow(schedule, TUESDAY);
        expect(reconcileTime('19:00', timeOptions(window, 30))).toBe('19:00');
        expect(reconcileTime('19:00', timeOptions(window, 120))).toBe('');
        expect(nearestOption('12:00', timeOptions(window, 30))).toBe('12:30');
        expect(nearestOption('23:00', timeOptions(window, 30))).toBe('');
    });

    it('duración: solo 30, 60, 90 y 120; una de 45 se muestra y se ajusta hacia arriba', () => {
        expect(durationOptions().map((o) => o.value)).toEqual([30, 60, 90, 120]);
        expect(durationOptions().map((o) => o.label)).toEqual(['30 minutos', '1 hora', '1 hora 30 minutos', '2 horas']);
        const legacy = durationOptions(45);
        expect(legacy.map((o) => o.value)).toEqual([30, 45, 60, 90, 120]);
        expect(legacy.find((o) => o.value === 45)?.legacy).toBe(true);
        expect(snapDuration(45)).toBe(60);
        expect(snapDuration(30)).toBe(30);
        expect(snapDuration(10)).toBe(30);
        expect(snapDuration(200)).toBe(120);
    });
});

describe('texto de horas', () => {
    it('formatea con a.m./p.m. y sin ceros a la izquierda', () => {
        expect(formatClock(12 * 60)).toBe('12 p.m.');
        expect(formatClock(12 * 60 + 30)).toBe('12:30 p.m.');
        expect(formatClock(0)).toBe('12 a.m.');
        expect(formatClock(10 * 60)).toBe('10 a.m.');
        expect(formatRange({ start: 11 * 60 + 30, end: 12 * 60 })).toBe('11:30 a.m.–12 p.m.');
        expect(formatRange({ start: 19 * 60, end: 20 * 60 })).toBe('7–8 p.m.');
    });
});

describe('semana', () => {
    it('va de domingo a sábado', () => {
        expect(weekDays('2026-11-18')).toEqual(['2026-11-15', '2026-11-16', '2026-11-17', '2026-11-18', '2026-11-19', '2026-11-20', '2026-11-21']);
        expect(weekDays('2026-11-15')[0]).toBe('2026-11-15');
        expect(weekDays('2026-11-21')[6]).toBe('2026-11-21');
    });

    it('cruza de mes y de año sin perder días', () => {
        expect(addDays('2026-11-30', 1)).toBe('2026-12-01');
        expect(addDays('2026-01-01', -1)).toBe('2025-12-31');
        expect(weekDays('2026-12-31')).toEqual(['2026-12-27', '2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    });
});

// Auditoría del 21 nov 2026: la agenda abría en 8 a.m. aunque el negocio abriera a las 12:30 (día sin citas o
// visto fuera de horario), y había que bajar cuatro horas cerradas para llegar a la primera hora útil.
import { dayScrollTarget, weekScrollTarget } from './calendar-grid';

describe('a qué hora baja la agenda al abrirla', () => {
    const range = { start: 8 * 60, end: 22 * 60 };
    const weekday = { open: 12 * 60 + 30, close: 20 * 60 }; // martes a sábado: 12:30 p.m. a 8 p.m.
    const at = (h: number, m = 0) => h * 60 + m;

    it('otro día sin citas: la hora en que abre el negocio (en punto, para ver su rótulo), no las 8 a.m.', () => {
        expect(dayScrollTarget({ range, window: weekday })).toBe(at(12));
        expect(dayScrollTarget({ range, window: { open: at(10), close: at(19) } })).toBe(at(10)); // domingo y lunes
    });

    it('otro día con citas: la primera cita (como antes)', () => {
        expect(dayScrollTarget({ range, window: weekday, firstStart: at(17) })).toBe(at(17));
    });

    it('hoy antes de abrir (o de madrugada): la apertura; con una cita más temprano, esa cita', () => {
        expect(dayScrollTarget({ range, window: weekday, nowMinutes: at(9) })).toBe(at(12));
        expect(dayScrollTarget({ range, window: weekday, nowMinutes: at(2, 48) })).toBe(at(12)); // fuera de la cuadrícula
        expect(dayScrollTarget({ range, window: weekday, nowMinutes: at(9), firstStart: at(13) })).toBe(at(12));
        expect(dayScrollTarget({ range, window: weekday, nowMinutes: at(9), firstStart: at(11) })).toBe(at(11));
    });

    it('hoy con el negocio abierto: la hora actual, medio bloque arriba', () => {
        expect(dayScrollTarget({ range, window: weekday, nowMinutes: at(15, 10), firstStart: at(12, 30) })).toBe(at(14, 40));
    });

    it('hoy después de cerrar: vuelve al inicio del día de trabajo (primera cita o apertura)', () => {
        expect(dayScrollTarget({ range, window: weekday, nowMinutes: at(21), firstStart: at(13) })).toBe(at(13));
        expect(dayScrollTarget({ range, window: weekday, nowMinutes: at(21) })).toBe(at(12));
    });

    it('día cerrado o sin horario cargado: se conserva lo de antes', () => {
        expect(dayScrollTarget({ range, window: null })).toBe(at(8));
        expect(dayScrollTarget({ range })).toBe(at(8));
        expect(dayScrollTarget({ range, window: null, firstStart: at(16) })).toBe(at(16));
        expect(dayScrollTarget({ range, nowMinutes: at(15) })).toBe(at(14, 30));
    });

    it('nunca sale de la cuadrícula', () => {
        expect(dayScrollTarget({ range, window: { open: at(6), close: at(23) } })).toBe(at(8));
        expect(dayScrollTarget({ range, window: weekday, firstStart: at(23) })).toBe(at(21, 30));
    });

    it('semana sin citas: la apertura más temprana de la semana (medio bloque arriba), no las 8 a.m.', () => {
        expect(weekScrollTarget({ range, earliestOpen: at(10) })).toBe(at(9, 30));
        expect(weekScrollTarget({ range, earliestOpen: at(12, 30), firstStart: at(11) })).toBe(at(10, 30));
        expect(weekScrollTarget({ range })).toBe(at(8));
    });

    it('semana que incluye hoy: la hora actual si ya es hora de abrir; si es de madrugada, la apertura', () => {
        expect(weekScrollTarget({ range, nowMinutes: at(15), todayOpen: at(12, 30), earliestOpen: at(10) })).toBe(at(14));
        expect(weekScrollTarget({ range, nowMinutes: at(8, 30), todayOpen: at(12, 30), earliestOpen: at(10) })).toBe(at(9, 30));
        expect(weekScrollTarget({ range, nowMinutes: at(2, 48), todayOpen: at(12, 30), earliestOpen: at(10) })).toBe(at(9, 30));
    });
});
