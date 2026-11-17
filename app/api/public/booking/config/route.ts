import { callBooking } from '@/lib/booking/db';
import { json, serverError } from '@/lib/booking/http';
import { PRIVACY_URL, bookingBusinessSlug, orderServices } from '@/lib/booking/rules';

export const dynamic = 'force-dynamic';

/** Datos para armar la página de reservas. Si están apagadas: 200 { enabled: false }. */
export async function GET() {
    try {
        const data = await callBooking('booking_config', { p_slug: bookingBusinessSlug() });
        if (data.enabled !== true) return json({ enabled: false });
        const privacy = (data.privacy ?? {}) as { version?: string };
        return json({
            enabled: true,
            business: data.business,
            timezone: data.timezone,
            today: data.today,
            min_date: data.min_date,
            max_date: data.max_date,
            services: orderServices((data.services ?? []) as Parameters<typeof orderServices>[0]),
            barbers: data.barbers ?? [],
            rules: data.rules,
            privacy: { version: privacy.version ?? '', url: PRIVACY_URL },
        });
    } catch (error) { return serverError(error); }
}
