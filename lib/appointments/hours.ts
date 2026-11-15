// Horario del negocio y de cada barbero. La base (appointments_within_hours) es quien rechaza citas
// fuera de horario; esto calcula lo mismo para dibujar la agenda y los formularios.

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'] as const;

export type DayHours = { open: string; close: string } | null;
/** Llaves "0" (domingo) a "6" (sábado); null = cerrado. */
export type WeekHours = Partial<Record<'0' | '1' | '2' | '3' | '4' | '5' | '6', DayHours>>;
export interface ScheduleDay { weekday: number; off: boolean; starts: string | null; ends: string | null }
export interface ScheduleData { timezone: string; hours: WeekHours | null; barbers: Record<string, ScheduleDay[]> }

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function toMinutes(hhmm: string): number {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
}

export function minutesToHHMM(minutes: number): string {
    return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

/** "12:30" → "12:30 p.m.", "10:00" → "10 a.m." */
export function formatHour(hhmm: string): string {
    const total = toMinutes(hhmm);
    const h = Math.floor(total / 60);
    const m = total % 60;
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}${m ? `:${String(m).padStart(2, '0')}` : ''} ${h < 12 ? 'a.m.' : 'p.m.'}`;
}

/** Valida un horario semanal con las mismas reglas que la base (private.valid_week_hours). */
export function validWeekHours(hours: WeekHours): string | null {
    for (const [key, day] of Object.entries(hours)) {
        if (!/^[0-6]$/.test(key)) return 'Día no válido.';
        if (day === null || day === undefined) continue;
        if (!HHMM.test(day.open) || !HHMM.test(day.close)) return `Revisa las horas del ${WEEKDAYS[Number(key)].toLowerCase()}.`;
        if (toMinutes(day.open) >= toMinutes(day.close)) return `El ${WEEKDAYS[Number(key)].toLowerCase()} la apertura debe ser antes del cierre.`;
    }
    return null;
}

/**
 * Ventana de trabajo en minutos del día para una fecha 'YYYY-MM-DD' y un barbero (o el negocio si no hay barbero).
 * null = cerrado o descansa. Si no hay horario configurado, devuelve undefined (sin restricción).
 */
export function workingWindow(data: Pick<ScheduleData, 'hours' | 'barbers'>, dateKey: string, barberId?: string | null):
    { open: number; close: number } | null | undefined {
    const weekday = new Date(`${dateKey}T12:00:00`).getDay();
    let window: { open: number; close: number } | null | undefined;
    if (data.hours) {
        const day = data.hours[String(weekday) as keyof WeekHours];
        window = day ? { open: toMinutes(day.open), close: toMinutes(day.close) } : null;
    }
    if (window === null) return null;
    const own = barberId ? data.barbers[barberId]?.find((d) => d.weekday === weekday) : undefined;
    if (own) {
        if (own.off || !own.starts || !own.ends) return null;
        const open = toMinutes(own.starts);
        const close = toMinutes(own.ends);
        window = window ? { open: Math.max(window.open, open), close: Math.min(window.close, close) } : { open, close };
        if (window.open >= window.close) return null;
    }
    return window;
}
