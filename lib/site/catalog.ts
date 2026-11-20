import 'server-only';

import type { BookingBarber, BookingService } from '@/lib/booking-ui/types';
import { callBooking } from '@/lib/booking/db';
import { bookingBusinessSlug, orderServices } from '@/lib/booking/rules';

/** Horario del negocio por día de la semana ("0" = domingo … "6" = sábado), horas "HH:MM" locales. */
export type BusinessHours = Partial<Record<string, { open: string; close: string }>>;

/** Barbero visible en la página pública: el mismo id y nombre que la reserva en línea, y su título visible si lo tiene. */
export type PublicBarber = BookingBarber & { title?: string | null };

/** Lo que la página pública sabe del catálogo en este momento. */
export type Catalog =
    | {
        state: 'on'; services: BookingService[]; barbers: PublicBarber[];
        /**
         * Reservas en línea encendidas. Con `false` el catálogo se muestra igual, pero sin "Reservar cita" ni
         * "Reservar con <nombre>". Ausente = encendidas (compatibilidad con la configuración de reservas).
         */
        bookingEnabled?: boolean;
        /** Horario del negocio (de la base) y su zona horaria, para calcular "abierto hoy". */
        hours?: BusinessHours;
        timezone?: string;
    }
    /** Sin catálogo público (negocio no encontrado, o la fuente dice que está apagada). */
    | { state: 'off' }
    /** La base no respondió: la página sigue con horario, ubicación y contacto. */
    | { state: 'error' };

export interface LoadedConfig {
    enabled: boolean;
    services?: BookingService[];
    barbers?: PublicBarber[];
    bookingEnabled?: boolean;
    hours?: BusinessHours;
    timezone?: string;
}

/**
 * Catálogo público con public.public_catalog (servidor, llave secreta): servicios, barberos y horario aunque las
 * reservas en línea estén apagadas. `enabled` = hay catálogo; `bookingEnabled` = se puede reservar en línea.
 * Lanza si la base falla.
 */
export async function loadPublicCatalog(): Promise<LoadedConfig> {
    const data = await callBooking('public_catalog', { p_slug: bookingBusinessSlug() });
    if (!Array.isArray(data.services)) return { enabled: false };
    return {
        enabled: true,
        bookingEnabled: data.booking_enabled === true,
        services: orderServices(data.services as Parameters<typeof orderServices>[0]),
        barbers: (Array.isArray(data.barbers) ? data.barbers : []) as PublicBarber[],
        hours: (data.hours ?? {}) as BusinessHours,
        timezone: typeof data.timezone === 'string' ? data.timezone : undefined,
    };
}

/**
 * Lee el catálogo con la función indicada (por omisión, el catálogo público independiente de las reservas;
 * inyectable para probarla). Nunca lanza: si la lectura falla devuelve el estado `error`.
 */
export async function loadCatalog(load: () => Promise<LoadedConfig> = loadPublicCatalog): Promise<Catalog> {
    try {
        const config = await load();
        if (config.enabled !== true) return { state: 'off' };
        const catalog: Catalog = { state: 'on', services: config.services ?? [], barbers: config.barbers ?? [] };
        if (config.bookingEnabled !== undefined) catalog.bookingEnabled = config.bookingEnabled;
        if (config.hours !== undefined) catalog.hours = config.hours;
        if (config.timezone !== undefined) catalog.timezone = config.timezone;
        return catalog;
    } catch (error) {
        console.error('[inicio]', error instanceof Error ? error.message : error);
        return { state: 'error' };
    }
}

/** ¿Ofrecer "Reservar cita" / "Reservar con <nombre>"? Solo con catálogo y reservas en línea encendidas. */
export function canBookOnline(catalog: Catalog): boolean {
    return catalog.state === 'on' && catalog.bookingEnabled !== false;
}

/** Horario de hoy (en la zona del negocio) o null si hoy no abre o no hay horario. */
export function hoursToday(catalog: Catalog, now: Date = new Date()): { open: string; close: string } | null {
    if (catalog.state !== 'on' || !catalog.hours) return null;
    let day: number;
    try {
        const weekday = new Intl.DateTimeFormat('en-US', { weekday: 'short', timeZone: catalog.timezone ?? 'America/Mexico_City' }).format(now);
        day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(weekday);
    } catch {
        return null;
    }
    return catalog.hours[String(day)] ?? null;
}
