import { formatMoney } from '@/lib/utils/money';

/**
 * Punto de equilibrio: forma de los datos que entrega la base (public.break_even_period, vía GET /api/break-even)
 * y la lógica de presentación (mensajes, redondeos y tono). Funciones puras: se prueban sin pantalla.
 * Todas las cuentas viven en la base; aquí solo se decide CÓMO decirlo. Tono: logros que se cumplen, nunca deuda.
 */

export type MonthStatus = 'past' | 'current' | 'future';

export interface FixedItem {
    key: string;
    kind: 'template' | 'wages';
    id: string | null;
    name: string;
    category_name: string | null;
    /** Monto capturado (p. ej. $1,000 de luz cada 2 meses). */
    base_amount: number;
    every_months: number;
    /** Monto que le toca a este mes (base ÷ every_months). */
    amount: number;
    sort_order: number;
    is_estimate: boolean;
    day_of_month: number | null;
}

export interface Bucket extends FixedItem {
    filled: number;
    pct: number;
    complete: boolean;
}

export interface Per100Item { key: string; label: string; amount: number; kind: 'variable' | 'fixed' }

export interface BreakEvenData {
    month: string;
    month_start: string;
    month_end: string;
    today: string;
    status: MonthStatus;
    is_closed: boolean;
    days_in_month: number;
    days_elapsed: number;
    days_left: number;
    needs_setup: boolean;
    fixed: {
        total: number;
        templates_total: number;
        templates_count: number;
        has_estimates: boolean;
        wages: { total: number; to_date: number; projected: number; paid_days: number; projected_days: number; people: number };
        items: FixedItem[];
    };
    month_to_date: {
        from: string; to: string; revenue: number; commissions: number; product_cost: number; margin: number;
        services: number; sales: number; days_with_sales: number; units_without_cost: number; finance_profit: number;
    };
    reference: {
        from: string | null; to: string; window_days: number; min_days: number; days_with_sales: number; calendar_days: number;
        enough_data: boolean; revenue: number; commissions: number; product_cost: number; margin: number; services: number;
        services_per_day: number | null; margin_per_day: number | null;
    };
    last_7_days: {
        from: string; to: string; revenue: number; margin: number; services: number; days_with_sales: number;
        services_per_day: number; margin_per_day: number;
    };
    derived: {
        margin_per_100: number | null;
        goal_revenue: number | null;
        progress_pct: number | null;
        covered: boolean;
        covered_amount: number;
        remaining: number;
        avg_margin_per_service: number | null;
        services_goal_approx: number | null;
        services_remaining_approx: number | null;
        services_per_day_needed: number | null;
        services_per_day_recent: number | null;
        services_per_day_reference: number | null;
        projected_cover_date: string | null;
        projected_within_month: boolean;
        covered_on: string | null;
        covered_day: number | null;
        profit_above: number | null;
    };
    buckets: Bucket[];
    per_100: { source: 'month' | 'reference'; approximate: boolean; monthly_revenue_basis: number; items: Per100Item[]; left: number } | null;
}

/** Lo que entrega la API: los datos más si quien mira puede editar los gastos fijos (solo la cuenta principal). */
export interface BreakEvenResponse extends BreakEvenData { can_edit: boolean }

// ── Normalización (la base manda numeric; aquí todo número es number) ─────────────────────────────────
const n = (v: unknown): number => {
    const x = Number(v ?? 0);
    return Number.isFinite(x) ? x : 0;
};
const nn = (v: unknown): number | null => (v === null || v === undefined ? null : n(v));
type Raw = Record<string, unknown>;
const obj = (v: unknown): Raw => (v && typeof v === 'object' ? (v as Raw) : {});

function item(raw: unknown): FixedItem {
    const r = obj(raw);
    return {
        key: String(r.key ?? r.id ?? ''),
        kind: r.kind === 'wages' ? 'wages' : 'template',
        id: typeof r.id === 'string' ? r.id : null,
        name: String(r.name ?? ''),
        category_name: typeof r.category_name === 'string' ? r.category_name : null,
        base_amount: n(r.base_amount),
        every_months: Math.max(1, n(r.every_months) || 1),
        amount: n(r.amount),
        sort_order: n(r.sort_order),
        is_estimate: Boolean(r.is_estimate),
        day_of_month: nn(r.day_of_month),
    };
}

export function normalizeBreakEven(raw: unknown): BreakEvenData {
    const r = obj(raw);
    const fixed = obj(r.fixed);
    const wages = obj(fixed.wages);
    const mtd = obj(r.month_to_date);
    const ref = obj(r.reference);
    const l7 = obj(r.last_7_days);
    const d = obj(r.derived);
    const p = r.per_100 ? obj(r.per_100) : null;
    return {
        month: String(r.month ?? ''),
        month_start: String(r.month_start ?? ''),
        month_end: String(r.month_end ?? ''),
        today: String(r.today ?? ''),
        status: r.status === 'past' || r.status === 'future' ? r.status : 'current',
        is_closed: Boolean(r.is_closed),
        days_in_month: n(r.days_in_month),
        days_elapsed: n(r.days_elapsed),
        days_left: n(r.days_left),
        needs_setup: Boolean(r.needs_setup),
        fixed: {
            total: n(fixed.total),
            templates_total: n(fixed.templates_total),
            templates_count: n(fixed.templates_count),
            has_estimates: Boolean(fixed.has_estimates),
            wages: {
                total: n(wages.total), to_date: n(wages.to_date), projected: n(wages.projected),
                paid_days: n(wages.paid_days), projected_days: n(wages.projected_days), people: n(wages.people),
            },
            items: Array.isArray(fixed.items) ? fixed.items.map(item) : [],
        },
        month_to_date: {
            from: String(mtd.from ?? ''), to: String(mtd.to ?? ''), revenue: n(mtd.revenue), commissions: n(mtd.commissions),
            product_cost: n(mtd.product_cost), margin: n(mtd.margin), services: n(mtd.services), sales: n(mtd.sales),
            days_with_sales: n(mtd.days_with_sales), units_without_cost: n(mtd.units_without_cost), finance_profit: n(mtd.finance_profit),
        },
        reference: {
            from: typeof ref.from === 'string' ? ref.from : null, to: String(ref.to ?? ''), window_days: n(ref.window_days) || 28,
            min_days: n(ref.min_days) || 14, days_with_sales: n(ref.days_with_sales), calendar_days: n(ref.calendar_days),
            enough_data: Boolean(ref.enough_data), revenue: n(ref.revenue), commissions: n(ref.commissions),
            product_cost: n(ref.product_cost), margin: n(ref.margin), services: n(ref.services),
            services_per_day: nn(ref.services_per_day), margin_per_day: nn(ref.margin_per_day),
        },
        last_7_days: {
            from: String(l7.from ?? ''), to: String(l7.to ?? ''), revenue: n(l7.revenue), margin: n(l7.margin), services: n(l7.services),
            days_with_sales: n(l7.days_with_sales), services_per_day: n(l7.services_per_day), margin_per_day: n(l7.margin_per_day),
        },
        derived: {
            margin_per_100: nn(d.margin_per_100),
            goal_revenue: nn(d.goal_revenue),
            progress_pct: nn(d.progress_pct),
            covered: Boolean(d.covered),
            covered_amount: n(d.covered_amount),
            remaining: n(d.remaining),
            avg_margin_per_service: nn(d.avg_margin_per_service),
            services_goal_approx: nn(d.services_goal_approx),
            services_remaining_approx: nn(d.services_remaining_approx),
            services_per_day_needed: nn(d.services_per_day_needed),
            services_per_day_recent: nn(d.services_per_day_recent),
            services_per_day_reference: nn(d.services_per_day_reference),
            projected_cover_date: typeof d.projected_cover_date === 'string' ? d.projected_cover_date : null,
            projected_within_month: Boolean(d.projected_within_month),
            covered_on: typeof d.covered_on === 'string' ? d.covered_on : null,
            covered_day: nn(d.covered_day),
            profit_above: nn(d.profit_above),
        },
        buckets: Array.isArray(r.buckets) ? r.buckets.map((b) => {
            const o = obj(b);
            return { ...item(b), filled: n(o.filled), pct: n(o.pct), complete: Boolean(o.complete) };
        }) : [],
        per_100: p ? {
            source: p.source === 'month' ? 'month' : 'reference',
            approximate: Boolean(p.approximate),
            monthly_revenue_basis: n(p.monthly_revenue_basis),
            items: Array.isArray(p.items) ? p.items.map((x) => {
                const o = obj(x);
                return { key: String(o.key ?? ''), label: String(o.label ?? ''), amount: n(o.amount), kind: o.kind === 'fixed' ? 'fixed' : 'variable' };
            }) : [],
            left: n(p.left),
        } : null,
    };
}

// ── Redondeos ─────────────────────────────────────────────────────────────────────────────────────────
const int = new Intl.NumberFormat('es-MX', { maximumFractionDigits: 0 });

/** "unos N": cantidad aproximada de servicios, siempre hacia arriba y entera (nunca "unos 0.4"). */
export function approxCount(value: number | null | undefined): number {
    if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return 0;
    return Math.ceil(value - 1e-9);
}

export function unosText(value: number | null | undefined, singular = 'servicio', plural = 'servicios'): string {
    const c = approxCount(value);
    if (c === 0) return `0 ${plural}`;
    return `unos ${int.format(c)} ${c === 1 ? singular : plural}`;
}

/** Ritmo diario real: entero si es 1 o más ("13"); con un decimal si es menor ("0.6"). */
export function paceText(value: number | null | undefined): string {
    if (value === null || value === undefined || !Number.isFinite(value) || value <= 0) return '0';
    if (value < 1) return (Math.round(value * 10) / 10).toLocaleString('es-MX');
    return int.format(Math.round(value));
}

/**
 * Porcentaje del avance para leer: entero hacia abajo (nunca dice 100 % si aún no se cubre); "menos de 1" si es
 * mayor que 0 y menor que 1.
 */
export function progressText(pct: number | null | undefined, covered = false): string {
    if (pct === null || pct === undefined || !Number.isFinite(pct) || pct <= 0) return '0 %';
    if (covered) return `${int.format(Math.floor(pct))} %`;
    if (pct < 1) return 'menos del 1 %';
    return `${int.format(Math.min(99, Math.floor(pct)))} %`;
}

/** Avance del anillo, de 0 a 1 (tope en 1). */
export function ringFraction(pct: number | null | undefined): number {
    if (pct === null || pct === undefined || !Number.isFinite(pct) || pct <= 0) return 0;
    return Math.min(1, pct / 100);
}

// ── Mensajes ──────────────────────────────────────────────────────────────────────────────────────────
export type ProgressTier = 'setup' | 'start' | 'building' | 'over_half' | 'almost' | 'covered';

export function progressTier(data: Pick<BreakEvenData, 'needs_setup' | 'derived' | 'fixed'>): ProgressTier {
    if (data.needs_setup || data.fixed.total <= 0) return 'setup';
    if (data.derived.covered) return 'covered';
    const pct = data.derived.progress_pct ?? 0;
    if (pct >= 90) return 'almost';
    if (pct >= 50) return 'over_half';
    if (pct >= 20) return 'building';
    return 'start';
}

/**
 * Tono del encabezado. Nunca rojo: 'accent' (bronce, el de siempre), 'success' (mes cubierto) y, solo a partir del
 * día 25 de un mes en curso que no se cubrirá a este ritmo, 'attention' (ámbar suave, con un mensaje que anima).
 */
export type Tone = 'accent' | 'success' | 'attention';

export function dayOfMonth(isoDate: string): number {
    const d = Number(isoDate.slice(8, 10));
    return Number.isFinite(d) ? d : 0;
}

export function heroTone(data: BreakEvenData): Tone {
    if (data.derived.covered) return 'success';
    if (data.status === 'current' && dayOfMonth(data.today) >= 25 && !data.derived.projected_within_month && !data.needs_setup) return 'attention';
    return 'accent';
}

export interface HeroMessage { title: string; detail: string | null; learning: boolean }

const MONTHS = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];

export function monthName(month: string): string {
    const [y, m] = month.split('-').map(Number);
    return `${MONTHS[(m || 1) - 1]} ${y}`;
}

/** "19 de noviembre". */
export function dayName(isoDate: string): string {
    const m = Number(isoDate.slice(5, 7));
    return `${dayOfMonth(isoDate)} de ${MONTHS[(m || 1) - 1]}`;
}

export function heroMessage(data: BreakEvenData): HeroMessage {
    const tier = progressTier(data);
    const d = data.derived;
    const learning = !data.reference.enough_data;
    if (tier === 'setup') {
        return { title: 'Captura tus gastos fijos para empezar', detail: 'Renta, luz, internet… Con eso calculamos cuánto falta para cubrir el mes y desde cuándo todo es ganancia.', learning };
    }
    if (tier === 'covered') {
        const day = d.covered_day ?? dayOfMonth(d.covered_on ?? data.today);
        const above = formatMoney(d.profit_above ?? 0);
        if (data.status === 'past') {
            return { title: `¡Mes cubierto el día ${day}!`, detail: `Después de cubrir los gastos fijos, la operación dejó ${above} más.`, learning: false };
        }
        return { title: `¡Mes cubierto el día ${day}!`, detail: `Todo lo de aquí en adelante es ganancia: llevas ${above}.`, learning: false };
    }
    const pctText = progressText(d.progress_pct);
    if (data.status === 'future') {
        return { title: `Así se ve ${monthName(data.month)}`, detail: `Para cubrirlo hacen falta ${formatMoney(data.fixed.total)} de margen.`, learning };
    }
    if (data.status === 'past') {
        return { title: `El mes cerró con el ${pctText} cubierto`, detail: `La operación dejó ${formatMoney(data.month_to_date.margin)} para ${formatMoney(data.fixed.total)} de gastos fijos.`, learning };
    }
    const title = tier === 'almost' ? `¡Ya casi! Llevas el ${pctText} del mes cubierto`
        : tier === 'over_half' ? `¡Más de la mitad! Llevas el ${pctText} del mes cubierto`
            : `Llevas cubierto el ${pctText} del mes`;
    if (learning || d.services_remaining_approx === null) {
        return { title, detail: `Te faltan ${formatMoney(d.remaining)} de margen para cubrirlo todo.`, learning: true };
    }
    const services = unosText(d.services_remaining_approx);
    const detail = tier === 'start' && data.month_to_date.sales === 0
        ? `El mes apenas empieza: te faltan ${services} para cubrirlo todo.`
        : `Te faltan ${services} para cubrirlo todo.`;
    return { title, detail, learning: false };
}

/** Lo que se dice mientras no hay 14 días con ventas, con lo que sí se sabe. */
export function learningText(data: BreakEvenData): string {
    const ref = data.reference;
    const faltan = Math.max(0, ref.min_days - ref.days_with_sales);
    return `Aún estamos aprendiendo tu ritmo: llevamos ${ref.days_with_sales} ${ref.days_with_sales === 1 ? 'día' : 'días'} con ventas; `
        + `con ${faltan} ${faltan === 1 ? 'día' : 'días'} más te diremos cuántos servicios faltan.`;
}

/** "Para cubrir el mes necesitas unos N servicios al día; esta semana vas en M." Sin datos suficientes: null. */
export function paceMessage(data: BreakEvenData): { needed: string; recent: string; text: string; ahead: boolean } | null {
    const d = data.derived;
    if (data.status !== 'current' || d.covered || !data.reference.enough_data || d.services_per_day_needed === null) return null;
    const needed = approxCount(d.services_per_day_needed);
    const recent = d.services_per_day_recent ?? 0;
    const recentText = paceText(recent);
    const ahead = recent >= needed;
    const neededText = `unos ${int.format(needed)} ${needed === 1 ? 'servicio' : 'servicios'} al día`;
    return {
        needed: neededText,
        recent: recentText,
        ahead,
        text: `Para cubrir el mes necesitas ${neededText}; esta semana vas en ${recentText}.`,
    };
}

/** Día estimado en que se cubre el mes al ritmo de los últimos 7 días (solo si cae dentro del mes). */
export function projectionText(data: BreakEvenData): string | null {
    const d = data.derived;
    if (data.status !== 'current' || d.covered || !d.projected_within_month || !d.projected_cover_date) return null;
    return `A este ritmo, el mes queda cubierto alrededor del ${dayName(d.projected_cover_date)}.`;
}

/** Monto de un gasto fijo para leer: "$1,000 cada 2 meses · $500 al mes". */
export function periodText(item: Pick<FixedItem, 'base_amount' | 'every_months' | 'amount' | 'kind'>): string {
    if (item.kind === 'wages') return 'Sueldo por día de recepción, mes completo';
    if (item.every_months <= 1) return `${formatMoney(item.base_amount)} al mes`;
    return `${formatMoney(item.base_amount)} cada ${item.every_months} meses · ${formatMoney(item.amount)} al mes`;
}

/** Mes anterior o siguiente de "AAAA-MM". */
export function shiftMonth(month: string, delta: number): string {
    const [y, m] = month.split('-').map(Number);
    const total = y * 12 + (m - 1) + delta;
    return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, '0')}`;
}

/** "De cada $100 que entran": barras en pesos, "te queda" nunca negativo (si no alcanza, se dice aparte). */
export function per100Rows(data: BreakEvenData): { rows: (Per100Item & { share: number })[]; left: number; short: number } | null {
    const p = data.per_100;
    if (!p) return null;
    const rows = p.items.filter((i) => i.amount > 0).map((i) => ({ ...i, share: i.amount }));
    const left = Math.max(0, Math.round(p.left * 10) / 10);
    const short = p.left < 0 ? Math.round(-p.left * 10) / 10 : 0;
    return { rows, left, short };
}

/** Resumen de una línea para el Panel. */
export function summaryLine(data: BreakEvenData): string {
    const tier = progressTier(data);
    const d = data.derived;
    if (tier === 'setup') return 'Captura tus gastos fijos para ver cuánto falta para cubrir el mes.';
    if (tier === 'covered') return `¡Mes cubierto el día ${d.covered_day ?? dayOfMonth(d.covered_on ?? data.today)}! Llevas ${formatMoney(d.profit_above ?? 0)} de ganancia.`;
    const pct = progressText(d.progress_pct);
    if (!data.reference.enough_data || d.services_remaining_approx === null) return `Mes cubierto al ${pct} · faltan ${formatMoney(d.remaining)} de margen.`;
    return `Mes cubierto al ${pct} · faltan ${unosText(d.services_remaining_approx)}.`;
}

/** Pesos de un reparto de cada $100 ("$45.0" → "$45"). */
export function per100Money(amount: number): string {
    return `$${(Math.round(amount * 10) / 10).toLocaleString('es-MX', { maximumFractionDigits: 1 })}`;
}
