import { payPeriodAt } from '@/lib/payroll/pay-period';
import { formatMoney } from '@/lib/utils/money';

/**
 * Sueldo por día del personal (20261120090000_daily_wages). La regla vive en la base:
 * - ficha con vigencia (public.set_employee_wage, solo la cuenta principal con PIN, nunca hacia atrás);
 * - los días fijos se dan por trabajados; solo se registran excepciones (public.record_attendance_exception /
 *   void_attendance_exception: faltó o día extra, dueño y gerencia con PIN, bloqueadas en semanas pagadas);
 * - el sueldo de la semana lo calcula private.wage_week_summary (el mismo para la vista previa y el pago).
 * Aquí solo están las formas, etiquetas y textos que comparten las rutas y las pantallas.
 */

type Num = number | string | null | undefined;
const n = (value: Num): number => {
    const x = Number(value ?? 0);
    return Number.isFinite(x) ? x : 0;
};

export const ATTENDANCE_KINDS = ['absent', 'extra'] as const;
export type AttendanceKind = (typeof ATTENDANCE_KINDS)[number];
export const ATTENDANCE_LABELS: Record<AttendanceKind, string> = { absent: 'Faltó', extra: 'Día extra' };

export type WageDayStatus = 'worked' | 'absent' | 'extra';
export const DAY_STATUS_LABELS: Record<WageDayStatus, string> = { worked: 'Trabajado', absent: 'Faltó', extra: 'Día extra' };

/** 0 = domingo … 6 = sábado (igual que extract(dow) en la base). */
export const WEEKDAY_NAMES = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
export const WEEKDAY_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

export interface WageDayIn { date: string; weekday?: Num; status: WageDayStatus | string; rate: Num; amount: Num; exception_id?: string | null; reason?: string | null }
export interface WageGroupIn { rate: Num; days: Num; amount: Num }
/** Lo que entrega la base en `wage` (vista previa, recibo y semana): private.wage_week_summary. */
export interface WageWeekIn {
    enabled?: boolean | null;
    period_start?: string;
    period_end?: string;
    amount: Num;
    paid_days?: Num;
    worked_days?: Num;
    absent_days?: Num;
    extra_days?: Num;
    groups?: WageGroupIn[] | null;
    days?: WageDayIn[] | null;
    summary?: string | null;
}

export interface WageDay { date: string; weekday: number; status: WageDayStatus; rate: number; amount: number; exceptionId: string | null; reason: string | null }
export interface WageWeek {
    amount: number;
    paidDays: number;
    workedDays: number;
    absentDays: number;
    extraDays: number;
    groups: { rate: number; days: number; amount: number }[];
    days: WageDay[];
    /** "5 días × $320 = $1,600" */
    summary: string;
}

const weekdayOf = (date: string) => new Date(`${date}T12:00:00Z`).getUTCDay();

/** "5 días × $320 = $1,600"; con tarifas distintas "2 días × $320 + 3 días × $350 = $1,690" (mismo texto que la base). */
export function wageSummaryText(groups: { rate: number; days: number }[], total: number): string {
    const used = groups.filter((g) => g.days > 0).sort((a, b) => a.rate - b.rate);
    if (used.length === 0) return '0 días';
    return `${used.map((g) => `${g.days} ${g.days === 1 ? 'día' : 'días'} × ${formatMoney(g.rate)}`).join(' + ')} = ${formatMoney(total)}`;
}

/** Normaliza el `wage` de la base (números como texto o número). null si no hay sueldo. */
export function mapWageWeek(input: WageWeekIn | null | undefined): WageWeek | null {
    if (!input) return null;
    const days: WageDay[] = (input.days ?? []).map((d) => ({
        date: d.date,
        weekday: d.weekday === undefined || d.weekday === null ? weekdayOf(d.date) : n(d.weekday),
        status: (['worked', 'absent', 'extra'].includes(d.status) ? d.status : 'worked') as WageDayStatus,
        rate: n(d.rate),
        amount: n(d.amount),
        exceptionId: d.exception_id ?? null,
        reason: d.reason ?? null,
    }));
    const groups = (input.groups ?? []).map((g) => ({ rate: n(g.rate), days: n(g.days), amount: n(g.amount) }));
    const amount = n(input.amount);
    const count = (status: WageDayStatus) => days.filter((d) => d.status === status).length;
    return {
        amount,
        paidDays: input.paid_days !== undefined && input.paid_days !== null ? n(input.paid_days) : count('worked') + count('extra'),
        workedDays: input.worked_days !== undefined && input.worked_days !== null ? n(input.worked_days) : count('worked'),
        absentDays: input.absent_days !== undefined && input.absent_days !== null ? n(input.absent_days) : count('absent'),
        extraDays: input.extra_days !== undefined && input.extra_days !== null ? n(input.extra_days) : count('extra'),
        groups,
        days,
        summary: input.summary?.trim() || wageSummaryText(groups, amount),
    };
}

/** "lun 16 nov" */
export function shortDayLabel(date: string): string {
    const d = new Date(`${date}T12:00:00Z`);
    const month = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
    return `${WEEKDAY_SHORT[d.getUTCDay()].toLowerCase()} ${d.getUTCDate()} ${month}`;
}

/** Renglones del detalle día por día: "lun 16 nov · Trabajado", "mié 18 nov · Faltó (motivo)", "sáb 21 nov · Día extra (motivo)". */
export function wageDayDetails(week: WageWeek): { key: string; text: string; amount: number }[] {
    return week.days.map((d) => ({
        key: `wage-${d.date}`,
        text: `${shortDayLabel(d.date)} · ${DAY_STATUS_LABELS[d.status]}${d.reason ? ` (${d.reason})` : ''}`,
        amount: d.amount,
    }));
}

/** Días fijos legibles: [1,2,3,4,5] → "lunes a viernes"; [0,6] → "sábado y domingo"; [] → "sin días fijos". */
export function workDaysLabel(days: number[]): string {
    const set = [...new Set(days.filter((d) => Number.isInteger(d) && d >= 0 && d <= 6))];
    if (set.length === 0) return 'sin días fijos';
    if (set.length === 7) return 'toda la semana';
    // Orden de lunes a domingo para leerlo como en la barbería.
    const order = (d: number) => (d === 0 ? 7 : d);
    const sorted = set.sort((a, b) => order(a) - order(b));
    const consecutive = sorted.every((d, i) => i === 0 || order(d) === order(sorted[i - 1]) + 1);
    if (sorted.length >= 3 && consecutive) return `${WEEKDAY_NAMES[sorted[0]]} a ${WEEKDAY_NAMES[sorted[sorted.length - 1]]}`;
    const names = sorted.map((d) => WEEKDAY_NAMES[d]);
    return names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} y ${names[names.length - 1]}`;
}

export type WageRateRow = {
    id: string; employee_id: string; daily_amount: Num; work_days: number[]; effective_from: string; reason: string;
    created_by: string; created_at: string;
};

/** Ficha vigente en una fecha: la vigencia más reciente <= fecha; empate: la última capturada (igual que la base). */
export function rateAt<T extends { effective_from: string; created_at: string }>(rows: T[], date: string): T | null {
    return rows.filter((r) => r.effective_from <= date)
        .sort((a, b) => b.effective_from.localeCompare(a.effective_from) || b.created_at.localeCompare(a.created_at))[0] ?? null;
}

/**
 * Inicio del periodo de pago en curso (lib/payroll/pay-period.ts, hora del negocio): igual que private.pay_week_start.
 * Es la vigencia más temprana que acepta public.set_employee_wage (el sueldo no se cambia hacia atrás).
 */
export function currentPayWeekStart(now: Date, timeZone: string): string {
    return payPeriodAt(now, timeZone).start;
}
