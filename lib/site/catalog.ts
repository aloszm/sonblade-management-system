import type { BookingBarber, BookingService } from '@/lib/booking-ui/types';

/** Lo que la página pública sabe de las reservas en línea de este momento. */
export type Catalog =
    | { state: 'on'; services: BookingService[]; barbers: BookingBarber[] }
    /** Reservas en línea apagadas en este entorno: sin catálogo público. */
    | { state: 'off' }
    /** La base no respondió: la página sigue con horario, ubicación y contacto. */
    | { state: 'error' };

interface LoadedConfig {
    enabled: boolean;
    services?: BookingService[];
    barbers?: BookingBarber[];
}

/**
 * Lee el catálogo con la misma función que usa la reserva pública (lib/booking/config.ts, inyectada para
 * poder probarla). Nunca lanza: si la lectura falla devuelve el estado `error`.
 */
export async function loadCatalog(load: () => Promise<LoadedConfig>): Promise<Catalog> {
    try {
        const config = await load();
        if (config.enabled !== true) return { state: 'off' };
        return { state: 'on', services: config.services ?? [], barbers: config.barbers ?? [] };
    } catch (error) {
        console.error('[inicio]', error instanceof Error ? error.message : error);
        return { state: 'error' };
    }
}
