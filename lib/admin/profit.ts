// Utilidad real del periodo (Administración): estado de resultados de solo lectura.
// Funciones puras: reciben filas ya leídas de la base y no tocan la red.
//
// Reglas, tomadas del código vigente (no son políticas nuevas):
// - Ingresos = sale_items.line_total de ventas con status 'paid' cobradas (paid_at) en el periodo.
//   line_total ya es neto del descuento del renglón (CHECK line_total = quantity * unit_price - discount_amount,
//   supabase/migrations/20261028003850_initial_sonblade_schema.sql). El descuento de la venta es la suma de
//   los descuentos de sus renglones, así que no se vuelve a restar.
// - Anuladas: reverse_sale deja la venta en 'refunded' y sus comisiones en 'reversed'
//   (20261029210903_commission_settlement_and_sale_reversal.sql). Se excluyen ventas que no estén en 'paid'
//   y comisiones que no estén en 'generated'; como las comisiones se toman solo de las ventas incluidas,
//   una venta anulada no aporta ni ingreso ni comisión.
// - Propinas: viven en sale_tips, fuera de sales.total_amount y de line_total
//   (20261115002355_sale_tips_and_discount_authorization.sql). Se cobran al cliente y se entregan íntegras
//   al barbero en su recibo semanal, así que NO son ingreso del negocio y tampoco se restan: entran y salen
//   por el mismo importe. Se muestran aparte solo como dato. Restarlas aquí las descontaría dos veces,
//   porque nunca se sumaron a los ingresos.
// - Costo de producto: cantidad × sale_items.unit_cost_snapshot, el costo guardado al momento de vender
//   (20261115200027_sale_item_unit_cost_snapshot.sql), para que cambiar un costo no altere periodos pasados.
//   Si el renglón no lo trae, se usa el costo actual del producto como respaldo. Si tampoco hay (null),
//   no se asume cero: se cuenta en productsWithoutCost.
// - Gastos: expenses con status 'posted' por fecha incurred_at, agrupados por categoría.
// - Costos de personal (public.staff_cost_lines, la MISMA fuente que private.report_financial_period):
//   * Sueldos por día (20261120090000_daily_wages): costo DEVENGADO por día trabajado (fijo no faltado o extra),
//     en su día del negocio y solo si ese día ya empezó; concepto "Sueldos", aparte de comisiones.
//   * Bonos por metas (20261120052000): costo con fecha del cierre de su periodo de pago (desde el 19 nov 2026, jueves 00:00).
//   Sin `staffCosts` (o vacío) la utilidad queda exactamente como antes.
// - Dinero en centavos enteros; se convierte a pesos solo al entregar el resultado.
//
// Ampliación (tablero financiero), de dónde sale cada dato:
// - Barbero de cada renglón de servicio: sale_items.employee_id. En productos, sale_items.commission_employee_id
//   (quien vendió, por ejemplo recepción); si no hay, la venta de producto queda "Sin asignar".
// - Dueño de cada comisión: commission_entries.employee_id. De cada propina: sale_tips.employee_id.
// - Método de cada propina: sale_tips.method. Método de cada cobro: payments.method (solo status 'confirmed').
// - Día de cada venta: sales.paid_at; de cada gasto: expenses.incurred_at; ambos en la hora de la barbería,
//   nunca en UTC. Las propinas no entran en la serie por día porque no son ingreso ni egreso.

import { addDays } from '@/lib/settlements/week';

export type SaleRow = { id: string; status: string; paid_at: string | null };
export type SaleItemRow = {
    id: string;
    sale_id: string;
    item_type: 'service' | 'product';
    product_id: string | null;
    item_name_snapshot: string;
    quantity: number | string;
    discount_amount: number | string;
    line_total: number | string;
    unit_cost_snapshot?: number | string | null;
    employee_id?: string | null;
    commission_employee_id?: string | null;
};
export type CommissionRow = { sale_id: string; sale_item_id: string; commission_amount: number | string; status: string; employee_id?: string | null };
export type TipRow = { sale_id: string; amount: number | string; status: string; employee_id?: string | null; method?: string | null };
export type PaymentRow = { sale_id: string; method: string; amount: number | string; status: string };
export type EmployeeRow = { id: string; display_name: string };
export type ProductCostRow = { id: string; name: string; cost_price: number | string | null };
export type ExpenseRow = { amount: number | string; category: string | null; status: string; incurred_at?: string | null };
/** Renglón de public.staff_cost_lines: sueldo devengado de un día o bono de una semana. */
export type StaffCostRow = { employee_id: string | null; kind: string; cost_date: string; amount: number | string };

export type ProfitInput = {
    sales: SaleRow[];
    items: SaleItemRow[];
    commissions: CommissionRow[];
    tips: TipRow[];
    products: ProductCostRow[];
    expenses: ExpenseRow[];
    /** Cobros de las ventas. Sin esto, payments sale vacío. */
    payments?: PaymentRow[];
    employees?: EmployeeRow[];
    /** Sueldos devengados y bonos del periodo (public.staff_cost_lines). */
    staffCosts?: StaffCostRow[];
    /** Periodo y zona horaria: sin esto no se arma la serie por día. */
    period?: { from: string; to: string; timezone: string };
};

export type MethodTotal = { method: string; total: number; count: number };
export type BarberRow = {
    employeeId: string | null;
    name: string;
    /** Ventas netas de descuento que generó (servicios + productos). */
    sales: number;
    services: number;
    products: number;
    serviceUnits: number;
    commission: number;
    /** Costo de los productos que vendió. */
    productCost: number;
    /** Sueldo por día devengado en el periodo. */
    wage: number;
    /** Bonos por metas del periodo. */
    bonus: number;
    /** Lo que deja al negocio: ventas − comisión − costo de sus productos − sueldo − bonos (antes de gastos generales). */
    keeps: number;
    /** Propinas: son suyas al 100 %, no entran en lo anterior. */
    tips: number;
    tipCount: number;
};
export type DailyRow = {
    date: string; revenue: number; commissions: number; productCost: number; expenses: number;
    /** Sueldos devengados ese día y bonos fechados ese día. */
    wages: number; bonuses: number;
    outflow: number; net: number;
};

export type ProfitStatement = {
    revenue: { services: number; products: number; total: number; discounts: number };
    commissions: { services: number; products: number; total: number };
    tips: { total: number; count: number; byBarber: { employeeId: string | null; name: string; total: number; count: number }[]; byMethod: MethodTotal[] };
    productCost: { total: number; unitsWithoutCost: number; missing: { productId: string; name: string; units: number }[] };
    productsWithoutCost: number;
    expenses: { total: number; byCategory: { category: string; total: number; count: number }[] };
    /** Sueldos por día devengados (concepto "Sueldos", aparte de comisiones). */
    wages: { total: number; days: number; byEmployee: { employeeId: string | null; name: string; total: number; days: number }[] };
    /** Bonos por metas. */
    bonuses: { total: number; count: number };
    profit: number;
    /** Utilidad / ingresos × 100, a un decimal. null si no hubo ingresos (no se divide entre cero). */
    marginPct: number | null;
    counts: { sales: number; voidedExcluded: number; serviceUnits: number; productUnits: number };
    barbers: BarberRow[];
    /** Una fila por cada día del periodo (también los de cero). Vacío si no se indicó periodo. */
    daily: DailyRow[];
    /** Cobros de ventas por método de pago (efectivo, tarjeta, transferencia y, si hubo, otro). */
    payments: { total: number; byMethod: (MethodTotal & { sharePct: number | null })[] };
};

export type Delta = { current: number; previous: number; delta: number; /** null si el periodo anterior vale cero (sin base). */ pct: number | null };
export type PeriodComparison = {
    period: { from: string; to: string };
    /** false si el periodo anterior no tuvo ventas cobradas ni gastos. */
    hasBase: boolean;
    revenue: Delta; profit: Delta; expenses: Delta; commissions: Delta; tips: Delta; wages: Delta;
};

export type ProfitReport = ProfitStatement & { period: { from: string; to: string; timezone: string }; comparison: PeriodComparison };

/** Pesos (número o texto de numeric) a centavos enteros. */
export function toCents(value: number | string | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export const fromCents = (cents: number) => cents / 100;

const VOIDED = new Set(['refunded', 'partially_refunded']);

const METHODS = ['cash', 'card', 'transfer'] as const;
const NO_EMPLOYEE = '\u0000sin-asignar';

/** Día 'YYYY-MM-DD' de un instante en la zona horaria de la barbería. */
export function businessDayKey(iso: string, timeZone: string): string {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** Todos los días 'YYYY-MM-DD' entre dos fechas, ambos incluidos. */
export function eachDay(from: string, to: string): string[] {
    const days: string[] = [];
    for (let d = from; d <= to && days.length <= MAX_RANGE_DAYS; d = addDays(d, 1)) days.push(d);
    return days;
}

function methodTotals(rows: { method: string; cents: number }[]): { method: string; cents: number; count: number }[] {
    const map = new Map<string, { method: string; cents: number; count: number }>(METHODS.map((m) => [m, { method: m, cents: 0, count: 0 }]));
    for (const r of rows) {
        const entry = map.get(r.method) ?? { method: r.method, cents: 0, count: 0 };
        entry.cents += r.cents;
        entry.count += 1;
        map.set(r.method, entry);
    }
    return [...map.values()].filter((m) => METHODS.includes(m.method as (typeof METHODS)[number]) || m.cents !== 0);
}

export function computeProfit(input: ProfitInput): ProfitStatement {
    const paidSales = new Set(input.sales.filter((s) => s.status === 'paid').map((s) => s.id));
    const voidedExcluded = input.sales.filter((s) => VOIDED.has(s.status)).length;

    const items = input.items.filter((i) => paidSales.has(i.sale_id));
    const itemType = new Map(items.map((i) => [i.id, i.item_type]));
    const names = new Map((input.employees ?? []).map((e) => [e.id, e.display_name]));
    type Acc = {
        services: number; products: number; serviceUnits: number; commission: number; productCost: number; tips: number; tipCount: number;
        wage: number; wageDays: number; bonus: number;
    };
    const accs = new Map<string, Acc>();
    const acc = (employeeId: string | null | undefined): Acc => {
        const key = employeeId || NO_EMPLOYEE;
        let a = accs.get(key);
        if (!a) { a = { services: 0, products: 0, serviceUnits: 0, commission: 0, productCost: 0, tips: 0, tipCount: 0, wage: 0, wageDays: 0, bonus: 0 }; accs.set(key, a); }
        return a;
    };
    const timezone = input.period?.timezone;
    const days = new Map<string, { revenue: number; commissions: number; productCost: number; expenses: number; wages: number; bonuses: number }>(
        input.period ? eachDay(input.period.from, input.period.to).map((d) => [d, { revenue: 0, commissions: 0, productCost: 0, expenses: 0, wages: 0, bonuses: 0 }]) : []);
    const saleDay = new Map<string, string>();
    if (timezone) for (const s of input.sales) if (s.paid_at && paidSales.has(s.id)) saleDay.set(s.id, businessDayKey(s.paid_at, timezone));
    const day = (saleId: string) => days.get(saleDay.get(saleId) ?? '');

    let serviceRev = 0, productRev = 0, discounts = 0, serviceUnits = 0, productUnits = 0;
    for (const i of items) {
        const qty = Number(i.quantity);
        const cents = toCents(i.line_total);
        if (i.item_type === 'service') {
            serviceRev += cents; serviceUnits += qty;
            const a = acc(i.employee_id); a.services += cents; a.serviceUnits += qty;
        } else {
            productRev += cents; productUnits += qty;
            acc(i.commission_employee_id).products += cents;
        }
        discounts += toCents(i.discount_amount);
        const d = day(i.sale_id); if (d) d.revenue += cents;
    }

    let serviceComm = 0, productComm = 0;
    for (const c of input.commissions) {
        if (c.status !== 'generated' || !paidSales.has(c.sale_id)) continue;
        // La comisión de recepción por productos también cuelga de un renglón de producto.
        const cents = toCents(c.commission_amount);
        if (itemType.get(c.sale_item_id) === 'product') productComm += cents;
        else serviceComm += cents;
        acc(c.employee_id).commission += cents;
        const d = day(c.sale_id); if (d) d.commissions += cents;
    }

    let tipsTotal = 0, tipsCount = 0;
    const tipRows: { method: string; cents: number }[] = [];
    for (const t of input.tips) {
        if (t.status !== 'generated' || !paidSales.has(t.sale_id)) continue;
        const cents = toCents(t.amount);
        tipsTotal += cents;
        tipsCount += 1;
        tipRows.push({ method: t.method ?? 'other', cents });
        const a = acc(t.employee_id); a.tips += cents; a.tipCount += 1;
    }

    const products = new Map(input.products.map((p) => [p.id, p]));
    let cogs = 0, unitsWithoutCost = 0;
    const missing = new Map<string, { productId: string; name: string; units: number }>();
    for (const i of items) {
        if (i.item_type !== 'product') continue;
        const qty = Number(i.quantity);
        const product = i.product_id ? products.get(i.product_id) : undefined;
        const cost = i.unit_cost_snapshot ?? product?.cost_price;
        if (cost === null || cost === undefined || cost === '') {
            unitsWithoutCost += qty;
            const key = i.product_id ?? `sin-producto:${i.item_name_snapshot}`;
            const entry = missing.get(key) ?? { productId: i.product_id ?? '', name: product?.name ?? i.item_name_snapshot, units: 0 };
            entry.units += qty;
            missing.set(key, entry);
            continue;
        }
        const itemCost = Math.round(qty * toCents(cost));
        cogs += itemCost;
        acc(i.commission_employee_id).productCost += itemCost;
        const d = day(i.sale_id); if (d) d.productCost += itemCost;
    }

    const byCategory = new Map<string, { category: string; total: number; count: number }>();
    let expensesTotal = 0;
    for (const e of input.expenses) {
        if (e.status !== 'posted') continue;
        const category = e.category?.trim() || 'General';
        const entry = byCategory.get(category) ?? { category, total: 0, count: 0 };
        const cents = toCents(e.amount);
        entry.total += cents;
        entry.count += 1;
        byCategory.set(category, entry);
        expensesTotal += cents;
        if (timezone && e.incurred_at) { const d = days.get(businessDayKey(e.incurred_at, timezone)); if (d) d.expenses += cents; }
    }

    // Costos de personal: ya vienen filtrados al periodo por la base (mismo criterio que report_financial_period).
    let wagesTotal = 0, wageDays = 0, bonusTotal = 0, bonusCount = 0;
    for (const c of input.staffCosts ?? []) {
        const cents = toCents(c.amount);
        if (cents === 0) continue;
        const d = days.get(c.cost_date);
        if (c.kind === 'wage') {
            wagesTotal += cents; wageDays += 1;
            const a = acc(c.employee_id); a.wage += cents; a.wageDays += 1;
            if (d) d.wages += cents;
        } else if (c.kind === 'bonus') {
            bonusTotal += cents; bonusCount += 1;
            acc(c.employee_id).bonus += cents;
            if (d) d.bonuses += cents;
        }
    }

    let paymentsTotal = 0;
    const paymentRows: { method: string; cents: number }[] = [];
    for (const p of input.payments ?? []) {
        if (p.status !== 'confirmed' || !paidSales.has(p.sale_id)) continue;
        const cents = toCents(p.amount);
        paymentsTotal += cents;
        paymentRows.push({ method: p.method, cents });
    }

    const nameOf = (key: string) => key === NO_EMPLOYEE ? 'Sin asignar' : names.get(key) ?? 'Sin nombre';
    const barbers: BarberRow[] = [...accs.entries()].map(([key, a]) => {
        const sales = a.services + a.products;
        return {
            employeeId: key === NO_EMPLOYEE ? null : key, name: nameOf(key),
            sales: fromCents(sales), services: fromCents(a.services), products: fromCents(a.products), serviceUnits: a.serviceUnits,
            commission: fromCents(a.commission), productCost: fromCents(a.productCost), wage: fromCents(a.wage), bonus: fromCents(a.bonus),
            keeps: fromCents(sales - a.commission - a.productCost - a.wage - a.bonus),
            tips: fromCents(a.tips), tipCount: a.tipCount,
        };
    }).sort((x, y) => y.sales - x.sales || y.tips - x.tips || x.name.localeCompare(y.name, 'es'));
    const tipsByBarber = barbers.filter((b) => b.tipCount > 0)
        .map((b) => ({ employeeId: b.employeeId, name: b.name, total: b.tips, count: b.tipCount }))
        .sort((x, y) => y.total - x.total);

    const revenue = serviceRev + productRev;
    const commissions = serviceComm + productComm;
    const profit = revenue - commissions - bonusTotal - wagesTotal - cogs - expensesTotal;
    const marginPct = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null;

    return {
        revenue: { services: fromCents(serviceRev), products: fromCents(productRev), total: fromCents(revenue), discounts: fromCents(discounts) },
        commissions: { services: fromCents(serviceComm), products: fromCents(productComm), total: fromCents(commissions) },
        tips: {
            total: fromCents(tipsTotal), count: tipsCount, byBarber: tipsByBarber,
            byMethod: methodTotals(tipRows).map((m) => ({ method: m.method, total: fromCents(m.cents), count: m.count })),
        },
        productCost: { total: fromCents(cogs), unitsWithoutCost, missing: [...missing.values()].sort((a, b) => b.units - a.units) },
        productsWithoutCost: missing.size,
        expenses: {
            total: fromCents(expensesTotal),
            byCategory: [...byCategory.values()]
                .sort((a, b) => b.total - a.total)
                .map((c) => ({ ...c, total: fromCents(c.total) })),
        },
        wages: {
            total: fromCents(wagesTotal), days: wageDays,
            byEmployee: [...accs.entries()].filter(([, a]) => a.wageDays > 0)
                .map(([key, a]) => ({ employeeId: key === NO_EMPLOYEE ? null : key, name: nameOf(key), total: fromCents(a.wage), days: a.wageDays }))
                .sort((x, y) => y.total - x.total || x.name.localeCompare(y.name, 'es')),
        },
        bonuses: { total: fromCents(bonusTotal), count: bonusCount },
        profit: fromCents(profit),
        marginPct,
        counts: { sales: paidSales.size, voidedExcluded, serviceUnits, productUnits },
        barbers,
        daily: [...days.entries()].map(([date, d]) => {
            const outflow = d.commissions + d.productCost + d.expenses + d.wages + d.bonuses;
            return {
                date, revenue: fromCents(d.revenue), commissions: fromCents(d.commissions), productCost: fromCents(d.productCost), expenses: fromCents(d.expenses),
                wages: fromCents(d.wages), bonuses: fromCents(d.bonuses), outflow: fromCents(outflow), net: fromCents(d.revenue - outflow),
            };
        }),
        payments: {
            total: fromCents(paymentsTotal),
            byMethod: methodTotals(paymentRows).map((m) => ({
                method: m.method, total: fromCents(m.cents), count: m.count,
                sharePct: paymentsTotal > 0 ? Math.round((m.cents / paymentsTotal) * 1000) / 10 : null,
            })),
        },
    };
}

// ---------- Comparación con el periodo anterior ----------

/** Diferencia en pesos y en %, sobre centavos enteros. pct es null si no hay base (anterior = 0). */
export function compareValues(current: number, previous: number): Delta {
    const cur = toCents(current), prev = toCents(previous);
    return {
        current, previous, delta: fromCents(cur - prev),
        pct: prev === 0 ? null : Math.round(((cur - prev) / Math.abs(prev)) * 1000) / 10,
    };
}

/** Periodo inmediatamente anterior, de la misma duración en días. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
    const days = rangeDays(from, to);
    return { from: addDays(from, -days), to: addDays(from, -1) };
}

export function comparePeriods(current: ProfitStatement, previous: ProfitStatement, period: { from: string; to: string }): PeriodComparison {
    return {
        period,
        hasBase: previous.counts.sales > 0 || previous.expenses.total > 0 || previous.wages.total > 0,
        revenue: compareValues(current.revenue.total, previous.revenue.total),
        profit: compareValues(current.profit, previous.profit),
        expenses: compareValues(current.expenses.total, previous.expenses.total),
        commissions: compareValues(current.commissions.total, previous.commissions.total),
        tips: compareValues(current.tips.total, previous.tips.total),
        wages: compareValues(current.wages.total, previous.wages.total),
    };
}

// ---------- Periodos ----------

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;
export const MAX_RANGE_DAYS = 366;

/** true si 'YYYY-MM-DD' es una fecha de calendario real (rechaza 2026-02-30). */
export function isValidDay(day: string): boolean {
    if (!DAY_RE.test(day)) return false;
    const d = new Date(`${day}T00:00:00Z`);
    return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === day;
}

/** Días del periodo contando ambos extremos. */
export function rangeDays(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000) + 1;
}

export type ProfitPreset = 'week' | 'month' | 'last_month';

/** Rango del atajo a partir del día de hoy del negocio. La semana es de calendario, de domingo a sábado (no es el periodo de pago). */
export function profitPresetRange(preset: ProfitPreset, today: string): { from: string; to: string } {
    if (preset === 'week') {
        const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
        const start = new Date(`${today}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() - dow);
        return { from: start.toISOString().slice(0, 10), to: today };
    }
    if (preset === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
    const firstThisMonth = new Date(`${today.slice(0, 8)}01T00:00:00Z`);
    const lastPrev = new Date(firstThisMonth);
    lastPrev.setUTCDate(0);
    const to = lastPrev.toISOString().slice(0, 10);
    return { from: `${to.slice(0, 8)}01`, to };
}
