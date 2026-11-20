import 'server-only';

import { callBooking } from '@/lib/booking/db';
import { PRIVACY_URL, bookingBusinessSlug, orderServices } from '@/lib/booking/rules';

/** Respuesta de la configuración pública: apagada, o encendida con el catálogo y los barberos. */
export type PublicBookingConfig =
    | { enabled: false }
    | {
        enabled: true;
        business: { name: string; address: string; phone: string };
        timezone: string; today: string; min_date: string; max_date: string;
        services: ReturnType<typeof orderServices>;
        barbers: Array<{ id: string; name: string }>;
        rules: { cancel_hours: number; max_days_ahead: number; lead_minutes: number };
        privacy: { version: string; url: string };
    };

/**
 * Configuración pública de reservas: la usan la ruta /api/public/booking/config y la página de inicio
 * (una sola fuente). Si están apagadas devuelve { enabled: false }. Lanza si la base falla.
 */
export async function loadBookingConfig(): Promise<PublicBookingConfig> {
    const data = await callBooking('booking_config', { p_slug: bookingBusinessSlug() });
    if (data.enabled !== true) return { enabled: false };
    const privacy = (data.privacy ?? {}) as { version?: string };
    return {
        enabled: true,
        business: data.business as { name: string; address: string; phone: string },
        timezone: data.timezone as string,
        today: data.today as string,
        min_date: data.min_date as string,
        max_date: data.max_date as string,
        services: orderServices((data.services ?? []) as Parameters<typeof orderServices>[0]),
        barbers: (data.barbers ?? []) as Array<{ id: string; name: string }>,
        rules: data.rules as { cancel_hours: number; max_days_ahead: number; lead_minutes: number },
        privacy: { version: privacy.version ?? '', url: PRIVACY_URL },
    };
}
