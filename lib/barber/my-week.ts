// "Mi semana" del barbero: cálculos puros (sin base de datos ni reloj propio) sobre lo que ya devuelven
// business_report, sale_tips, commission_settlements y appointments. El dinero va en centavos enteros.
//
// "Esta semana" y "Semana pasada" son PERIODOS DE PAGO (lib/payroll/pay-period.ts, espejo de private.pay_period_at):
// de jueves a miércoles desde el 19 nov 2026 (antes, domingo a sábado con corte el sábado a las 8:00 p. m.; del 15 al
// 18 nov, el periodo de transición). "Este mes" es el mes de calendario.

import { addDays, localClock } from '@/lib/settlements/week';
import { payPeriodAt, payPeriodDates, previousPayPeriod, zonedMinuteIso, type PayPeriod } from '@/lib/payroll/pay-period';

export type Period = 'week' | 'last_week' | 'month';
export const PERIODS: Period[] = ['week', 'last_week', 'month'];
export const PERIOD_LABELS: Record<Period, string> = { week: 'Esta semana', last_week: 'Semana pasada', month: 'Este mes' };

export const WEEKDAYS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'] as const;
export const WEEKDAYS_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'] as const;

/** Cuántos días hacia atrás se mira para saber si un cliente ya había venido con el barbero. */
export const REPEAT_LOOKBACK_DAYS = 90;

export const toCents = (value: number | string | null | undefined): number => {
    const n = Math.round(Number(value) * 100);
    return Number.isFinite(n) ? n : 0;
};

// ---------------------------------------------------------------------------------------------
// Periodos
// ---------------------------------------------------------------------------------------------

/** Instante ISO de las `hour`:00 de un día 'YYYY-MM-DD' en la zona horaria del negocio. */
export function zonedInstantIso(date: string, hour: number, timeZone: string): string {
    return zonedMinuteIso(date, hour * 60, timeZone);
}

export interface TimeWindow { start: string; end: string }

export interface PeriodWindow extends TimeWindow {
    period: Period;
    timezone: string;
    /** Primer y último día (del negocio) que cubre: el periodo de pago, o el mes completo. */
    startDay: string;
    endDay: string;
    /** Primer día del periodo de pago; null para el mes. */
    weekStart: string | null;
    /** Día en que se paga el periodo (sábado); null para el mes. */
    payDate: string | null;
    /** El periodo de transición del 15 al 18 nov 2026. */
    isTransition: boolean;
    previous: TimeWindow;
}

const firstOfMonth = (date: string) => `${date.slice(0, 7)}-01`;
const shiftMonth = (firstDay: string, months: number) => {
    const d = new Date(`${firstDay}T00:00:00Z`);
    d.setUTCMonth(d.getUTCMonth() + months, 1);
    return d.toISOString().slice(0, 10);
};

const payWindow = (p: PayPeriod): TimeWindow => ({ start: p.windowStart, end: p.windowEnd });

/** Primer día del periodo de pago en curso (pasado el cierre ya empezó el siguiente). */
export function currentWeekStart(now: Date, timeZone: string): string {
    return payPeriodAt(now, timeZone).start;
}

export function periodWindow(period: Period, now: Date, timeZone: string): PeriodWindow {
    if (period === 'month') {
        const first = firstOfMonth(localClock(now, timeZone).date);
        const next = shiftMonth(first, 1);
        const before = shiftMonth(first, -1);
        return {
            period, timezone: timeZone, startDay: first, endDay: addDays(next, -1), weekStart: null, payDate: null, isTransition: false,
            start: zonedInstantIso(first, 0, timeZone), end: zonedInstantIso(next, 0, timeZone),
            previous: { start: zonedInstantIso(before, 0, timeZone), end: zonedInstantIso(first, 0, timeZone) },
        };
    }
    const currentPeriod = payPeriodAt(now, timeZone);
    const p = period === 'week' ? currentPeriod : previousPayPeriod(currentPeriod, timeZone);
    return {
        period, timezone: timeZone, startDay: p.start, endDay: p.end, weekStart: p.start, payDate: p.payDate, isTransition: p.isTransition,
        ...payWindow(p), previous: payWindow(previousPayPeriod(p, timeZone)),
    };
}

const dowOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

/**
 * Día de la semana (0 = domingo) de un instante en la zona del negocio. Lo de antes del primer día del periodo (la
 * noche del sábado 14 nov tras el corte, en la transición) cuenta como el primer día; el cierre exacto, como el último.
 */
export function weekdayOf(iso: string, timeZone: string, firstDay?: string | null, lastDay?: string | null): number {
    const clock = localClock(new Date(iso), timeZone);
    if (firstDay && clock.date < firstDay) return dowOf(firstDay);
    if (lastDay && clock.date > lastDay) return dowOf(lastDay);
    return clock.dow;
}

/** Orden de las barras por día: los días del periodo de pago desde su primer día (jueves); el mes, de domingo a sábado. */
export function weekdayOrder(window: Pick<PeriodWindow, 'weekStart' | 'endDay'>): number[] {
    if (!window.weekStart) return [0, 1, 2, 3, 4, 5, 6];
    const days = payPeriodDates(window.weekStart).days;
    return Array.from({ length: days }, (_, i) => dowOf(addDays(window.weekStart as string, i)));
}

// ---------------------------------------------------------------------------------------------
// Entradas (forma de lo que devuelve la base)
// ---------------------------------------------------------------------------------------------

export interface ReportBarberInput {
    cuts: number | string;
    service_revenue: number | string;
    product_revenue: number | string;
    service_commission: number | string;
    product_commission: number | string;
    service_breakdown: { name: string; count: number | string; revenue: number | string }[];
}
export interface ReportSaleInput {
    id: string;
    created_at: string;
    items: { item_name: string; item_type: 'service' | 'product' }[];
    amount: number | string;
    commission?: number | string;
}
export interface ReportInput { barber: ReportBarberInput | null; sales: ReportSaleInput[] }

export interface TipInput { sale_id: string; amount: number | string; created_at: string; settlement_id: string | null }
export interface SettlementInput {
    id: string; receipt_number: string; period_start: string; period_end: string; total_amount: number | string; paid_at: string | null; status: string;
}
export type AppointmentStatus = 'scheduled' | 'confirmed' | 'checked_in' | 'in_progress' | 'completed' | 'cancelled' | 'no_show';
export interface AppointmentInput {
    id: string; client_id: string | null; customer_name: string; scheduled_start_at: string | null; scheduled_end_at: string | null;
    status: AppointmentStatus; notes: string | null; source?: string | null; created_at?: string; clients?: { full_name: string } | null;
}

// ---------------------------------------------------------------------------------------------
// Dinero
// ---------------------------------------------------------------------------------------------

export interface DayBar { dow: number; commissionCents: number; tipsCents: number; totalCents: number; services: number }

export interface Earnings {
    serviceCents: number;
    productCents: number;
    tipsCents: number;
    totalCents: number;
    previousTotalCents: number;
    /** Positivo: ganó más que el periodo anterior. */
    deltaCents: number;
    /** Porcentaje contra el periodo anterior; null si el anterior fue cero (no se puede dividir). */
    deltaPct: number | null;
    byWeekday: DayBar[];
    bestDay: { dow: number; services: number; totalCents: number } | null;
}

export type PayoutStatus = 'paid' | 'open' | 'closed';
export interface Payout {
    status: PayoutStatus;
    paidCents: number;
    receipts: { id: string; number: string; paidAt: string | null; totalCents: number }[];
}

const emptyDays = (): DayBar[] => Array.from({ length: 7 }, (_, dow) => ({ dow, commissionCents: 0, tipsCents: 0, totalCents: 0, services: 0 }));

export function buildEarnings(
    window: PeriodWindow, current: ReportInput, previous: ReportInput, tips: TipInput[], previousTips: TipInput[],
): Earnings {
    const b = current.barber;
    const serviceCents = toCents(b?.service_commission);
    const productCents = toCents(b?.product_commission);
    const tipsCents = tips.reduce((sum, t) => sum + toCents(t.amount), 0);
    const totalCents = serviceCents + productCents + tipsCents;

    const p = previous.barber;
    const previousTotalCents = toCents(p?.service_commission) + toCents(p?.product_commission)
        + previousTips.reduce((sum, t) => sum + toCents(t.amount), 0);

    const days = emptyDays();
    for (const sale of current.sales) {
        const day = days[weekdayOf(sale.created_at, window.timezone, window.weekStart, window.weekStart ? window.endDay : null)];
        day.commissionCents += toCents(sale.commission);
        day.services += sale.items.filter((i) => i.item_type === 'service').length;
    }
    for (const tip of tips) days[weekdayOf(tip.created_at, window.timezone, window.weekStart, window.weekStart ? window.endDay : null)].tipsCents += toCents(tip.amount);
    for (const day of days) day.totalCents = day.commissionCents + day.tipsCents;

    const best = [...days].filter((d) => d.services > 0).sort((a, b2) => b2.services - a.services || b2.totalCents - a.totalCents || a.dow - b2.dow)[0];
    const deltaCents = totalCents - previousTotalCents;
    return {
        serviceCents, productCents, tipsCents, totalCents, previousTotalCents, deltaCents,
        deltaPct: previousTotalCents > 0 ? Math.round((deltaCents / previousTotalCents) * 100) : null,
        byWeekday: weekdayOrder(window).map((d) => days[d]),
        bestDay: best ? { dow: best.dow, services: best.services, totalCents: best.totalCents } : null,
    };
}

/** Qué parte del periodo ya tiene recibo de pago. Un recibo cubre un periodo de pago. */
export function buildPayout(window: PeriodWindow, settlements: SettlementInput[], now: Date): Payout {
    const inRange = settlements.filter((s) => s.status === 'paid' && s.period_start >= window.startDay && s.period_start <= window.endDay);
    const receipts = inRange.map((s) => ({ id: s.id, number: s.receipt_number, paidAt: s.paid_at, totalCents: toCents(s.total_amount) }));
    const paidCents = receipts.reduce((sum, r) => sum + r.totalCents, 0);
    const status: PayoutStatus = receipts.length > 0 ? 'paid' : now.getTime() >= Date.parse(window.end) ? 'closed' : 'open';
    return { status, paidCents, receipts };
}

// ---------------------------------------------------------------------------------------------
// Servicios, propinas y clientes
// ---------------------------------------------------------------------------------------------

export interface ServicesSummary {
    count: number;
    previousCount: number;
    weekCount: number;
    /** Servicios de la semana pasada completa (para comparar el podio de esta semana). */
    lastWeekCount: number;
    monthCount: number;
    avgTicketCents: number;
    top: { name: string; count: number }[];
    products: { revenueCents: number; lines: number; items: { name: string; count: number }[] };
}

const num = (v: number | string | null | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0);

export function buildServices(
    current: ReportInput, previous: ReportInput, counts: { week: number; lastWeek: number; month: number },
): ServicesSummary {
    const b = current.barber;
    const count = num(b?.cuts);
    const serviceCents = toCents(b?.service_revenue);
    const top = [...(b?.service_breakdown ?? [])]
        .map((s) => ({ name: s.name, count: num(s.count) }))
        .sort((a, c) => c.count - a.count || a.name.localeCompare(c.name, 'es'))
        .slice(0, 5);

    const productNames = new Map<string, number>();
    let lines = 0;
    for (const sale of current.sales) {
        for (const item of sale.items) {
            if (item.item_type !== 'product') continue;
            lines += 1;
            productNames.set(item.item_name, (productNames.get(item.item_name) ?? 0) + 1);
        }
    }
    return {
        count,
        previousCount: num(previous.barber?.cuts),
        weekCount: counts.week,
        lastWeekCount: counts.lastWeek,
        monthCount: counts.month,
        // Sin servicios no hay ticket: nunca se divide entre cero.
        avgTicketCents: count > 0 ? Math.round(serviceCents / count) : 0,
        top,
        products: {
            revenueCents: toCents(b?.product_revenue),
            lines,
            items: [...productNames.entries()].map(([name, n]) => ({ name, count: n })).sort((a, c) => c.count - a.count || a.name.localeCompare(c.name, 'es')),
        },
    };
}

export interface TipsSummary {
    totalCents: number;
    count: number;
    avgCents: number;
    /** Servicios (ventas) que dejaron propina, y de cuántos servicios del periodo. */
    salesWithTip: number;
    services: number;
    previousTotalCents: number;
}

export function buildTips(tips: TipInput[], previousTips: TipInput[], services: number): TipsSummary {
    const totalCents = tips.reduce((sum, t) => sum + toCents(t.amount), 0);
    return {
        totalCents,
        count: tips.length,
        avgCents: tips.length > 0 ? Math.round(totalCents / tips.length) : 0,
        salesWithTip: new Set(tips.map((t) => t.sale_id)).size,
        services,
        previousTotalCents: previousTips.reduce((sum, t) => sum + toCents(t.amount), 0),
    };
}

export interface ClientsSummary {
    /** Visitas completadas en el periodo. */
    visits: number;
    /** Clientes registrados distintos. */
    unique: number;
    /** Visitas sin cliente registrado. */
    unregistered: number;
    /** Clientes registrados que ya habían venido con este barbero (antes o dentro del periodo). */
    repeat: number;
    recent: { id: string; name: string; service: string | null; at: string }[];
}

const startOf = (a: AppointmentInput) => a.scheduled_start_at ?? a.created_at ?? '';

export function buildClients(rows: AppointmentInput[], window: TimeWindow, recentLimit = 6): ClientsSummary {
    const done = rows.filter((a) => a.status === 'completed' && startOf(a));
    const start = Date.parse(window.start);
    const end = Date.parse(window.end);
    const inPeriod = done.filter((a) => { const t = Date.parse(startOf(a)); return t > start && t <= end; })
        .sort((a, b) => startOf(b).localeCompare(startOf(a)));

    const periodClients = new Set(inPeriod.map((a) => a.client_id).filter((id): id is string => Boolean(id)));
    const repeat = [...periodClients].filter((id) => {
        const visits = done.filter((a) => a.client_id === id);
        return visits.length >= 2; // otra visita en el periodo o en los días anteriores que se consultaron
    }).length;

    return {
        visits: inPeriod.length,
        unique: periodClients.size,
        unregistered: inPeriod.filter((a) => !a.client_id).length,
        repeat,
        recent: inPeriod.slice(0, recentLimit).map((a) => ({
            id: a.id, name: a.clients?.full_name ?? a.customer_name, service: a.notes?.trim() || null, at: startOf(a),
        })),
    };
}

// ---------------------------------------------------------------------------------------------
// Hoy
// ---------------------------------------------------------------------------------------------

const OPEN_STATUSES: AppointmentStatus[] = ['scheduled', 'confirmed', 'checked_in', 'in_progress'];
const DEFAULT_MINUTES = 30;

export interface TodayAppointment {
    id: string; start: string; end: string | null; client: string; service: string | null; status: AppointmentStatus; walkIn: boolean;
}
export interface TodaySummary {
    appointments: TodayAppointment[];
    attended: number;
    /** Citas que siguen por atender (agendadas, confirmadas, ya llegó o en servicio). */
    pending: number;
    next: TodayAppointment | null;
    /** Minutos que faltan para `next`; 0 o negativo si ya empezó o debería haber empezado. */
    minutesToNext: number | null;
}

export function buildToday(rows: AppointmentInput[], now: Date): TodaySummary {
    const appointments: TodayAppointment[] = rows
        .filter((a) => startOf(a))
        .map((a) => ({
            id: a.id, start: startOf(a), end: a.scheduled_end_at, client: a.clients?.full_name ?? a.customer_name,
            service: a.notes?.trim() || null, status: a.status, walkIn: a.source === 'walk_in',
        }))
        .sort((a, b) => a.start.localeCompare(b.start));

    const endMs = (a: TodayAppointment) => (a.end ? Date.parse(a.end) : Date.parse(a.start) + DEFAULT_MINUTES * 60_000);
    // La próxima: la que está en servicio o la primera que aún no termina su horario.
    const next = appointments.find((a) => OPEN_STATUSES.includes(a.status) && endMs(a) > now.getTime()) ?? null;
    return {
        appointments,
        attended: appointments.filter((a) => a.status === 'completed').length,
        pending: appointments.filter((a) => OPEN_STATUSES.includes(a.status)).length,
        next,
        minutesToNext: next ? Math.ceil((Date.parse(next.start) - now.getTime()) / 60_000) : null,
    };
}

// ---------------------------------------------------------------------------------------------
// Todo junto
// ---------------------------------------------------------------------------------------------

export interface MyWeek {
    period: Period;
    window: PeriodWindow;
    serviceRatePct: number;
    earnings: Earnings;
    payout: Payout;
    services: ServicesSummary;
    tips: TipsSummary;
    clients: ClientsSummary;
    today: TodaySummary;
    receipts: { id: string; number: string; weekStart: string; weekEnd: string; paidAt: string | null; totalCents: number }[];
    /** false: esta persona no ve recibos de pago (canSeePayReceipts); el servidor ni siquiera los consulta. */
    receiptsVisible: boolean;
}

export function buildMyWeek(input: {
    window: PeriodWindow;
    now: Date;
    serviceRatePct: number;
    current: ReportInput;
    previous: ReportInput;
    counts: { week: number; lastWeek: number; month: number };
    tips: TipInput[];
    previousTips: TipInput[];
    settlements: SettlementInput[];
    recentSettlements: SettlementInput[];
    clientRows: AppointmentInput[];
    todayRows: AppointmentInput[];
    /** Por omisión true; el servidor pasa false cuando quien pide no puede ver recibos. */
    receiptsVisible?: boolean;
}): MyWeek {
    const services = buildServices(input.current, input.previous, input.counts);
    return {
        period: input.window.period,
        window: input.window,
        serviceRatePct: input.serviceRatePct,
        earnings: buildEarnings(input.window, input.current, input.previous, input.tips, input.previousTips),
        payout: buildPayout(input.window, input.settlements, input.now),
        services,
        tips: buildTips(input.tips, input.previousTips, services.count),
        clients: buildClients(input.clientRows, input.window),
        today: buildToday(input.todayRows, input.now),
        receiptsVisible: input.receiptsVisible ?? true,
        receipts: input.recentSettlements.filter((s) => s.status === 'paid').map((s) => ({
            id: s.id, number: s.receipt_number, weekStart: s.period_start, weekEnd: s.period_end, paidAt: s.paid_at, totalCents: toCents(s.total_amount),
        })),
    };
}
