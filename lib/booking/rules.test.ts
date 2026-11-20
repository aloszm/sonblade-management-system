import { describe, expect, it } from 'vitest';
import {
    AvailabilityQuery, BookingBody, DaysQuery, bookingErrorResponse, cleanName, clientAddress, daysBetween, firstIssue,
    isDateKey, isWithinWindow, normalizePhone, orderServices, slotLabel, toBookingView,
} from './rules';

const SERVICE = '6f29b406-6fa8-4c23-acd5-b2f404cce6ed';
const BARBER = '265d3ef7-22ce-41d3-82e4-5de43f3a8dd3';
const valid = { service_id: SERVICE, barber_id: null, date: '2026-11-18', time: '13:30', name: '  Ana   López ', phone: '55 1234 5678', accept_privacy: true, website: '' };

describe('normalizePhone', () => {
    it('acepta 10 dígitos con separadores y prefijos de México', () => {
        expect(normalizePhone('55 1234 5678')).toBe('5512345678');
        expect(normalizePhone('(55) 1234-5678')).toBe('5512345678');
        expect(normalizePhone('+52 55 1234 5678')).toBe('5512345678');
        expect(normalizePhone('+521 55 1234 5678')).toBe('5512345678');
        expect(normalizePhone('52.55.1234.5678')).toBe('5512345678');
    });
    it('rechaza longitudes, letras y ceros iniciales', () => {
        for (const bad of ['12345', '551234567', '55123456789', '0512345678', '55-ABCD-5678', '', '+1 555 123 4567', 'x'.repeat(40)]) {
            expect(normalizePhone(bad)).toBeNull();
        }
        expect(normalizePhone(5512345678)).toBeNull();
    });
});

describe('cleanName', () => {
    it('recorta y junta espacios', () => {
        expect(cleanName('  Ana   López ')).toBe('Ana López');
        expect(cleanName('José Ñúñez')).toBe('José Ñúñez');
    });
    it('rechaza HTML, controles, muy cortos o muy largos, y sin letras', () => {
        expect(cleanName('<script>alert(1)</script>')).toBeNull();
        expect(cleanName('Ana <b>')).toBeNull();
        expect(cleanName('Ana\u0000')).toBeNull();
        expect(cleanName('A')).toBeNull();
        expect(cleanName(' a ')).toBeNull();
        expect(cleanName('a'.repeat(81))).toBeNull();
        expect(cleanName('a'.repeat(80))).toBe('a'.repeat(80));
        expect(cleanName('12345')).toBeNull();
        expect(cleanName(null)).toBeNull();
    });
});

describe('fechas y ventana', () => {
    it('isDateKey valida el calendario', () => {
        expect(isDateKey('2026-11-18')).toBe(true);
        expect(isDateKey('2026-02-29')).toBe(false);
        expect(isDateKey('2028-02-29')).toBe(true);
        expect(isDateKey('2026-13-01')).toBe(false);
        expect(isDateKey('2026-1-01')).toBe(false);
        expect(isDateKey('2026-11-18T00:00')).toBe(false);
    });
    it('daysBetween e isWithinWindow', () => {
        expect(daysBetween('2026-11-17', '2026-12-17')).toBe(30);
        expect(isWithinWindow('2026-11-17', '2026-11-17', '2026-12-17')).toBe(true);
        expect(isWithinWindow('2026-12-17', '2026-11-17', '2026-12-17')).toBe(true);
        expect(isWithinWindow('2026-12-18', '2026-11-17', '2026-12-17')).toBe(false);
        expect(isWithinWindow('2026-11-16', '2026-11-17', '2026-12-17')).toBe(false);
    });
});

describe('slotLabel', () => {
    it('hora de 12 horas con "a. m." / "p. m."', () => {
        expect(slotLabel('13:30')).toBe('1:30 p. m.');
        expect(slotLabel('09:00')).toBe('9:00 a. m.');
        expect(slotLabel('12:00')).toBe('12:00 p. m.');
        expect(slotLabel('00:30')).toBe('12:30 a. m.');
    });
});

describe('BookingBody', () => {
    it('normaliza nombre y teléfono, y barber_id ausente = null', () => {
        const parsed = BookingBody.parse({ ...valid, barber_id: undefined });
        expect(parsed).toMatchObject({ name: 'Ana López', phone: '5512345678', barber_id: null, accept_privacy: true });
        expect(BookingBody.parse({ ...valid, barber_id: BARBER }).barber_id).toBe(BARBER);
    });
    it('señala el campo con error y mensaje con punto final', () => {
        const cases: Array<[Record<string, unknown>, string]> = [
            [{ phone: '123' }, 'phone'], [{ phone: '0000000000' }, 'phone'], [{ phone: '5555555555' }, 'phone'], [{ name: '<b>x</b>' }, 'name'], [{ accept_privacy: false }, 'accept_privacy'],
            [{ time: '13:15' }, 'time'], [{ time: '24:00' }, 'time'], [{ date: '2026-02-30' }, 'date'], [{ service_id: 'x' }, 'service_id'],
        ];
        for (const [patch, field] of cases) {
            const result = BookingBody.safeParse({ ...valid, ...patch });
            expect(result.success).toBe(false);
            if (!result.success) {
                const issue = firstIssue(result.error);
                expect(issue.field).toBe(field);
                expect(issue.error).toMatch(/\.$/);
            }
        }
    });
});

describe('consultas', () => {
    it('AvailabilityQuery: barber_id vacío o nulo es opcional', () => {
        expect(AvailabilityQuery.parse({ date: '2026-11-18', service_id: SERVICE, barber_id: null }).barber_id).toBeUndefined();
        expect(AvailabilityQuery.safeParse({ date: '2026-11-18', service_id: SERVICE, barber_id: 'nope' }).success).toBe(false);
    });
    it('DaysQuery: máximo 31 días y from <= to', () => {
        expect(DaysQuery.safeParse({ service_id: SERVICE, from: '2026-11-17', to: '2026-12-17' }).success).toBe(true);
        expect(DaysQuery.safeParse({ service_id: SERVICE, from: '2026-11-17', to: '2026-12-18' }).success).toBe(false);
        expect(DaysQuery.safeParse({ service_id: SERVICE, from: '2026-11-18', to: '2026-11-17' }).success).toBe(false);
    });
});

describe('clientAddress', () => {
    it('toma el primer IP de x-forwarded-for', () => {
        expect(clientAddress(new Headers({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }))).toBe('203.0.113.9');
        expect(clientAddress(new Headers({ 'x-real-ip': '198.51.100.2' }))).toBe('198.51.100.2');
        expect(clientAddress(new Headers())).toBe('unknown');
    });
});

describe('bookingErrorResponse', () => {
    it('traduce los códigos de la base al contrato', () => {
        expect(bookingErrorResponse('slot_taken')).toMatchObject({ status: 409, body: { error: 'Esa hora ya no está disponible.', code: 'slot_taken' } });
        expect(bookingErrorResponse('too_many_active')).toMatchObject({ status: 409, body: { code: 'too_many_active' } });
        expect(bookingErrorResponse('too_late')).toMatchObject({ status: 409, body: { code: 'too_late' } });
        expect(bookingErrorResponse('rate_limited', 3600)).toMatchObject({ status: 429, retryAfter: 3600 });
        expect(bookingErrorResponse('disabled').status).toBe(403);
        expect(bookingErrorResponse('not_found').status).toBe(404);
        expect(bookingErrorResponse('date_out_of_range')).toMatchObject({ status: 400, body: { field: 'date' } });
        expect(bookingErrorResponse('???').status).toBe(500);
        for (const code of ['slot_taken', 'too_many_active', 'too_late', 'rate_limited', 'disabled', 'not_found', 'invalid_phone', 'invalid_name']) {
            expect(String(bookingErrorResponse(code).body.error)).toMatch(/\.$/);
        }
    });
});

describe('orderServices y toBookingView', () => {
    it('ordena por categoría del catálogo conservando sort_order y agrega la etiqueta', () => {
        const base = { variable_price: false, duration_minutes: 30, description: null };
        const out = orderServices([
            { ...base, id: '1', name: 'Barba', category: 'barba', price: '120.00' },
            { ...base, id: '2', name: 'Corte', category: 'cortes', price: 150 },
            { ...base, id: '3', name: 'VIP', category: 'paquetes', price: 400 },
            { ...base, id: '4', name: 'Bigote', category: 'barba', price: 60 },
        ]);
        expect(out.map((s) => s.id)).toEqual(['2', '1', '4', '3']);
        expect(out[1]).toMatchObject({ price: 120, category_label: 'Barba y afeitado' });
    });
    it('toBookingView agrega la etiqueta y normaliza precio y fecha', () => {
        const view = toBookingView({
            date: '2026-11-18', time: '12:30', duration_minutes: 60, service: { name: 'Corte y barba', price: '250.00', variable_price: false },
            barber: { name: 'Deya' }, customer_name: 'Ana', status: 'scheduled', cancel_until: '2026-11-18T16:30:00+00:00', can_cancel: true,
        });
        expect(view).toMatchObject({ label: '12:30 p. m.', service: { price: 250 }, cancel_until: '2026-11-18T16:30:00.000Z', can_cancel: true });
    });
});
