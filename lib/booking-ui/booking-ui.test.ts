import { describe, expect, it } from 'vitest';
import { formatDuration, formatInstantInBusiness, formatPhone10, formatPrice, groupByCategory } from './format';
import { buildIcs, escapeIcsText, foldLine, localStamp } from './ics';
import { formatWait, mapApiError, parseRetryAfter } from './errors';
import { validateName, validatePhone } from './validation';
import { PRIVACY_SECTIONS } from './privacy';
import type { BookingService } from './types';

const svc = (id: string, category: string, label: string): BookingService =>
    ({ id, name: id, category, category_label: label, price: 100, variable_price: false, duration_minutes: 30, description: null });

describe('formato', () => {
    it('duración', () => {
        expect(formatDuration(30)).toBe('30 min');
        expect(formatDuration(60)).toBe('1 h');
        expect(formatDuration(90)).toBe('1 h 30 min');
        expect(formatDuration(120)).toBe('2 h');
    });
    it('precio', () => {
        expect(formatPrice(150)).toBe('$150');
        expect(formatPrice(150.5)).toBe('$150.50');
        expect(formatPrice(0, true)).toBe('Precio según diseño');
    });
    it('agrupa por categoría conservando el orden', () => {
        const g = groupByCategory([svc('a', 'cortes', 'Cortes'), svc('b', 'barba', 'Barba y afeitado'), svc('c', 'cortes', 'Cortes')]);
        expect(g.map((x) => [x.label, x.services.map((s) => s.id)])).toEqual([['Cortes', ['a', 'c']], ['Barba y afeitado', ['b']]]);
    });
    it('teléfono con espacios', () => expect(formatPhone10('5533098072')).toBe('55 3309 8072'));
    it('escribe el límite de cancelación en hora de la barbería', () => {
        // 2026-11-20T16:30:00Z son las 10:30 a. m. en Ciudad de México (UTC-6).
        expect(formatInstantInBusiness('2026-11-20T16:30:00.000Z')).toMatch(/viernes 20 de noviembre, 10:30 a\. ?m\./);
    });
});

describe('.ics', () => {
    it('usa la hora local de la barbería con TZID, sin corrimiento', () => {
        const ics = buildIcs({ uid: 'tok', date: '2026-11-20', time: '13:30', durationMinutes: 90, summary: 'Corte, barba', location: 'Efeso 2', now: new Date('2026-11-17T12:00:00Z') });
        expect(ics).toContain('DTSTART;TZID=America/Mexico_City:20261120T133000');
        expect(ics).toContain('DTEND;TZID=America/Mexico_City:20261120T150000');
        expect(ics).toContain('DTSTAMP:20261117T120000Z');
        expect(ics).toContain('SUMMARY:Corte\\, barba');
        expect(ics.endsWith('\r\n')).toBe(true);
        expect(ics.split('\r\n').every((l) => l.length <= 75)).toBe(true);
    });
    it('la hora de fin cruza medianoche y fin de mes', () => {
        expect(localStamp('2026-11-30', '23:30', 60)).toBe('20261201T003000');
    });
    it('escapa y dobla líneas', () => {
        expect(escapeIcsText('a;b\nc\\')).toBe('a\;b\\nc\\\\');
        expect(foldLine('x'.repeat(100)).split('\r\n')).toHaveLength(2);
    });
});

describe('validación', () => {
    it('nombre', () => {
        expect(validateName('  Juan   Pérez ')).toEqual({ ok: true, value: 'Juan Pérez' });
        expect(validateName('').ok).toBe(false);
        expect(validateName('J').ok).toBe(false);
        expect(validateName('1234').ok).toBe(false);
        expect(validateName('a'.repeat(81)).ok).toBe(false);
    });
    it('teléfono', () => {
        expect(validatePhone('55 3309-8072')).toEqual({ ok: true, value: '5533098072' });
        expect(validatePhone('+52 55 3309 8072')).toEqual({ ok: true, value: '5533098072' });
        expect(validatePhone('(55) 3309 8072')).toEqual({ ok: true, value: '5533098072' });
        expect(validatePhone('12345').ok).toBe(false);
        expect(validatePhone('').ok).toBe(false);
    });
});

describe('errores', () => {
    it('mapea cada código del contrato', () => {
        expect(mapApiError(409, { code: 'slot_taken' }).kind).toBe('slot_taken');
        expect(mapApiError(409, { code: 'too_many_active' }).kind).toBe('too_many_active');
        expect(mapApiError(409, { code: 'too_late' }).kind).toBe('too_late');
        expect(mapApiError(404, null).kind).toBe('not_found');
        expect(mapApiError(500, null).kind).toBe('server');
        const v = mapApiError(400, { error: 'Teléfono inválido', field: 'phone' });
        expect(v).toMatchObject({ kind: 'validation', field: 'phone', message: 'Teléfono inválido' });
    });
    it('429 dice cuánto esperar', () => {
        const e = mapApiError(429, null, '90');
        expect(e.kind).toBe('rate_limited');
        expect(e.retryAfter).toBe(90);
        expect(e.message).toContain('2 minutos');
        expect(formatWait(45)).toBe('45 segundos');
        expect(formatWait(1)).toBe('1 segundo');
        expect(parseRetryAfter('Wed, 18 Nov 2026 12:00:30 GMT', Date.parse('2026-11-18T12:00:00Z'))).toBe(30);
        expect(parseRetryAfter(null)).toBeUndefined();
    });
});

describe('aviso de privacidad', () => {
    it('no deja campos por completar a la vista', () => {
        for (const s of PRIVACY_SECTIONS) expect(`${s.title} ${s.body}`).not.toMatch(/POR COMPLETAR|\[|\]/);
    });
});
