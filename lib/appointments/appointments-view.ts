// Vista de citas para la pantalla. Los estados y sus transiciones deben coincidir con
// public.change_appointment_status en la base, que es quien manda: esto solo decide qué botones mostrar.

export type AppointmentStatus =
    | 'scheduled' | 'confirmed' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';

export const STATUS_LABELS: Record<AppointmentStatus, string> = {
    scheduled: 'Agendada',
    confirmed: 'Confirmada',
    checked_in: 'Llegó',
    in_progress: 'En servicio',
    completed: 'Completada',
    cancelled: 'Cancelada',
    no_show: 'No llegó',
};

/** Texto del botón que lleva una cita a ese estado. */
export const ACTION_LABELS: Record<AppointmentStatus, string> = {
    scheduled: 'Agendar',
    confirmed: 'Confirmar',
    checked_in: 'Llegó',
    in_progress: 'Iniciar servicio',
    completed: 'Completar',
    cancelled: 'Cancelar',
    no_show: 'No llegó',
};

const TRANSITIONS: Record<AppointmentStatus, AppointmentStatus[]> = {
    scheduled: ['confirmed', 'checked_in', 'no_show', 'cancelled'],
    confirmed: ['checked_in', 'no_show', 'cancelled'],
    checked_in: ['in_progress', 'completed', 'cancelled'],
    in_progress: ['completed'],
    completed: [],
    cancelled: [],
    no_show: [],
};

export function nextStatuses(status: AppointmentStatus): AppointmentStatus[] {
    return TRANSITIONS[status] ?? [];
}

/** Una cita cancelada o a la que no llegaron ya no ocupa el horario del barbero. */
export function isActive(status: AppointmentStatus): boolean {
    return status !== 'cancelled' && status !== 'no_show';
}

export { localDateKey } from '@/lib/utils/dates';

/** Inicio y fin (exclusivo) de un mes del calendario local, como instantes ISO para consultar la base. */
export function monthRange(year: number, month: number): { from: string; to: string } {
    return { from: new Date(year, month, 1).toISOString(), to: new Date(year, month + 1, 1).toISOString() };
}

/** Une fecha 'YYYY-MM-DD' y hora 'HH:MM' del dispositivo en un instante ISO. */
export function localDateTimeToIso(date: string, time: string): string {
    return new Date(`${date}T${time}`).toISOString();
}

export interface AppointmentRow {
    id: string;
    client_id: string | null;
    assigned_employee_id: string | null;
    customer_name: string;
    customer_phone: string | null;
    scheduled_start_at: string | null;
    scheduled_end_at: string | null;
    status: AppointmentStatus;
    notes: string | null;
    created_at: string;
    clients?: { id: string; full_name: string } | null;
    employees?: { id: string; display_name: string } | null;
}

export interface AppointmentView {
    id: string;
    client_id: string | null;
    barber_id: string | null;
    client_name: string;
    customer_phone: string | null;
    barber: { id: string; name: string } | null;
    scheduled_at: string;
    end_at: string | null;
    duration_minutes: number | null;
    status: AppointmentStatus;
    notes: string | null;
    created_at: string;
}

export function toAppointmentView(row: AppointmentRow): AppointmentView {
    const start = row.scheduled_start_at ?? row.created_at;
    const minutes = row.scheduled_start_at && row.scheduled_end_at
        ? Math.round((new Date(row.scheduled_end_at).getTime() - new Date(row.scheduled_start_at).getTime()) / 60_000)
        : null;
    return {
        id: row.id,
        client_id: row.client_id,
        barber_id: row.assigned_employee_id,
        client_name: row.clients?.full_name ?? row.customer_name,
        customer_phone: row.customer_phone,
        barber: row.employees ? { id: row.employees.id, name: row.employees.display_name } : null,
        scheduled_at: start,
        end_at: row.scheduled_end_at,
        duration_minutes: minutes,
        status: row.status,
        notes: row.notes,
        created_at: row.created_at,
    };
}
