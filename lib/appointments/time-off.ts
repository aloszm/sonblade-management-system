// Ausencias de barberos (employee_time_off). La base es quien bloquea la agenda; esto solo da forma a los datos.

export const REQUESTED_VIA = ['en_persona', 'whatsapp', 'llamada', 'mensaje', 'otro'] as const;
export type RequestedVia = (typeof REQUESTED_VIA)[number];

export const VIA_LABELS: Record<RequestedVia, string> = {
    en_persona: 'En persona',
    whatsapp: 'WhatsApp',
    llamada: 'Llamada',
    mensaje: 'Mensaje',
    otro: 'Otro',
};

export interface TimeOffRow {
    id: string;
    employee_id: string;
    starts_at: string;
    ends_at: string;
    reason: string;
    requested_at: string;
    requested_via: string;
    created_by: string;
    created_at: string;
    cancelled_at: string | null;
    cancelled_by: string | null;
    cancel_reason: string | null;
}

export interface TimeOffView {
    id: string;
    barber_id: string;
    barber_name: string;
    starts_at: string;
    ends_at: string;
    reason: string;
    requested_at: string;
    requested_via: RequestedVia;
    created_at: string;
    created_by_name: string;
    cancelled: { at: string; by_name: string; reason: string } | null;
}

export function toTimeOffView(row: TimeOffRow, employeeNames: Map<string, string>, userNames: Map<string, string>): TimeOffView {
    return {
        id: row.id,
        barber_id: row.employee_id,
        barber_name: employeeNames.get(row.employee_id) ?? 'Barbero',
        starts_at: row.starts_at,
        ends_at: row.ends_at,
        reason: row.reason,
        requested_at: row.requested_at,
        requested_via: (REQUESTED_VIA as readonly string[]).includes(row.requested_via) ? row.requested_via as RequestedVia : 'otro',
        created_at: row.created_at,
        created_by_name: userNames.get(row.created_by) ?? 'Usuario',
        cancelled: row.cancelled_at
            ? { at: row.cancelled_at, by_name: userNames.get(row.cancelled_by ?? '') ?? 'Usuario', reason: row.cancel_reason ?? '' }
            : null,
    };
}

/** Parte de una ausencia que cae dentro de un día [dayStart, dayEnd), en minutos desde dayStart; null si no lo toca. */
export function overlapMinutes(offStart: Date, offEnd: Date, dayStart: Date, dayEnd: Date): { from: number; to: number } | null {
    const start = Math.max(offStart.getTime(), dayStart.getTime());
    const end = Math.min(offEnd.getTime(), dayEnd.getTime());
    if (end <= start) return null;
    return { from: (start - dayStart.getTime()) / 60_000, to: (end - dayStart.getTime()) / 60_000 };
}
