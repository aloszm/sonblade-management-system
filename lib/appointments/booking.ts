// Cálculos y mensajes del formulario de citas (Nueva cita y Reprogramar).
import { HttpError, toUserMessage } from '@/lib/utils/errors';

/** Servicio tal como lo entrega /api/services (solo lo que usa la agenda). */
export interface ServiceOption {
    id: string;
    name: string;
    price: number | string;
    duration_minutes: number | null;
    category?: string | null;
    sort_order?: number | null;
    is_active?: boolean;
    variable_price?: boolean;
}

const SLOT = 30;

/** Misma regla que la base: la suma de duraciones se redondea hacia arriba a bloques de 30 minutos (mínimo 30). */
export function roundToSlot(minutes: number): number {
    return Math.max(SLOT, Math.ceil(minutes / SLOT) * SLOT);
}

export interface ServicesSummary { minutes: number; price: number; hasVariablePrice: boolean; count: number }

/** Duración total (en bloques de 30 min) y precio estimado de los servicios elegidos. */
export function summarizeServices(selected: readonly ServiceOption[]): ServicesSummary {
    const raw = selected.reduce((sum, s) => sum + (Number(s.duration_minutes) || SLOT), 0);
    return {
        minutes: selected.length ? roundToSlot(raw) : 0,
        price: selected.reduce((sum, s) => sum + (Number(s.price) || 0), 0),
        hasVariablePrice: selected.some((s) => s.variable_price),
        count: selected.length,
    };
}

/** Texto de los servicios de una cita ("Corte + Barba"); si no tiene, su nota. */
export function servicesText(appointment: { services?: { name: string }[]; notes?: string | null }): string {
    const names = (appointment.services ?? []).map((s) => s.name).filter(Boolean);
    return names.length ? names.join(' + ') : appointment.notes ?? '';
}

/**
 * Mensaje claro para quien agenda cuando la base rechaza guardar o reprogramar una cita.
 * La base responde 409 en estos casos y su texto (en español) dice cuál es; aquí se reconoce cada uno.
 */
export function saveErrorMessage(err: unknown, fallback = 'No se pudo guardar la cita.'): string {
    if (err instanceof HttpError) {
        const text = err.serverMessage ?? '';
        if (err.status === 409) {
            if (/ya se cobr/i.test(text)) return 'Esa cita ya se cobró, así que no se puede reprogramar.';
            if (/cerrada|cancelada/i.test(text)) return 'Esa cita ya está cerrada o cancelada, así que no se puede reprogramar.';
            if (/ya tiene una cita/i.test(text)) return 'Ese barbero ya tiene una cita en ese horario. Elige otra hora u otro barbero.';
            if (/disponible|ausen/i.test(text)) return `${text.replace(/\.$/, '')}. Elige otra hora u otro barbero.`;
            return 'La agenda cambió y ese horario ya no se puede usar. Actualiza la pantalla e inténtalo de nuevo.';
        }
        if (err.status === 400 && /empiezan en punto|30 minutos/i.test(text)) return text;
    }
    return toUserMessage(err, fallback);
}
