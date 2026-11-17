import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const callBooking = vi.fn();
vi.mock('@/lib/booking/db', () => ({ callBooking: (...args: unknown[]) => callBooking(...args) }));

import { GET as getConfig } from './config/route';
import { GET as getAvailability } from './availability/route';
import { GET as getDays } from './days/route';
import { POST as createBooking } from './route';
import { DELETE as cancelBooking, GET as getBooking } from './[token]/route';

const SERVICE = '6f29b406-6fa8-4c23-acd5-b2f404cce6ed';
const TOKEN = 'a'.repeat(64);
const RAW_BOOKING = {
    date: '2026-11-18', time: '13:30', duration_minutes: 30, service: { name: 'Barba', price: 120, variable_price: false },
    barber: { name: 'Deya' }, customer_name: 'Ana López', status: 'scheduled', cancel_until: '2026-11-18T17:30:00+00:00', can_cancel: true,
};
const body = { service_id: SERVICE, barber_id: null, date: '2026-11-18', time: '13:30', name: 'Ana López', phone: '55 1234 5678', accept_privacy: true, website: '' };

const req = (url: string, init?: ConstructorParameters<typeof NextRequest>[1]) => new NextRequest(new URL(url, 'http://localhost'), init);
const post = (data: unknown) => createBooking(req('/api/public/booking', {
    method: 'POST', body: JSON.stringify(data), headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.9, 10.0.0.1' },
}));
const tokenCtx = (token: string) => ({ params: Promise.resolve({ token }) });

beforeEach(() => callBooking.mockReset());

describe('config', () => {
    it('apagado → 200 { enabled: false } sin caché', async () => {
        callBooking.mockResolvedValue({ enabled: false });
        const res = await getConfig();
        expect(res.status).toBe(200);
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(await res.json()).toEqual({ enabled: false });
    });
    it('encendido → servicios ordenados con etiqueta y url del aviso', async () => {
        callBooking.mockResolvedValue({
            enabled: true, business: { name: 'Gallo 4:20', address: null, phone: null }, timezone: 'America/Mexico_City',
            today: '2026-11-17', min_date: '2026-11-17', max_date: '2026-12-17',
            services: [
                { id: 'b', name: 'Barba', category: 'barba', price: '120.00', variable_price: false, duration_minutes: 30, description: null },
                { id: 'c', name: 'Corte', category: 'cortes', price: 150, variable_price: false, duration_minutes: 30, description: null },
            ],
            barbers: [{ id: 'x', name: 'Deya' }], rules: { cancel_hours: 2, max_days_ahead: 30, lead_minutes: 60 }, privacy: { version: '2026-11-17' },
        });
        const json = await (await getConfig()).json();
        expect(json.services.map((s: { id: string }) => s.id)).toEqual(['c', 'b']);
        expect(json.services[1]).toMatchObject({ price: 120, category_label: 'Barba y afeitado' });
        expect(json.privacy).toEqual({ version: '2026-11-17', url: '/privacidad' });
    });
});

describe('availability y days', () => {
    it('valida la consulta antes de llamar la base', async () => {
        const res = await getAvailability(req(`/api/public/booking/availability?date=2026-02-30&service_id=${SERVICE}`));
        expect(res.status).toBe(400);
        expect(callBooking).not.toHaveBeenCalled();
    });
    it('agrega la etiqueta a cada hora y pasa el IP solo como dato para la huella', async () => {
        callBooking.mockResolvedValue({ date: '2026-11-18', closed: false, slots: [{ time: '13:30', barbers: [{ id: 'x', name: 'Deya' }] }] });
        const res = await getAvailability(req(`/api/public/booking/availability?date=2026-11-18&service_id=${SERVICE}`, { headers: { 'x-forwarded-for': '203.0.113.9' } }));
        expect(await res.json()).toEqual({ date: '2026-11-18', closed: false, slots: [{ time: '13:30', label: '1:30 p. m.', barbers: [{ id: 'x', name: 'Deya' }] }] });
        expect(callBooking).toHaveBeenCalledWith('booking_availability', expect.objectContaining({ p_barber_id: null, p_client: '203.0.113.9' }));
    });
    it('fecha fuera de ventana → 400; límite → 429 con Retry-After; apagado → 403', async () => {
        callBooking.mockResolvedValueOnce({ error: 'date_out_of_range' });
        expect((await getAvailability(req(`/api/public/booking/availability?date=2027-11-18&service_id=${SERVICE}`))).status).toBe(400);
        callBooking.mockResolvedValueOnce({ error: 'rate_limited', retry_after: 60 });
        const limited = await getDays(req(`/api/public/booking/days?service_id=${SERVICE}&from=2026-11-17&to=2026-11-30`));
        expect(limited.status).toBe(429);
        expect(limited.headers.get('Retry-After')).toBe('60');
        callBooking.mockResolvedValueOnce({ error: 'disabled' });
        expect((await getDays(req(`/api/public/booking/days?service_id=${SERVICE}&from=2026-11-17&to=2026-11-30`))).status).toBe(403);
    });
    it('days rechaza más de 31 días', async () => {
        expect((await getDays(req(`/api/public/booking/days?service_id=${SERVICE}&from=2026-11-01&to=2026-12-31`))).status).toBe(400);
    });
});

describe('POST reservar', () => {
    it('201 con token y reserva; manda teléfono normalizado y nombre limpio', async () => {
        callBooking.mockResolvedValue({ token: TOKEN, booking: RAW_BOOKING });
        const res = await post(body);
        expect(res.status).toBe(201);
        const json = await res.json();
        expect(json.token).toBe(TOKEN);
        expect(json.booking).toMatchObject({ label: '1:30 p. m.', status: 'scheduled', barber: { name: 'Deya' }, cancel_until: '2026-11-18T17:30:00.000Z' });
        expect(callBooking).toHaveBeenCalledWith('booking_create', expect.objectContaining({ p_phone: '5512345678', p_name: 'Ana López', p_client: '203.0.113.9' }));
    });
    it('campo trampa lleno → 201 falso sin llamar la base', async () => {
        const res = await post({ ...body, website: 'http://spam' });
        expect(res.status).toBe(201);
        expect((await res.json()).token).toMatch(/^[0-9a-f]{64}$/);
        expect(callBooking).not.toHaveBeenCalled();
    });
    it('400 con campo; sin aviso aceptado no llega a la base', async () => {
        const res = await post({ ...body, accept_privacy: false });
        expect(res.status).toBe(400);
        expect((await res.json()).field).toBe('accept_privacy');
        expect((await post({ ...body, phone: '123' })).status).toBe(400);
        expect((await post('nada')).status).toBe(400);
        expect(callBooking).not.toHaveBeenCalled();
    });
    it('409 slot_taken / too_many_active y 429', async () => {
        callBooking.mockResolvedValueOnce({ error: 'slot_taken' });
        const taken = await post(body);
        expect(taken.status).toBe(409);
        expect(await taken.json()).toEqual({ error: 'Esa hora ya no está disponible.', code: 'slot_taken' });
        callBooking.mockResolvedValueOnce({ error: 'too_many_active' });
        expect((await (await post(body)).json()).code).toBe('too_many_active');
        callBooking.mockResolvedValueOnce({ error: 'rate_limited', retry_after: 3600 });
        const limited = await post(body);
        expect(limited.status).toBe(429);
        expect(limited.headers.get('Retry-After')).toBe('3600');
    });
    it('falla de la base → 500 genérico', async () => {
        callBooking.mockRejectedValueOnce(new Error('boom'));
        vi.spyOn(console, 'error').mockImplementation(() => undefined);
        const res = await post(body);
        expect(res.status).toBe(500);
        expect((await res.json()).error).not.toContain('boom');
    });
});

describe('enlace de la reserva', () => {
    it('GET → 200 con can_cancel; token desconocido → 404 genérico', async () => {
        callBooking.mockResolvedValueOnce({ booking: RAW_BOOKING });
        const ok = await getBooking(req(`/api/public/booking/${TOKEN}`), tokenCtx(TOKEN));
        expect((await ok.json()).booking).toMatchObject({ can_cancel: true, label: '1:30 p. m.' });
        callBooking.mockResolvedValueOnce({ error: 'not_found' });
        const missing = await getBooking(req('/api/public/booking/x'), tokenCtx('x'));
        expect(missing.status).toBe(404);
        expect(callBooking).toHaveBeenLastCalledWith('booking_get', expect.objectContaining({ p_token: '' }));
    });
    it('DELETE → 200 cancelada; tarde → 409 too_late', async () => {
        callBooking.mockResolvedValueOnce({ booking: { ...RAW_BOOKING, status: 'cancelled', can_cancel: false } });
        const ok = await cancelBooking(req(`/api/public/booking/${TOKEN}`, { method: 'DELETE' }), tokenCtx(TOKEN));
        expect(ok.status).toBe(200);
        expect((await ok.json()).booking.status).toBe('cancelled');
        callBooking.mockResolvedValueOnce({ error: 'too_late' });
        const late = await cancelBooking(req(`/api/public/booking/${TOKEN}`, { method: 'DELETE' }), tokenCtx(TOKEN));
        expect(late.status).toBe(409);
        expect((await late.json()).code).toBe('too_late');
    });
});
