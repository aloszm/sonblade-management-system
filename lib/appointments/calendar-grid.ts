// Cálculos de la cuadrícula de la agenda: bloques de 30 minutos, posición de las tarjetas,
// opciones de hora y duración del formulario. Todo es puro (sin React ni reloj) para poder probarlo.

/** La agenda se agenda y se dibuja en bloques de media hora. */
export const SLOT_MINUTES = 30;
/** Duraciones que ofrece el formulario: 30 min, 1 h, 1 h 30 y 2 h (corte, corte y barba, corte y facial, VIP). */
export const ALLOWED_DURATIONS = [30, 60, 90, 120] as const;
export const DEFAULT_DURATION = 30;
/** Si el negocio no tiene horario configurado, la agenda muestra de 8 a.m. a 10 p.m. */
export const DEFAULT_GRID = { start: 8 * 60, end: 22 * 60 } as const;
/** Cuánto se muestra antes de abrir y después de cerrar (en minutos), para ver el rayado de "cerrado". */
export const GRID_MARGIN = 30;
const DAY_MINUTES = 24 * 60;

export const floorToSlot = (minutes: number): number => Math.floor(minutes / SLOT_MINUTES) * SLOT_MINUTES;
export const ceilToSlot = (minutes: number): number => Math.ceil(minutes / SLOT_MINUTES) * SLOT_MINUTES;
export const isOnSlot = (minutes: number): boolean => minutes % SLOT_MINUTES === 0;
export const isAllowedDuration = (minutes: number): boolean => Number.isInteger(minutes) && minutes > 0 && minutes % SLOT_MINUTES === 0 && minutes <= 8 * 60;

const pad = (n: number) => String(n).padStart(2, '0');

interface ZonedParts { date: string; minutes: number; seconds: number }

/** Fecha 'YYYY-MM-DD', minuto del día y segundos de un instante, en una zona horaria (por omisión, la del dispositivo). */
function partsIn(date: Date, timeZone?: string): ZonedParts {
    if (!timeZone) {
        return { date: `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`, minutes: date.getHours() * 60 + date.getMinutes(), seconds: date.getSeconds() };
    }
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(date);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '00';
    return { date: `${get('year')}-${get('month')}-${get('day')}`, minutes: Number(get('hour')) * 60 + Number(get('minute')), seconds: Number(get('second')) };
}

/** Minutos desde la medianoche (hora de la barbería) de un instante. */
export function minuteOfDay(instant: Date | string, timeZone?: string): number {
    return partsIn(new Date(instant), timeZone).minutes;
}

/** Día 'YYYY-MM-DD' (hora de la barbería) de un instante: una cita de las 8 p.m. en México no cae en el día siguiente. */
export function dayKeyIn(instant: Date | string, timeZone?: string): string {
    return partsIn(new Date(instant), timeZone).date;
}

/** ¿El instante cae exactamente en :00 o :30 de la hora de la barbería (sin segundos)? */
export function startsOnSlot(instant: Date | string, timeZone?: string): boolean {
    const date = new Date(instant);
    if (Number.isNaN(date.getTime()) || date.getMilliseconds() !== 0) return false;
    const { minutes, seconds } = partsIn(date, timeZone);
    return seconds === 0 && isOnSlot(minutes);
}

/**
 * Mensaje (en español) si una cita nueva agendada no respeta los bloques de 30 minutos; null si está bien.
 * Los registros "sin cita" que crea el cobro no pasan por aquí: se hacen a la hora real del cobro.
 */
export function bookingSlotError(startsAt: Date | string, durationMinutes: number, timeZone?: string): string | null {
    if (!startsOnSlot(startsAt, timeZone)) return 'Las citas empiezan en punto o y media (por ejemplo 1:00 o 1:30 p.m.).';
    if (!isAllowedDuration(durationMinutes)) return 'La duración debe ser de 30 minutos o múltiplos de 30 (30, 60, 90 o 120).';
    return null;
}

export interface Span { start: number; end: number }

/** Inicio y fin de una cita en minutos del día; si no tiene fin, dura un bloque. Una cita que cruza la medianoche termina a las 24:00. */
export function appointmentSpan(startIso: string, endIso: string | null, timeZone?: string): Span {
    const startDate = new Date(startIso);
    const start = minuteOfDay(startDate, timeZone);
    const minutes = endIso ? Math.round((new Date(endIso).getTime() - startDate.getTime()) / 60_000) : SLOT_MINUTES;
    return { start, end: Math.min(start + Math.max(minutes, 1), DAY_MINUTES) };
}

/**
 * Lo que ocupa una cita en la cuadrícula: de la línea de bloque donde empieza a la línea donde termina,
 * y como mínimo un bloque. Un cobro sin cita a las 13:17 se dibuja de 13:00 a 14:00 (su hora real va escrita en la tarjeta).
 */
export function visualSpan(span: Span): Span {
    const start = Math.min(floorToSlot(span.start), DAY_MINUTES - SLOT_MINUTES);
    const end = Math.min(Math.max(ceilToSlot(span.end), start + SLOT_MINUTES), DAY_MINUTES);
    return { start, end };
}

/** Lo que la vista de día muestra siempre, para todos los puestos: de 8:00 a.m. a 10:00 p.m. (hora de la barbería). */
export const VISIBLE_DAY_RANGE = { start: 8 * 60, end: 22 * 60 } as const;

/**
 * Rango visible del día en minutos (alineado a bloques de 30): siempre VISIBLE_DAY_RANGE; las horas fuera del
 * horario se rayan aparte. Solo se amplía si hay una cita antes de las 8 o después de las 22 (no se pierde).
 * Qué horas se pueden agendar no depende de esto: lo decide el horario del negocio y del barbero.
 */
export function gridRange(_window?: { open: number; close: number } | null, appointmentSpans: Span[] = []): Span {
    let start: number = VISIBLE_DAY_RANGE.start;
    let end: number = VISIBLE_DAY_RANGE.end;
    for (const s of appointmentSpans) {
        const v = visualSpan(s);
        start = Math.min(start, v.start);
        end = Math.max(end, v.end);
    }
    return { start, end };
}

/** Inicio de cada bloque de 30 minutos de un rango. */
export function slotStarts(range: Span): number[] {
    const out: number[] = [];
    for (let m = range.start; m < range.end; m += SLOT_MINUTES) out.push(m);
    return out;
}

/** Posición vertical (px) de un tramo de minutos dentro de una cuadrícula que empieza en `gridStart`. */
export function spanBox(span: Span, gridStart: number, slotPx: number): { top: number; height: number } {
    return { top: ((span.start - gridStart) / SLOT_MINUTES) * slotPx, height: ((span.end - span.start) / SLOT_MINUTES) * slotPx };
}

/** Cuánto detalle cabe en una tarjeta según cuántos bloques ocupa: 1 bloque = hora y cliente; 2 o más = también servicio y barbero. */
export function cardDetail(visual: Span): { showService: boolean; showBarber: boolean } {
    const slots = (visual.end - visual.start) / SLOT_MINUTES;
    return { showService: slots >= 2, showBarber: slots >= 2 };
}

/** "13:17" → "1:17 p.m."; 750 → "12:30 p.m."; las 12 en punto se escriben "12 p.m.". */
export function formatClock(minutes: number, withMeridiem = true): string {
    const m = ((minutes % DAY_MINUTES) + DAY_MINUTES) % DAY_MINUTES;
    const h = Math.floor(m / 60);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    const mm = m % 60;
    return `${h12}${mm ? `:${pad(mm)}` : ''}${withMeridiem ? ` ${h < 12 ? 'a.m.' : 'p.m.'}` : ''}`;
}

/** Rango corto para una tarjeta: "1:17–1:47 p.m." o "11:30 a.m.–12 p.m." cuando cambia de a.m. a p.m. */
export function formatRange(span: Span): string {
    const sameHalf = Math.floor((span.start % DAY_MINUTES) / 720) === Math.floor((span.end % DAY_MINUTES) / 720);
    return sameHalf ? `${formatClock(span.start, false)}–${formatClock(span.end)}` : `${formatClock(span.start)}–${formatClock(span.end)}`;
}

export interface TimeOption { value: string; label: string; legacy?: boolean }

export const toHHMM = (minutes: number): string => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
const hhmmToMinutes = (hhmm: string): number => { const [h, m] = hhmm.split(':').map(Number); return h * 60 + m; };

/**
 * Horas que se pueden elegir para agendar, de 30 en 30, dentro del horario: la cita tiene que terminar
 * a más tardar al cerrar. `window` null = día cerrado (ninguna); undefined = sin horario configurado (8 a.m. a 10 p.m.).
 * Si `current` es una hora que ya traía una cita antigua (por ejemplo 13:17) se conserva como opción para no romperla.
 */
export function timeOptions(window: { open: number; close: number } | null | undefined, durationMinutes: number, current?: string): TimeOption[] {
    const range = window === undefined ? { open: DEFAULT_GRID.start, close: DEFAULT_GRID.end } : window;
    const options: TimeOption[] = [];
    if (range) {
        for (let m = ceilToSlot(range.open); m + durationMinutes <= range.close; m += SLOT_MINUTES) {
            options.push({ value: toHHMM(m), label: formatClock(m) });
        }
    }
    if (current && !options.some((o) => o.value === current) && /^\d{2}:\d{2}$/.test(current)) {
        options.push({ value: current, label: `${formatClock(hhmmToMinutes(current))} (hora actual)`, legacy: true });
        options.sort((a, b) => a.value.localeCompare(b.value));
    }
    return options;
}

export interface DurationOption { value: number; label: string; legacy?: boolean }

export function durationLabel(minutes: number): string {
    if (minutes < 60) return `${minutes} minutos`;
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    return `${h === 1 ? '1 hora' : `${h} horas`}${m ? ` ${m} minutos` : ''}`;
}

/** Duraciones del formulario: 30, 60, 90 y 120. Una cita antigua de 45 min se muestra (no se pierde) para poder ajustarla. */
export function durationOptions(current?: number): DurationOption[] {
    const options: DurationOption[] = ALLOWED_DURATIONS.map((value) => ({ value, label: durationLabel(value) }));
    if (current && !options.some((o) => o.value === current)) {
        options.push({ value: current, label: `${current} minutos (ajusta a bloques de 30)`, legacy: true });
        options.sort((a, b) => a.value - b.value);
    }
    return options;
}

/** Duración válida más cercana hacia arriba (45 → 60), para ajustar una cita antigua al guardarla. */
export function snapDuration(minutes: number): number {
    const snapped = Math.max(SLOT_MINUTES, ceilToSlot(minutes));
    return Math.min(snapped, ALLOWED_DURATIONS[ALLOWED_DURATIONS.length - 1]);
}

/** Conserva la hora si sigue disponible; si no, queda vacía para que se elija otra. */
export function reconcileTime(time: string, options: TimeOption[]): string {
    return options.some((o) => o.value === time) ? time : '';
}

/** Primera hora disponible a partir de la que se tocó (por ejemplo, tocar 12:00 en un día que abre a las 12:30 da 12:30). */
export function nearestOption(time: string, options: TimeOption[]): string {
    return options.find((o) => o.value >= time)?.value ?? '';
}

// ---- Semana ----

/** Suma días a una fecha 'YYYY-MM-DD' (mediodía local para no tropezar con cambios de horario). */
export function addDays(dateKey: string, delta: number): string {
    const d = new Date(`${dateKey}T12:00:00`);
    d.setDate(d.getDate() + delta);
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Los 7 días de la semana (domingo a sábado, como el calendario del negocio) que contiene una fecha. */
export function weekDays(dateKey: string): string[] {
    const weekday = new Date(`${dateKey}T12:00:00`).getDay();
    const sunday = addDays(dateKey, -weekday);
    return Array.from({ length: 7 }, (_, i) => addDays(sunday, i));
}

// ---- Cuadrícula semanal y marcas de hora ----

/** Horas en punto (en minutos del día) que caen dentro de un rango: las únicas que llevan etiqueta en el eje. */
export function hourMarks(range: Span): number[] {
    const out: number[] = [];
    for (let m = Math.ceil(range.start / 60) * 60; m < range.end; m += 60) out.push(m);
    return out;
}

/**
 * Rango de la semana en cuadrícula: el mismo de 8:00 a 22:00 que el día, ampliado solo si alguna cita de la
 * semana cae fuera (así no se pierde). Todas las columnas comparten las mismas filas.
 */
export function weekGridRange(appointmentSpans: Span[] = []): Span {
    return gridRange(undefined, appointmentSpans);
}

/** ¿Un tramo ya empezó y aún no termina a esa hora? (para la línea de "ahora" y el resaltado de lo que está pasando). */
export function isHappening(span: Span, nowMinutes: number): boolean {
    return nowMinutes >= span.start && nowMinutes < span.end;
}
