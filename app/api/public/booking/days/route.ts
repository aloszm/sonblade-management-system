import type { NextRequest } from 'next/server';
import { callBooking } from '@/lib/booking/db';
import { dbErrorResponse, json, serverError } from '@/lib/booking/http';
import { DaysQuery, bookingBusinessSlug, clientAddress, firstIssue } from '@/lib/booking/rules';

export const dynamic = 'force-dynamic';

/** Qué días del rango (máx. 31) tienen al menos una hora libre, para pintar el calendario. */
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const parsed = DaysQuery.safeParse({
        service_id: params.get('service_id') ?? '', barber_id: params.get('barber_id'),
        from: params.get('from') ?? '', to: params.get('to') ?? '',
    });
    if (!parsed.success) return json(firstIssue(parsed.error), 400);
    try {
        const data = await callBooking('booking_days', {
            p_slug: bookingBusinessSlug(), p_service_id: parsed.data.service_id, p_barber_id: parsed.data.barber_id ?? null,
            p_from: parsed.data.from, p_to: parsed.data.to, p_client: clientAddress(request.headers),
        });
        if (data.error) return dbErrorResponse(data);
        return json({ days: data.days ?? [] });
    } catch (error) { return serverError(error); }
}
