// Lógica pura de los selectores de fecha, rango y hora. Las fechas viajan como texto 'AAAA-MM-DD'
// y se construyen siempre con año, mes y día locales: `new Date('AAAA-MM-DD')` es UTC y corre el día.
import { format } from 'date-fns';
import { es } from 'date-fns/locale';
import { localDateKey } from '@/lib/utils/dates';

export const BUSINESS_TIME_ZONE = 'America/Mexico_City';
/** La semana de pago del negocio va de domingo a sábado. */
export const WEEK_STARTS_ON = 0;
export const WEEKDAY_LABELS = ['dom', 'lun', 'mar', 'mié', 'jue', 'vie', 'sáb'] as const;

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^(\d{2}):(\d{2})$/;
const pad = (n: number) => String(n).padStart(2, '0');

/** 'AAAA-MM-DD' a Date local (medianoche local). null si el texto no es un día real. */
export function parseDay(key: string | null | undefined): Date | null {
    const m = key ? DAY_RE.exec(key) : null;
    if (!m) return null;
    const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
    const date = new Date(y, mo - 1, d);
    return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? date : null;
}

export function dayKey(y: number, monthIndex: number, d: number): string {
    return localDateKey(new Date(y, monthIndex, d));
}

/** El día de hoy en la barbería (America/Mexico_City), sin importar el reloj del dispositivo. */
export function todayInBusiness(now: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Hora actual de la barbería como 'HH:MM'. */
export function nowTimeInBusiness(now: Date = new Date()): string {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: BUSINESS_TIME_ZONE, hourCycle: 'h23', hour: '2-digit', minute: '2-digit' }).formatToParts(now);
    const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '00';
    return `${get('hour') === '24' ? '00' : get('hour')}:${get('minute')}`;
}

/** 'lun 16 nov 2026'. */
export function formatDayLabel(key: string): string {
    const d = parseDay(key);
    return d ? format(d, 'EEE d MMM yyyy', { locale: es }).replace(/\./g, '') : '';
}

/** 'noviembre 2026'. */
export function formatMonthTitle(key: string): string {
    const d = parseDay(key);
    return d ? format(d, 'LLLL yyyy', { locale: es }) : '';
}

/** 'lunes 16 de noviembre de 2026', para lectores de pantalla. */
export function formatDayLong(key: string): string {
    const d = parseDay(key);
    return d ? format(d, "EEEE d 'de' MMMM 'de' yyyy", { locale: es }) : '';
}

export function addDaysKey(key: string, n: number): string {
    const d = parseDay(key) ?? new Date();
    return dayKey(d.getFullYear(), d.getMonth(), d.getDate() + n);
}

/** Suma meses conservando el día; si el mes destino es más corto, cae en su último día (31 ene + 1 = 28 feb). */
export function addMonthsKey(key: string, n: number): string {
    const d = parseDay(key) ?? new Date();
    const target = new Date(d.getFullYear(), d.getMonth() + n, 1);
    const last = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    return dayKey(target.getFullYear(), target.getMonth(), Math.min(d.getDate(), last));
}

export function startOfMonthKey(key: string): string {
    const d = parseDay(key) ?? new Date();
    return dayKey(d.getFullYear(), d.getMonth(), 1);
}
export function endOfMonthKey(key: string): string {
    const d = parseDay(key) ?? new Date();
    return dayKey(d.getFullYear(), d.getMonth() + 1, 0);
}
/** Domingo de la semana que contiene el día. */
export function startOfWeekKey(key: string): string {
    const d = parseDay(key) ?? new Date();
    return dayKey(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() - WEEK_STARTS_ON + 7) % 7));
}

export function isDayDisabled(key: string, min?: string, max?: string): boolean {
    return (!!min && key < min) || (!!max && key > max);
}

/** Lleva un día al intervalo [min, max]. */
export function clampDay(key: string, min?: string, max?: string): string {
    if (min && key < min) return min;
    if (max && key > max) return max;
    return key;
}

export interface GridDay { key: string; day: number; inMonth: boolean; disabled: boolean; }

/** Cuadrícula del mes que contiene `key`: semanas completas de domingo a sábado (4 a 6 filas). */
export function monthGrid(key: string, min?: string, max?: string): GridDay[][] {
    const d = parseDay(key) ?? new Date();
    const y = d.getFullYear(), m = d.getMonth();
    const first = new Date(y, m, 1);
    const lead = (first.getDay() - WEEK_STARTS_ON + 7) % 7;
    const count = new Date(y, m + 1, 0).getDate();
    const rows = Math.ceil((lead + count) / 7);
    const weeks: GridDay[][] = [];
    for (let r = 0; r < rows; r++) {
        const week: GridDay[] = [];
        for (let c = 0; c < 7; c++) {
            const date = new Date(y, m, 1 - lead + r * 7 + c);
            const k = localDateKey(date);
            week.push({ key: k, day: date.getDate(), inMonth: date.getMonth() === m, disabled: isDayDisabled(k, min, max) });
        }
        weeks.push(week);
    }
    return weeks;
}

export type CalendarKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'PageUp' | 'PageDown' | 'Home' | 'End';

/** Adónde se mueve el foco con cada tecla (patrón APG); el resultado queda dentro de min/max. */
export function moveFocus(key: string, k: CalendarKey, opts: { min?: string; max?: string; shift?: boolean } = {}): string {
    let next = key;
    switch (k) {
        case 'ArrowLeft': next = addDaysKey(key, -1); break;
        case 'ArrowRight': next = addDaysKey(key, 1); break;
        case 'ArrowUp': next = addDaysKey(key, -7); break;
        case 'ArrowDown': next = addDaysKey(key, 7); break;
        case 'PageUp': next = addMonthsKey(key, opts.shift ? -12 : -1); break;
        case 'PageDown': next = addMonthsKey(key, opts.shift ? 12 : 1); break;
        case 'Home': next = startOfWeekKey(key); break;
        case 'End': next = addDaysKey(startOfWeekKey(key), 6); break;
    }
    return clampDay(next, opts.min, opts.max);
}

export interface RangeShortcut { id: string; label: string; from: string; to: string; }

/** Atajos de rango; la semana va de domingo a sábado. */
export function rangeShortcuts(today: string): RangeShortcut[] {
    const weekStart = startOfWeekKey(today);
    const lastMonth = addMonthsKey(startOfMonthKey(today), -1);
    return [
        { id: 'today', label: 'Hoy', from: today, to: today },
        { id: 'week', label: 'Esta semana', from: weekStart, to: addDaysKey(weekStart, 6) },
        { id: 'lastWeek', label: 'Semana pasada', from: addDaysKey(weekStart, -7), to: addDaysKey(weekStart, -1) },
        { id: 'month', label: 'Este mes', from: startOfMonthKey(today), to: endOfMonthKey(today) },
        { id: 'lastMonth', label: 'Mes pasado', from: lastMonth, to: endOfMonthKey(lastMonth) },
    ];
}

export function daysInRange(from: string, to: string): number {
    const a = parseDay(from), b = parseDay(to);
    if (!a || !b) return 0;
    return Math.round((Date.UTC(b.getFullYear(), b.getMonth(), b.getDate()) - Date.UTC(a.getFullYear(), a.getMonth(), a.getDate())) / 86400000) + 1;
}

export type RangeResult = { ok: true; from: string; to: string } | { ok: false; error: string };

/** Ordena dos días como desde ≤ hasta y valida el máximo de días (inclusive). */
export function normalizeRange(a: string, b: string, maxDays?: number): RangeResult {
    const [from, to] = a <= b ? [a, b] : [b, a];
    if (maxDays && daysInRange(from, to) > maxDays) return { ok: false, error: `El rango puede abarcar como máximo ${maxDays} días.` };
    return { ok: true, from, to };
}

/** '8 nov – 14 nov 2026' (el año solo al final, o en ambos si difiere). */
export function formatRangeLabel(from: string, to: string): string {
    const a = parseDay(from), b = parseDay(to);
    if (!a || !b) return '';
    if (from === to) return formatDayLabel(from);
    const sameYear = a.getFullYear() === b.getFullYear();
    const fa = format(a, sameYear ? 'd MMM' : 'd MMM yyyy', { locale: es }).replace(/\./g, '');
    return `${fa} – ${format(b, 'd MMM yyyy', { locale: es }).replace(/\./g, '')}`;
}

// ---- Horas ----

export function timeToMinutes(value: string): number | null {
    const m = TIME_RE.exec(value);
    if (!m) return null;
    const h = Number(m[1]), min = Number(m[2]);
    return h < 24 && min < 60 ? h * 60 + min : null;
}
export function minutesToTime(total: number): string {
    return `${pad(Math.floor(total / 60))}:${pad(total % 60)}`;
}

/** 'HH:MM' de 24 h a '12:30 p. m.'; 00:00 es '12:00 a. m.' y 12:00 es '12:00 p. m.'. */
export function formatTime12(value: string): string {
    const total = timeToMinutes(value);
    if (total === null) return '';
    const h = Math.floor(total / 60), m = total % 60;
    return `${h % 12 === 0 ? 12 : h % 12}:${pad(m)} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

export interface TimeOption { value: string; label: string; }

/** Horas del día cada `step` minutos, dentro de [min, max] (inclusive). */
export function timeOptions(step = 30, min = '00:00', max = '23:59'): TimeOption[] {
    const s = Math.max(1, Math.floor(step));
    const lo = timeToMinutes(min) ?? 0, hi = timeToMinutes(max) ?? 24 * 60 - 1;
    const out: TimeOption[] = [];
    for (let t = 0; t < 24 * 60; t += s) {
        if (t < lo || t > hi) continue;
        const value = minutesToTime(t);
        out.push({ value, label: formatTime12(value) });
    }
    return out;
}

/** Agrega `value` a la lista (en su lugar) cuando no coincide con el paso, para no perder un valor guardado. */
export function withValue(options: TimeOption[], value: string): TimeOption[] {
    const t = timeToMinutes(value);
    if (t === null || options.some((o) => o.value === value)) return options;
    const next = [...options, { value, label: formatTime12(value) }];
    return next.sort((a, b) => (timeToMinutes(a.value) ?? 0) - (timeToMinutes(b.value) ?? 0));
}

/** Índice de la opción más cercana a una hora 'HH:MM' (-1 si no hay opciones). */
export function nearestOptionIndex(options: TimeOption[], target: string): number {
    const t = timeToMinutes(target);
    if (t === null || options.length === 0) return options.length ? 0 : -1;
    let best = -1, bestDiff = Infinity;
    options.forEach((o, i) => {
        const v = timeToMinutes(o.value);
        if (v === null) return;
        const diff = Math.abs(v - t);
        if (diff < bestDiff) { best = i; bestDiff = diff; }
    });
    return best;
}
