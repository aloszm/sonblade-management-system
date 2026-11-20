import { addDays } from '@/lib/settlements/week';
import { formatMoney } from '@/lib/utils/money';
import { WEEKDAY_NAMES, type WageWeek } from '@/lib/payroll/wages';

/**
 * Formas y textos de las pantallas del sueldo por día (ficha en Equipo, faltas y días extra en Pago semanal, "Mi semana").
 * Lógica pura: nada de red ni de reloj. La regla del sueldo vive en la base; aquí solo se arman textos y listas.
 */

/** Orden en que se leen los días en la barbería: lunes a domingo (0 = domingo, igual que la base). */
export const DAY_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;
export const DAY_LETTER: Record<number, string> = { 1: 'L', 2: 'M', 3: 'M', 4: 'J', 5: 'V', 6: 'S', 0: 'D' };

/** Agrega o quita un día de la lista de días fijos; siempre queda ordenada y sin repetidos. */
export function toggleWorkDay(days: number[], day: number): number[] {
    const next = days.includes(day) ? days.filter((d) => d !== day) : [...days, day];
    return DAY_ORDER.filter((d) => next.includes(d));
}

/** "15 nov 2026" */
export function dayLabel(date: string): string {
    const d = new Date(`${date}T12:00:00Z`);
    const month = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
    return `${d.getUTCDate()} ${month} ${d.getUTCFullYear()}`;
}

/** "lunes 16 nov" (para elegir el día de una falta). */
export function longDayLabel(date: string): string {
    const d = new Date(`${date}T12:00:00Z`);
    const month = new Intl.DateTimeFormat('es-MX', { month: 'short', timeZone: 'UTC' }).format(d).replace('.', '');
    return `${WEEKDAY_NAMES[d.getUTCDay()]} ${d.getUTCDate()} ${month}`;
}

export interface WageRateView { daily_amount: number; work_days_label: string; effective_from: string }

/** "$320 por día · lunes a viernes · desde 15 nov 2026" */
export function rateSentence(rate: WageRateView): string {
    return `${formatMoney(rate.daily_amount)} por día · ${rate.work_days_label} · desde ${dayLabel(rate.effective_from)}`;
}

/** Las 7 fechas de la semana de pago, de domingo a sábado. */
export function weekDates(periodStart: string): string[] {
    return Array.from({ length: 7 }, (_, i) => addDays(periodStart, i));
}

export type ExceptionKind = 'absent' | 'extra';

/**
 * Días de la semana entre los que se puede elegir al registrar una excepción, según lo que ya cuenta el sueldo:
 * una falta solo en un día fijo que hoy se da por trabajado; un día extra solo en un día sin sueldo (fuera de los
 * días fijos y sin otra excepción activa). La base vuelve a validarlo: esto solo evita elegir un día imposible.
 */
export function exceptionDayOptions(kind: ExceptionKind, wage: WageWeek | null, periodStart: string): string[] {
    const byDate = new Map((wage?.days ?? []).map((d) => [d.date, d]));
    return weekDates(periodStart).filter((date) => {
        const day = byDate.get(date);
        return kind === 'absent' ? day?.status === 'worked' : day === undefined;
    });
}

/** Quién ve los botones de faltas y días extra: gerencia con la semana sin pagar (el servidor lo vuelve a exigir). */
export function canRegisterExceptions(person: { can_edit: boolean; settled: boolean }): boolean {
    return person.can_edit && !person.settled;
}

/** Texto corto del avance de la semana: "4 días · $1,280 devengados". */
export function accruedText(days: number, amount: number): string {
    return `${days} ${days === 1 ? 'día' : 'días'} · ${formatMoney(amount)} devengados`;
}
