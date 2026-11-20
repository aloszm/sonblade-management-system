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

/**
 * Rango que se pide a la API para la agenda: el mes y una semana de margen a cada lado, para que la vista de
 * semana (que puede cruzar de un mes a otro) y los días de las orillas del mes tengan todas sus citas.
 */
export function loadRange(year: number, month: number): { from: string; to: string } {
    return { from: new Date(year, month, 1 - 7).toISOString(), to: new Date(year, month + 1, 1 + 7).toISOString() };
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
    source?: string | null;
    sales?: { id: string; status: string; total_amount: number | string }[] | null;
    appointment_items?: AppointmentItemRow[] | null;
}

export interface AppointmentItemRow {
    id: string;
    service_id: string;
    price_snapshot: number | string;
    duration_snapshot_minutes: number;
    position?: number | null;
    removed_at?: string | null;
    services?: { name: string } | null;
}

/** Servicio guardado en la cita (C2): precio y duración del momento en que se agendó. */
export interface AppointmentServiceView {
    service_id: string;
    name: string;
    price: number;
    duration_minutes: number;
}

/** Columnas que piden las rutas de citas (con sus servicios vigentes). */
export const APPOINTMENT_COLUMNS = 'id, client_id, assigned_employee_id, customer_name, customer_phone, scheduled_start_at, scheduled_end_at, status, notes, created_at, source, clients(id, full_name), employees(id, display_name), sales(id, status, total_amount), appointment_items(id, service_id, price_snapshot, duration_snapshot_minutes, position, removed_at, services(name))';

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
    /** 'walk_in' = servicio cobrado sin cita, que la base registra solo en la agenda. */
    walk_in: boolean;
    /** Reservada por el propio cliente desde la página pública (origen 'online'). */
    online: boolean;
    /** Venta vigente ligada (la cita ya se cobró), o null. */
    sale: { id: string; total: number } | null;
    /** Servicios vigentes de la cita en el orden en que se eligieron (vacío en citas anteriores a C2). */
    services: AppointmentServiceView[];
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
        walk_in: row.source === 'walk_in',
        online: row.source === 'online',
        sale: chargedSale(row.sales),
        services: currentServices(row.appointment_items),
    };
}

function currentServices(items: AppointmentRow['appointment_items']): AppointmentServiceView[] {
    return (items ?? []).filter((i) => !i.removed_at)
        .sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
        .map((i) => ({ service_id: i.service_id, name: i.services?.name ?? '', price: Number(i.price_snapshot), duration_minutes: i.duration_snapshot_minutes }));
}

function chargedSale(sales: AppointmentRow['sales']): AppointmentView['sale'] {
    const live = (sales ?? []).find((sale) => sale.status !== 'refunded' && sale.status !== 'cancelled');
    return live ? { id: live.id, total: Number(live.total_amount) } : null;
}

/** Se puede cobrar desde la agenda una cita viva que todavía no tiene venta. */
export function canCharge(appointment: Pick<AppointmentView, 'status' | 'sale'>): boolean {
    return !appointment.sale && ['scheduled', 'confirmed', 'checked_in', 'in_progress'].includes(appointment.status);
}

/**
 * Carriles para dibujar citas que se empalman lado a lado (como cualquier calendario):
 * cada cita recibe su carril y cuántos carriles tiene su grupo de citas encimadas.
 */
export function layoutLanes<T extends { id: string; start: number; end: number }>(items: T[]): Map<string, { lane: number; lanes: number }> {
    const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end);
    const result = new Map<string, { lane: number; lanes: number }>();
    let group: { id: string; lane: number }[] = [];
    let laneEnds: number[] = [];
    let groupEnd = -Infinity;
    const flush = () => { for (const g of group) result.set(g.id, { lane: g.lane, lanes: laneEnds.length }); group = []; laneEnds = []; };
    for (const item of sorted) {
        if (item.start >= groupEnd) { flush(); groupEnd = -Infinity; }
        let lane = laneEnds.findIndex((end) => end <= item.start);
        if (lane < 0) { lane = laneEnds.length; laneEnds.push(item.end); } else laneEnds[lane] = item.end;
        group.push({ id: item.id, lane });
        groupEnd = Math.max(groupEnd, item.end);
    }
    flush();
    return result;
}
