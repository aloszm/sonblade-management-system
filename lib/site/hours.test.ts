import { describe, expect, it } from 'vitest';
import { atTime, blocksFromBusinessHours, businessClock, daysLabel, hoursForDay, pageHours, todayStatus } from './hours';
import { hoursToday, type Catalog } from './catalog';
import type { DayHours } from './content';

// La Ciudad de México está en UTC-6 todo el año (sin horario de verano desde 2022).
const cdmx = (isoLocal: string) => new Date(`${isoLocal}-06:00`);

describe('reloj de la barbería', () => {
    it('usa la zona de la barbería, no la del servidor (UTC)', () => {
        // Sábado 01:30 en UTC = viernes 19:30 en CDMX.
        expect(businessClock(new Date('2026-11-21T01:30:00Z'))).toEqual({ day: 5, minutes: 19 * 60 + 30 });
    });
    it('"a las" y "a la 1:00"', () => {
        expect(atTime('12:30')).toBe('a las 12:30 p. m.');
        expect(atTime('13:00')).toBe('a la 1:00 p. m.');
        expect(atTime('01:00')).toBe('a la 1:00 a. m.');
    });
    it('cada día cae en su bloque de horario', () => {
        expect(hoursForDay(0)?.label).toBe('Domingo y lunes');
        expect(hoursForDay(1)?.label).toBe('Domingo y lunes');
        for (const d of [2, 3, 4, 5, 6]) expect(hoursForDay(d)?.label).toBe('Martes a sábado');
    });
});

describe('abierto hoy', () => {
    it('martes antes de abrir: dice a qué hora abre y cierra', () => {
        const s = todayStatus(cdmx('2026-11-17T10:00:00')); // martes
        expect(s.state).toBe('before');
        expect(s.label).toBe('Aún no abrimos');
        expect(s.text).toBe('Hoy abrimos a las 12:30 p. m. y cerramos a las 8:00 p. m.');
    });
    it('martes abierto (justo a la hora de abrir)', () => {
        const s = todayStatus(cdmx('2026-11-17T12:30:00'));
        expect(s.state).toBe('open');
        expect(s.text).toBe('Abierto hoy de 12:30 p. m. a 8:00 p. m.');
    });
    it('viernes 19:30 en CDMX sigue abierto aunque en UTC ya sea sábado', () => {
        expect(todayStatus(new Date('2026-11-21T01:30:00Z'))).toMatchObject({ day: 5, state: 'open' });
    });
    it('sábado ya cerrado: mañana (domingo) abre a las 10:00 a. m.', () => {
        const s = todayStatus(cdmx('2026-11-21T20:00:00')); // sábado, justo a la hora de cerrar
        expect(s.state).toBe('after');
        expect(s.label).toBe('Ya cerramos por hoy');
        expect(s.text).toBe('Hoy ya cerramos. Mañana abrimos a las 10:00 a. m.');
    });
    it('domingo abierto, con el horario de domingo y lunes', () => {
        const s = todayStatus(cdmx('2026-11-22T11:00:00'));
        expect(s).toMatchObject({ day: 0, state: 'open', text: 'Abierto hoy de 10:00 a. m. a 7:00 p. m.' });
        expect(s.block?.label).toBe('Domingo y lunes');
    });
    it('lunes ya cerrado: mañana (martes) abre a las 12:30 p. m.', () => {
        const s = todayStatus(cdmx('2026-11-23T19:30:00'));
        expect(s).toMatchObject({ day: 1, state: 'after', text: 'Hoy ya cerramos. Mañana abrimos a las 12:30 p. m.' });
    });
    it('un día sin horario: lo dice y anuncia la próxima apertura', () => {
        const hours: DayHours[] = [{ label: 'Martes a sábado', days: [2, 3, 4, 5, 6], open: '13:00', close: '20:00' }];
        const s = todayStatus(cdmx('2026-11-22T11:00:00'), hours); // domingo
        expect(s).toMatchObject({ state: 'closed', block: null, label: 'Hoy no abrimos', text: 'Hoy no abrimos. El martes abrimos a la 1:00 p. m.' });
    });
});

describe('horario de la base', () => {
    const real = { '0': { open: '10:00', close: '19:00' }, '1': { open: '10:00', close: '19:00' }, '2': { open: '12:30', close: '20:00' }, '3': { open: '12:30', close: '20:00' }, '4': { open: '12:30', close: '20:00' }, '5': { open: '12:30', close: '20:00' }, '6': { open: '12:30', close: '20:00' } };
    it('agrupa días con la misma hora y los nombra', () => {
        expect(blocksFromBusinessHours(real)).toEqual([
            { label: 'Domingo y lunes', days: [0, 1], open: '10:00', close: '19:00' },
            { label: 'Martes a sábado', days: [2, 3, 4, 5, 6], open: '12:30', close: '20:00' },
        ]);
        expect(daysLabel([1, 3, 5])).toBe('Lunes, miércoles y viernes');
        expect(daysLabel([4])).toBe('Jueves');
        expect(blocksFromBusinessHours({ '1': { open: 'x', close: '20:00' } })).toEqual([]);
    });
    it('el bloque de hoy coincide con hoursToday(); sin horario de la base se usa el del sitio', () => {
        const catalog: Catalog = { state: 'on', services: [], barbers: [], hours: real, timezone: 'America/Mexico_City' };
        for (const iso of ['2026-11-22T18:00:00Z', '2026-11-25T18:00:00Z', '2026-11-21T03:00:00Z']) {
            const now = new Date(iso);
            const { status, fromDatabase } = pageHours(catalog, now);
            expect(fromDatabase).toBe(true);
            expect(hoursToday(catalog, now)).toEqual({ open: status.block!.open, close: status.block!.close });
        }
        expect(pageHours({ state: 'error' }, new Date()).fromDatabase).toBe(false);
        expect(pageHours({ state: 'error' }, new Date()).blocks.map((b) => b.label)).toEqual(['Domingo y lunes', 'Martes a sábado']);
    });
});
