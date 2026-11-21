// Periodo de pago: EL único lugar de la app que sabe cuándo empieza, cierra y se paga una semana de pago.
//
// La verdad vive en la base: private.pay_period_rules y private.pay_period_for_date / private.pay_period_at
// (supabase/migrations/20261121100000_pay_period_thu_wed.sql). Este archivo es su espejo exacto para que las pantallas
// naveguen sin ir a la base; PAY_PERIOD_RULES debe ser idéntico a las filas que siembra esa migración (lo comprueba
// pay-period.test.ts leyendo el archivo de la migración). La base además rechaza cualquier periodo que no coincida.
//
// Regla (decisión del dueño, 21 nov 2026):
//   · hasta el sábado 14 nov 2026: de domingo a sábado, cierre el sábado a las 8:00 p. m., se paga ese mismo día;
//   · del domingo 15 al miércoles 18 nov 2026: periodo de transición (cierra al terminar el miércoles; se paga el sáb 21);
//   · desde el jueves 19 nov 2026: de jueves a miércoles, cierra al terminar el miércoles y se paga el sábado siguiente.
// Un periodo cubre los días start..end del negocio y los instantes (windowStart, windowEnd]: el cierre exacto es del
// periodo que cierra. windowStart es el cierre del periodo anterior, así que no hay huecos ni traslapes.
//
// OJO: esto NO es la semana de calendario. Los filtros "Esta semana" de Ventas, Finanzas, el Panel (base Finanzas),
// Reportes y los selectores de fecha siguen siendo de domingo a sábado por día de calendario.

import { addDays } from '@/lib/settlements/week';

export interface PayPeriodRule {
    /** Primer día que rige (si no cae en weekStartsOn, los días hasta el primer inicio forman un periodo de transición). */
    effectiveFrom: string;
    /** Día en que empieza la semana: 0 = domingo … 6 = sábado. */
    weekStartsOn: number;
    /** Minuto del último día en que cierra: 1200 = 8:00 p. m.; 1440 = al terminar el día. */
    closesAtMinute: number;
    /** Días después del último día en que se paga. */
    paydayOffsetDays: number;
}

/** Espejo de las filas de private.pay_period_rules (business_id nulo = regla por omisión). */
export const PAY_PERIOD_RULES: readonly PayPeriodRule[] = [
    { effectiveFrom: '2000-01-02', weekStartsOn: 0, closesAtMinute: 1200, paydayOffsetDays: 0 },
    { effectiveFrom: '2026-11-15', weekStartsOn: 4, closesAtMinute: 1440, paydayOffsetDays: 3 },
];

/** Texto de ayuda de la regla vigente. */
export const PAY_PERIOD_RULE_TEXT = 'Cada periodo de pago va de jueves a miércoles, cierra al terminar el miércoles y se paga el sábado.';

export interface PayPeriod {
    /** Primer y último día del negocio ('YYYY-MM-DD'). */
    start: string;
    end: string;
    /** Día en que se entrega el pago. Se puede pagar desde el cierre (windowEnd). */
    payDate: string;
    days: number;
    /** Periodo corto entre dos reglas (15 al 18 nov 2026). */
    isTransition: boolean;
    /** Instantes ISO: el periodo cubre (windowStart, windowEnd]. */
    windowStart: string;
    windowEnd: string;
}

const DAY_MS = 86_400_000;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const dow = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

/** Diferencia (hora de pared − UTC) de una zona horaria en un instante, en milisegundos. */
function zoneOffsetMs(instant: number, timeZone: string): number {
    const parts = new Intl.DateTimeFormat('en-US', {
        timeZone, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit',
    }).formatToParts(new Date(instant));
    const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    return Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second')) - instant;
}

/** Instante ISO de un día 'YYYY-MM-DD' + `minutes` minutos (hora de pared) en la zona del negocio. 1440 = medianoche siguiente. */
export function zonedMinuteIso(date: string, minutes: number, timeZone: string): string {
    const wall = Date.parse(`${date}T00:00:00Z`) + minutes * 60_000;
    let instant = wall - zoneOffsetMs(wall, timeZone);
    instant = wall - zoneOffsetMs(instant, timeZone); // segunda pasada: cambios de horario
    return new Date(instant).toISOString();
}

/** Día del negocio ('YYYY-MM-DD') de un instante. */
function businessDate(at: Date, timeZone: string): string {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(at);
    const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
    return `${get('year')}-${get('month')}-${get('day')}`;
}

/** Días del periodo de un día (sin zona horaria). Igual que private.pay_period_bounds. */
export function payPeriodBounds(date: string, rules: readonly PayPeriodRule[] = PAY_PERIOD_RULES) {
    if (!DATE_RE.test(date) || rules.length === 0) throw new Error('Periodo de pago: fecha o reglas no válidas.');
    const sorted = [...rules].sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));
    let i = 0; // antes de la primera regla: se extiende hacia atrás
    sorted.forEach((r, k) => { if (r.effectiveFrom <= date) i = k; });
    const rule = sorted[i];
    const prev = i > 0 ? sorted[i - 1] : null;
    const next = sorted[i + 1] ?? null;
    const firstFull = addDays(rule.effectiveFrom, (rule.weekStartsOn - dow(rule.effectiveFrom) + 7) % 7);
    let start: string;
    let end: string;
    if (date >= rule.effectiveFrom && date < firstFull) {
        start = rule.effectiveFrom;
        end = addDays(firstFull, -1);
    } else {
        start = addDays(firstFull, Math.floor(daysBetween(firstFull, date) / 7) * 7);
        end = addDays(start, 6);
    }
    if (next && end >= next.effectiveFrom) end = addDays(next.effectiveFrom, -1);
    const startCloseMinute = start === rule.effectiveFrom && prev ? prev.closesAtMinute : rule.closesAtMinute;
    return { start, end, startCloseMinute, endCloseMinute: rule.closesAtMinute, payDate: addDays(end, rule.paydayOffsetDays) };
}

/** Días, fecha de pago y transición del periodo de un día (sin instantes; no necesita la zona horaria). */
export function payPeriodDates(date: string, rules: readonly PayPeriodRule[] = PAY_PERIOD_RULES) {
    const b = payPeriodBounds(date, rules);
    const days = daysBetween(b.start, b.end) + 1;
    return { start: b.start, end: b.end, payDate: b.payDate, days, isTransition: days !== 7 };
}

/** EL periodo de pago de un día del negocio. Igual que private.pay_period_for_date. */
export function payPeriodForDate(date: string, timeZone: string, rules: readonly PayPeriodRule[] = PAY_PERIOD_RULES): PayPeriod {
    const b = payPeriodBounds(date, rules);
    const { days, isTransition } = payPeriodDates(date, rules);
    return {
        start: b.start, end: b.end, payDate: b.payDate, days, isTransition,
        windowStart: zonedMinuteIso(addDays(b.start, -1), b.startCloseMinute, timeZone),
        windowEnd: zonedMinuteIso(b.end, b.endCloseMinute, timeZone),
    };
}

/** El periodo al que pertenece un instante: windowStart < at <= windowEnd. Igual que private.pay_period_at. */
export function payPeriodAt(at: Date, timeZone: string, rules: readonly PayPeriodRule[] = PAY_PERIOD_RULES): PayPeriod {
    const p = payPeriodForDate(businessDate(at, timeZone), timeZone, rules);
    const t = at.getTime();
    if (t <= Date.parse(p.windowStart)) return payPeriodForDate(addDays(p.start, -1), timeZone, rules);
    if (t > Date.parse(p.windowEnd)) return payPeriodForDate(addDays(p.end, 1), timeZone, rules);
    return p;
}

export const previousPayPeriod = (p: PayPeriod, timeZone: string, rules?: readonly PayPeriodRule[]) => payPeriodForDate(addDays(p.start, -1), timeZone, rules);
export const nextPayPeriod = (p: PayPeriod, timeZone: string, rules?: readonly PayPeriodRule[]) => payPeriodForDate(addDays(p.end, 1), timeZone, rules);

/** ¿Ya cerró? Desde el cierre se puede pagar (la fecha de pago solo se informa). */
export const isPayPeriodClosed = (p: PayPeriod, now: Date) => now.getTime() >= Date.parse(p.windowEnd);

/** El periodo más reciente que ya cerró (el que se paga ahora). */
export function latestClosedPayPeriod(now: Date, timeZone: string, rules?: readonly PayPeriodRule[]): PayPeriod {
    const current = payPeriodAt(now, timeZone, rules);
    return isPayPeriodClosed(current, now) ? current : previousPayPeriod(current, timeZone, rules);
}

/** ¿El día es el primero de un periodo de pago? (para validar lo que pide la pantalla). */
export function isPayPeriodStart(date: string, rules: readonly PayPeriodRule[] = PAY_PERIOD_RULES): boolean {
    return DATE_RE.test(date) && !Number.isNaN(Date.parse(`${date}T00:00:00Z`)) && payPeriodBounds(date, rules).start === date;
}

/** Fin del periodo que empieza en `start` (null si `start` no inicia un periodo). */
export function payPeriodEndOf(start: string, rules: readonly PayPeriodRule[] = PAY_PERIOD_RULES): string | null {
    return isPayPeriodStart(start, rules) ? payPeriodBounds(start, rules).end : null;
}

// ---- Textos ----------------------------------------------------------------------------------------

const at12 = (date: string) => new Date(`${date}T12:00:00Z`);
const fmt = (opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { ...opts, timeZone: 'UTC' });

/** "19 al 25 de noviembre de 2026"; "29 de noviembre al 5 de diciembre de 2026"; "31 de diciembre de 2026 al 6 de enero de 2027". */
export function payPeriodLabel(start: string, end: string): string {
    const s = at12(start);
    const e = at12(end);
    const day = fmt({ day: 'numeric' });
    if (s.getUTCFullYear() !== e.getUTCFullYear()) {
        return `${fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(s)} al ${fmt({ day: 'numeric', month: 'long', year: 'numeric' }).format(e)}`;
    }
    const rest = fmt({ month: 'long', year: 'numeric' }).format(e);
    return s.getUTCMonth() === e.getUTCMonth()
        ? `${day.format(s)} al ${day.format(e)} de ${rest}`
        : `${day.format(s)} de ${fmt({ month: 'long' }).format(s)} al ${day.format(e)} de ${rest}`;
}

/** "jueves 19 al miércoles 25 de noviembre" (sin año; para tarjetas). */
export function payPeriodDaysLabel(start: string, end: string): string {
    const s = at12(start);
    const e = at12(end);
    const wd = fmt({ weekday: 'long' });
    const day = fmt({ day: 'numeric' });
    const month = fmt({ month: 'long' });
    return s.getUTCMonth() === e.getUTCMonth()
        ? `${wd.format(s)} ${day.format(s)} al ${wd.format(e)} ${day.format(e)} de ${month.format(e)}`
        : `${wd.format(s)} ${day.format(s)} de ${month.format(s)} al ${wd.format(e)} ${day.format(e)} de ${month.format(e)}`;
}

/** "sábado 28 de noviembre" */
export function payDateLabel(payDate: string): string {
    const d = at12(payDate);
    return `${fmt({ weekday: 'long' }).format(d)} ${fmt({ day: 'numeric', month: 'long' }).format(d)}`;
}

/** Título de un periodo: "Periodo de transición" o "Semana". */
export const payPeriodKind = (p: Pick<PayPeriod, 'isTransition'>) => (p.isTransition ? 'Periodo de transición' : 'Semana');
