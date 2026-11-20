import { loadBookingConfig } from '@/lib/booking/config';
import { json, serverError } from '@/lib/booking/http';

export const dynamic = 'force-dynamic';

/** Datos para armar la página de reservas. Si están apagadas: 200 { enabled: false }. */
export async function GET() {
    try {
        return json(await loadBookingConfig());
    } catch (error) { return serverError(error); }
}
