import type { NextRequest } from 'next/server';
import { callBooking } from '@/lib/booking/db';
import { dbErrorResponse, json, serverError } from '@/lib/booking/http';
import { AvailabilityQuery, bookingBusinessSlug, clientAddress, firstIssue, slotLabel } from '@/lib/booking/rules';

export const dynamic = 'force-dynamic';

type Slot = { time: string; barbers: Array<{ id: string; name: string }> };

/** Horas libres de un día para un servicio; con barber_id, solo las de ese barbero. */
export async function GET(request: NextRequest) {
    const params = request.nextUrl.searchParams;
    const parsed = AvailabilityQuery.safeParse({
        date: params.get('date') ?? '', service_id: params.get('service_id') ?? '', barber_id: params.get('barber_id'),
    });
    if (!parsed.success) return json(firstIssue(parsed.error), 400);
    try {
        const data = await callBooking('booking_availability', {
            p_slug: bookingBusinessSlug(), p_service_id: parsed.data.service_id, p_date: parsed.data.date,
            p_barber_id: parsed.data.barber_id ?? null, p_client: clientAddress(request.headers),
        });
        if (data.error) return dbErrorResponse(data);
        const slots = ((data.slots ?? []) as Slot[]).map((s) => ({ time: s.time, label: slotLabel(s.time), barbers: s.barbers }));
        return json({ date: data.date, closed: Boolean(data.closed), slots });
    } catch (error) { return serverError(error); }
}
