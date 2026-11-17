import type { NextRequest } from 'next/server';
import { callBooking } from '@/lib/booking/db';
import { dbErrorResponse, json, serverError } from '@/lib/booking/http';
import { TOKEN_RE, bookingBusinessSlug, toBookingView } from '@/lib/booking/rules';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ token: string }> };

const NOT_FOUND = { error: 'No encontramos esa reserva.' };

async function handle(fn: 'booking_get' | 'booking_cancel', context: Context) {
    const { token } = await context.params;
    try {
        // Un token mal formado se consulta igual: la respuesta (403 si están apagadas, 404 si no existe) no cambia.
        const data = await callBooking(fn, { p_slug: bookingBusinessSlug(), p_token: TOKEN_RE.test(token) ? token : '' });
        if (data.error) return data.error === 'not_found' ? json(NOT_FOUND, 404) : dbErrorResponse(data);
        return json({ booking: toBookingView(data.booking as Parameters<typeof toBookingView>[0]) });
    } catch (error) { return serverError(error); }
}

/** Ver una reserva con el enlace que recibió el cliente. */
export async function GET(_request: NextRequest, context: Context) {
    return handle('booking_get', context);
}

/** Cancelar la reserva (hasta cancel_hours antes). */
export async function DELETE(_request: NextRequest, context: Context) {
    return handle('booking_cancel', context);
}
