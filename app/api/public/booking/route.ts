import type { NextRequest } from 'next/server';
import { callBooking } from '@/lib/booking/db';
import { dbErrorResponse, json, serverError } from '@/lib/booking/http';
import {
    BOOKING_CANCEL_HOURS, BookingBody, bookingBusinessSlug, clientAddress, firstIssue, slotLabel, toBookingView,
} from '@/lib/booking/rules';

export const dynamic = 'force-dynamic';

/** Crea una reserva (sin cuenta). Devuelve el token del enlace de cancelación: solo se muestra esta vez. */
export async function POST(request: NextRequest) {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    if (!body || typeof body !== 'object' || Array.isArray(body)) return json({ error: 'Los datos de la reserva no son válidos.' }, 400);

    // Campo trampa: una persona nunca lo llena. Se responde como si se hubiera reservado, sin crear nada.
    if (typeof body.website === 'string' && body.website.trim() !== '') return honeypotResponse(body);

    const parsed = BookingBody.safeParse(body);
    if (!parsed.success) return json(firstIssue(parsed.error), 400);
    const input = parsed.data;
    try {
        const data = await callBooking('booking_create', {
            p_slug: bookingBusinessSlug(), p_service_id: input.service_id, p_barber_id: input.barber_id, p_date: input.date,
            p_time: input.time, p_name: input.name, p_phone: input.phone, p_accept_privacy: input.accept_privacy,
            p_client: clientAddress(request.headers),
        });
        if (data.error) return dbErrorResponse(data);
        const booking = toBookingView(data.booking as Parameters<typeof toBookingView>[0]);
        return json({ token: data.token, booking }, 201);
    } catch (error) { return serverError(error); }
}

function honeypotResponse(body: Record<string, unknown>) {
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => b.toString(16).padStart(2, '0')).join('');
    const time = typeof body.time === 'string' && /^([01]\d|2[0-3]):(00|30)$/.test(body.time) ? body.time : '12:00';
    const date = typeof body.date === 'string' ? body.date.slice(0, 10) : '';
    const start = Date.parse(`${date}T${time}:00-06:00`);
    return json({
        token,
        booking: {
            date, time, label: slotLabel(time), duration_minutes: 30,
            service: { name: '', price: 0, variable_price: false }, barber: { name: '' },
            customer_name: typeof body.name === 'string' ? body.name.slice(0, 80) : '', status: 'scheduled', can_cancel: true,
            cancel_until: new Date((Number.isFinite(start) ? start : Date.now()) - BOOKING_CANCEL_HOURS * 3_600_000).toISOString(),
        },
    }, 201);
}
