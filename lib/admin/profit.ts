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
// - Costo de producto: cantidad × products.cost_price. La venta no guarda una foto del costo
//   (el movimiento de inventario 'sale' se inserta sin unit_cost_snapshot), así que se usa el costo actual
//   del producto. Si falta (null), no se asume cero: se cuenta en productsWithoutCost.
// - Gastos: expenses con status 'posted' por fecha incurred_at, agrupados por categoría.
// - Dinero en centavos enteros; se convierte a pesos solo al entregar el resultado.

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
};
export type CommissionRow = { sale_id: string; sale_item_id: string; commission_amount: number | string; status: string };
export type TipRow = { sale_id: string; amount: number | string; status: string };
export type ProductCostRow = { id: string; name: string; cost_price: number | string | null };
export type ExpenseRow = { amount: number | string; category: string | null; status: string };

export type ProfitInput = {
    sales: SaleRow[];
    items: SaleItemRow[];
    commissions: CommissionRow[];
    tips: TipRow[];
    products: ProductCostRow[];
    expenses: ExpenseRow[];
};

export type ProfitStatement = {
    revenue: { services: number; products: number; total: number; discounts: number };
    commissions: { services: number; products: number; total: number };
    tips: { total: number; count: number };
    productCost: { total: number; unitsWithoutCost: number; missing: { productId: string; name: string; units: number }[] };
    productsWithoutCost: number;
    expenses: { total: number; byCategory: { category: string; total: number; count: number }[] };
    profit: number;
    /** Utilidad / ingresos × 100, a un decimal. null si no hubo ingresos (no se divide entre cero). */
    marginPct: number | null;
    counts: { sales: number; voidedExcluded: number; serviceUnits: number; productUnits: number };
};

export type ProfitReport = ProfitStatement & { period: { from: string; to: string; timezone: string } };

/** Pesos (número o texto de numeric) a centavos enteros. */
export function toCents(value: number | string | null | undefined): number {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
}
export const fromCents = (cents: number) => cents / 100;

const VOIDED = new Set(['refunded', 'partially_refunded']);

export function computeProfit(input: ProfitInput): ProfitStatement {
    const paidSales = new Set(input.sales.filter((s) => s.status === 'paid').map((s) => s.id));
    const voidedExcluded = input.sales.filter((s) => VOIDED.has(s.status)).length;

    const items = input.items.filter((i) => paidSales.has(i.sale_id));
    const itemType = new Map(items.map((i) => [i.id, i.item_type]));

    let serviceRev = 0, productRev = 0, discounts = 0, serviceUnits = 0, productUnits = 0;
    for (const i of items) {
        const qty = Number(i.quantity);
        if (i.item_type === 'service') { serviceRev += toCents(i.line_total); serviceUnits += qty; }
        else { productRev += toCents(i.line_total); productUnits += qty; }
        discounts += toCents(i.discount_amount);
    }

    let serviceComm = 0, productComm = 0;
    for (const c of input.commissions) {
        if (c.status !== 'generated' || !paidSales.has(c.sale_id)) continue;
        // La comisión de recepción por productos también cuelga de un renglón de producto.
        if (itemType.get(c.sale_item_id) === 'product') productComm += toCents(c.commission_amount);
        else serviceComm += toCents(c.commission_amount);
    }

    let tipsTotal = 0, tipsCount = 0;
    for (const t of input.tips) {
        if (t.status !== 'generated' || !paidSales.has(t.sale_id)) continue;
        tipsTotal += toCents(t.amount);
        tipsCount += 1;
    }

    const products = new Map(input.products.map((p) => [p.id, p]));
    let cogs = 0, unitsWithoutCost = 0;
    const missing = new Map<string, { productId: string; name: string; units: number }>();
    for (const i of items) {
        if (i.item_type !== 'product') continue;
        const qty = Number(i.quantity);
        const product = i.product_id ? products.get(i.product_id) : undefined;
        const cost = product?.cost_price;
        if (cost === null || cost === undefined || cost === '') {
            unitsWithoutCost += qty;
            const key = i.product_id ?? `sin-producto:${i.item_name_snapshot}`;
            const entry = missing.get(key) ?? { productId: i.product_id ?? '', name: product?.name ?? i.item_name_snapshot, units: 0 };
            entry.units += qty;
            missing.set(key, entry);
            continue;
        }
        cogs += Math.round(qty * toCents(cost));
    }

    const byCategory = new Map<string, { category: string; total: number; count: number }>();
    let expensesTotal = 0;
    for (const e of input.expenses) {
        if (e.status !== 'posted') continue;
        const category = e.category?.trim() || 'General';
        const entry = byCategory.get(category) ?? { category, total: 0, count: 0 };
        entry.total += toCents(e.amount);
        entry.count += 1;
        byCategory.set(category, entry);
        expensesTotal += toCents(e.amount);
    }

    const revenue = serviceRev + productRev;
    const commissions = serviceComm + productComm;
    const profit = revenue - commissions - cogs - expensesTotal;
    const marginPct = revenue > 0 ? Math.round((profit / revenue) * 1000) / 10 : null;

    return {
        revenue: { services: fromCents(serviceRev), products: fromCents(productRev), total: fromCents(revenue), discounts: fromCents(discounts) },
        commissions: { services: fromCents(serviceComm), products: fromCents(productComm), total: fromCents(commissions) },
        tips: { total: fromCents(tipsTotal), count: tipsCount },
        productCost: { total: fromCents(cogs), unitsWithoutCost, missing: [...missing.values()].sort((a, b) => b.units - a.units) },
        productsWithoutCost: missing.size,
        expenses: {
            total: fromCents(expensesTotal),
            byCategory: [...byCategory.values()]
                .sort((a, b) => b.total - a.total)
                .map((c) => ({ ...c, total: fromCents(c.total) })),
        },
        profit: fromCents(profit),
        marginPct,
        counts: { sales: paidSales.size, voidedExcluded, serviceUnits, productUnits },
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

/** Rango del atajo a partir del día de hoy del negocio. La semana va de domingo a sábado (semana de pago). */
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
