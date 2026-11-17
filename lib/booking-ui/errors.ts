export type BookingErrorKind =
    | 'slot_taken' | 'too_many_active' | 'rate_limited' | 'too_late' | 'not_found' | 'validation' | 'offline' | 'server';

export interface BookingError {
    kind: BookingErrorKind;
    message: string;
    field?: string;
    /** Segundos de espera cuando el servidor pide esperar (429). */
    retryAfter?: number;
}

/** '45 segundos', '1 minuto', '3 minutos'. */
export function formatWait(seconds: number): string {
    const s = Math.max(1, Math.ceil(seconds));
    if (s < 60) return `${s} ${s === 1 ? 'segundo' : 'segundos'}`;
    const m = Math.ceil(s / 60);
    return `${m} ${m === 1 ? 'minuto' : 'minutos'}`;
}

/** Retry-After puede venir en segundos o como fecha HTTP. */
export function parseRetryAfter(value: string | null | undefined, now = Date.now()): number | undefined {
    if (!value) return undefined;
    const n = Number(value);
    if (Number.isFinite(n)) return n > 0 ? n : undefined;
    const t = Date.parse(value);
    return Number.isNaN(t) ? undefined : Math.max(1, Math.ceil((t - now) / 1000));
}

export const OFFLINE_ERROR: BookingError = {
    kind: 'offline',
    message: 'No hay conexión. Revisa tu internet e inténtalo de nuevo.',
};

/** Convierte una respuesta de error de la API en un mensaje claro para la pantalla. */
export function mapApiError(status: number, body: { error?: string; code?: string; field?: string } | null, retryAfterHeader?: string | null): BookingError {
    const code = body?.code;
    if (status === 409 && code === 'slot_taken') {
        return { kind: 'slot_taken', message: 'Esa hora ya la tomaron. Elige otra; ya actualizamos los horarios.' };
    }
    if (status === 409 && code === 'too_many_active') {
        return { kind: 'too_many_active', message: 'Ya tienes varias reservas activas con ese teléfono. Cancela una o llámanos para agendar.' };
    }
    if (status === 409 && code === 'too_late') {
        return { kind: 'too_late', message: 'Ya no se puede cancelar desde aquí. Llámanos y lo vemos.' };
    }
    if (status === 429) {
        const retryAfter = parseRetryAfter(retryAfterHeader);
        return {
            kind: 'rate_limited', retryAfter,
            message: retryAfter ? `Hiciste muchos intentos seguidos. Espera ${formatWait(retryAfter)} e inténtalo de nuevo.` : 'Hiciste muchos intentos seguidos. Espera un momento e inténtalo de nuevo.',
        };
    }
    if (status === 404) return { kind: 'not_found', message: 'No encontramos esa reserva.' };
    if (status === 400) {
        return { kind: 'validation', field: body?.field, message: body?.error || 'Revisa los datos e inténtalo de nuevo.' };
    }
    return { kind: 'server', message: 'Algo salió mal de nuestro lado. Inténtalo de nuevo en un momento o llámanos.' };
}
