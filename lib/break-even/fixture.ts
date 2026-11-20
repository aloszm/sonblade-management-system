import { normalizeBreakEven, type BreakEvenData } from './model';

/**
 * Datos de ejemplo para PRUEBAS (Vitest): misma forma que entrega public.break_even_period.
 * No son datos del negocio. Renta 7,500 + Luz 1,000 cada 2 meses + Internet 450 + Sueldos 9,600 = 18,050.
 */
export function breakEvenFixture(over: {
    today?: string; status?: 'past' | 'current' | 'future'; margin?: number; enough?: boolean; refDays?: number;
    remainingSvc?: number | null; needed?: number | null; recent?: number; covered?: boolean; coveredOn?: string | null;
    projected?: string | null; sales?: number; setup?: boolean; per100Left?: number;
} = {}): BreakEvenData {
    const fixed = over.setup ? 9600 : 18050;
    const margin = over.margin ?? 6318;
    const covered = over.covered ?? margin >= fixed;
    const enough = over.enough ?? true;
    const items = [
        { key: 'tpl:r', kind: 'template', id: 'r', name: 'Renta', category_name: 'Renta', base_amount: 7500, every_months: 1, amount: 7500, sort_order: 1, is_estimate: true, day_of_month: 1 },
        { key: 'tpl:l', kind: 'template', id: 'l', name: 'Luz', category_name: 'Luz', base_amount: 1000, every_months: 2, amount: 500, sort_order: 2, is_estimate: true, day_of_month: 1 },
        { key: 'tpl:i', kind: 'template', id: 'i', name: 'Internet', category_name: 'Internet y teléfono', base_amount: 450, every_months: 1, amount: 450, sort_order: 3, is_estimate: false, day_of_month: 1 },
        { key: 'wages', kind: 'wages', id: null, name: 'Sueldos', category_name: null, base_amount: 9600, every_months: 1, amount: 9600, sort_order: 10001, is_estimate: false, day_of_month: null },
    ].filter((i) => !over.setup || i.kind === 'wages');
    let left = Math.min(Math.max(margin, 0), fixed);
    const buckets = items.map((i) => {
        const filled = Math.min(i.amount, Math.max(left, 0));
        left -= i.amount;
        return { ...i, filled, pct: Math.round((filled / i.amount) * 1000) / 10, complete: filled >= i.amount };
    });
    return normalizeBreakEven({
        month: '2026-11', month_start: '2026-11-01', month_end: '2026-11-30', today: over.today ?? '2026-11-11',
        status: over.status ?? 'current', is_closed: over.status === 'past', days_in_month: 30, days_elapsed: 11, days_left: 20,
        needs_setup: Boolean(over.setup),
        fixed: { total: fixed, templates_total: over.setup ? 0 : 8450, templates_count: over.setup ? 0 : 3, has_estimates: !over.setup,
            wages: { total: 9600, to_date: 3520, projected: 6080, paid_days: 11, projected_days: 19, people: 2 }, items },
        month_to_date: { from: '2026-11-01', to: '2026-11-11', revenue: margin * 2, commissions: margin * 0.9, product_cost: margin * 0.1, margin,
            services: 66, sales: over.sales ?? 60, days_with_sales: 11, units_without_cost: 0, finance_profit: margin - 3520 },
        reference: { from: '2026-10-14', to: '2026-11-10', window_days: 28, min_days: 14, days_with_sales: over.refDays ?? 28, calendar_days: 28,
            enough_data: enough, revenue: 52000, commissions: 24180, product_cost: 1976, margin: 25844, services: 272, services_per_day: 9.7, margin_per_day: 923 },
        last_7_days: { from: '2026-11-04', to: '2026-11-10', revenue: 14000, margin: 7000, services: 59, days_with_sales: 7, services_per_day: over.recent ?? 8.4, margin_per_day: 1000 },
        derived: {
            margin_per_100: enough ? 49.7 : null, goal_revenue: enough ? 36318.03 : null, progress_pct: over.setup ? null : Math.round((Math.max(margin, 0) / fixed) * 1000) / 10,
            covered, covered_amount: Math.min(Math.max(margin, 0), fixed), remaining: Math.max(fixed - Math.max(margin, 0), 0),
            avg_margin_per_service: enough ? 95.01 : null, services_goal_approx: enough ? 190 : null,
            services_remaining_approx: enough ? (over.remainingSvc === undefined ? 124 : over.remainingSvc) : null,
            services_per_day_needed: enough && !covered ? (over.needed === undefined ? 6.2 : over.needed) : null,
            services_per_day_recent: over.recent ?? 8.4, services_per_day_reference: 9.7,
            projected_cover_date: over.projected ?? null, projected_within_month: Boolean(over.projected),
            covered_on: over.coveredOn ?? null, covered_day: over.coveredOn ? Number(over.coveredOn.slice(8, 10)) : null,
            profit_above: covered ? margin - fixed : null,
        },
        buckets,
        per_100: over.setup ? null : {
            source: enough ? 'reference' : 'month', approximate: true, monthly_revenue_basis: 55700,
            items: [
                { key: 'team', label: 'Equipo (comisiones)', amount: 46.5, kind: 'variable' },
                { key: 'product', label: 'Producto vendido', amount: 3.8, kind: 'variable' },
                { key: 'tpl:r', label: 'Renta', amount: 13.5, kind: 'fixed' },
                { key: 'wages', label: 'Sueldos', amount: 17.2, kind: 'fixed' },
            ],
            left: over.per100Left ?? 19,
        },
    });
}
