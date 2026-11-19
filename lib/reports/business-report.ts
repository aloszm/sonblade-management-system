import type { SupabaseClient } from '@supabase/supabase-js';

export type ReportPeriod = 'today' | 'week' | 'month' | 'last_week';

// Forma del jsonb que devuelve public.business_report (los números llegan como number).
export type BarberRow = {
    id: string;
    name: string;
    cuts: number;
    service_revenue: number;
    product_revenue: number;
    service_commission: number;
    product_commission: number;
    service_breakdown: { name: string; count: number; revenue: number }[];
};

/**
 * Bloque de dinero que arma private.profit_kpis (misma función que Finanzas):
 * net = revenue − commissions − product_cost − expenses (gastos por incurred_at).
 * net_kind 'contribution' (filtro por persona) = aporte, sin gastos generales; no es "utilidad".
 */
export type ProfitKpis = {
    revenue: number; commissions: number; product_cost: number; expenses: number; net: number;
    net_kind: 'profit' | 'contribution'; units_without_cost: number | null; sales_commissions?: number;
};

export type BusinessReport = {
    window: { start: string; end: string; timezone: string };
    kpis: {
        total_revenue: number; total_sales: number; avg_ticket: number; total_commissions: number; expenses: number; cuts: number;
        /** B4 (20261119210000): dinero con la misma regla que Finanzas. Falta si la base es anterior. */
        profit?: ProfitKpis;
    } | null;
    payment_breakdown: { cash: number; card: number; transfer: number; other: number };
    barbers: BarberRow[];
    service_breakdown: { name: string; count: number; revenue: number }[];
    hourly: { hour: string; revenue: number }[];
    daily: { day: string; revenue: number }[];
    weekly: { week: string; revenue: number }[];
    low_stock: { id: string; name: string; stock: number; min_stock: number }[];
    sales: { id: string; created_at: string; items: { item_name: string; item_type: 'service' | 'product' }[]; amount: number; methods: string | null; cash_amount: number; card_amount: number; transfer_amount: number; commission: number }[] | null;
};

export async function fetchBusinessReport(
    supabase: SupabaseClient,
    branchId: string,
    period: ReportPeriod,
    employeeId: string | null = null,
    range: { from: string; to: string } | null = null,
): Promise<BusinessReport> {
    const { data, error } = await supabase.rpc('business_report', {
        p_branch_id: branchId,
        p_period: period,
        p_employee_id: employeeId,
        ...(range ? { p_from: range.from, p_to: range.to } : {}),
    } as never);
    if (error) throw error;
    return data as unknown as BusinessReport;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** % efectivo de comisión por servicios: lo que pagó la regla sobre lo vendido en servicios. */
export function effectiveRate(serviceCommission: number, serviceRevenue: number): number {
    return serviceRevenue > 0 ? Math.round((serviceCommission / serviceRevenue) * 100) : 0;
}

/** Dinero del resumen: del bloque `profit` (B4) o, con una base anterior, de los totales sueltos. */
export function adminMoney(kpis: BusinessReport['kpis']) {
    const p = kpis?.profit;
    if (p) {
        return { revenue: round2(p.revenue), commissions: round2(p.commissions), productCost: round2(p.product_cost), expenses: round2(p.expenses), net: round2(p.net) };
    }
    const revenue = kpis?.total_revenue ?? 0;
    const commissions = kpis?.total_commissions ?? 0;
    const expenses = kpis?.expenses ?? 0;
    return { revenue, commissions: round2(commissions), productCost: 0, expenses: round2(expenses), net: round2(revenue - commissions - expenses) };
}

/** Forma que espera el panel de administrador (/admin, /reportes, /equipo). */
export function toAdminSummary(report: BusinessReport) {
    const kpis = report.kpis;
    // B4: la utilidad sale del bloque `profit` de la base (misma regla que Finanzas: ventas − comisiones
    // − costo de producto − gastos por incurred_at). Si la base aún no lo trae, se calcula con lo que hay.
    const money = adminMoney(kpis);
    return {
        kpis: {
            totalRevenue: money.revenue,
            totalTips: 0, // las propinas todavía no existen en el modelo nuevo
            avgTicket: kpis?.avg_ticket ?? 0,
            totalCommissions: money.commissions,
            totalProductCost: money.productCost,
            totalExpenses: money.expenses,
            netProfit: money.net,
            totalSales: kpis?.total_sales ?? 0,
        },
        paymentBreakdown: {
            cash: report.payment_breakdown.cash,
            card: report.payment_breakdown.card,
            transfer: report.payment_breakdown.transfer,
        },
        barberSummaries: report.barbers.map((b) => ({
            id: b.id,
            name: b.name,
            status: 'active',
            cuts: b.cuts,
            revenue: round2(b.service_revenue + b.product_revenue),
            serviceRevenue: b.service_revenue,
            tips: 0,
            rate: effectiveRate(b.service_commission, b.service_revenue),
            commission: round2(b.service_commission + b.product_commission),
            serviceCommission: b.service_commission,
            productCommission: b.product_commission,
            serviceBreakdown: b.service_breakdown,
        })),
        serviceBreakdown: report.service_breakdown,
        weeklyBreakdown: report.weekly,
        hourlySales: report.hourly,
        dailySales: report.daily,
        lowStockProducts: report.low_stock,
    };
}

/** Forma que espera el panel principal (/). Las gráficas siempre muestran semana y mes. */
export function toDashboard(selected: BusinessReport, week: BusinessReport, month: BusinessReport) {
    const k = selected.kpis;
    return {
        kpis: { revenue: k?.total_revenue ?? 0, cuts: k?.cuts ?? 0, tips: 0, expenses: k?.expenses ?? 0 },
        barbersTable: selected.barbers.map((b) => ({
            id: b.id,
            name: b.name,
            avatar_url: '',
            cuts: b.cuts,
            revenue: round2(b.service_revenue + b.product_revenue),
            commission: round2(b.service_commission + b.product_commission),
            rate: effectiveRate(b.service_commission, b.service_revenue),
        })),
        charts: {
            weekBar: week.daily.map((d) => ({ name: d.day, revenue: d.revenue })),
            monthLine: month.daily.map((d) => ({ name: d.day, revenue: d.revenue })),
            paymentDonut: [
                { name: 'Efectivo', value: selected.payment_breakdown.cash },
                { name: 'Tarjeta', value: selected.payment_breakdown.card },
                { name: 'Transferencia', value: selected.payment_breakdown.transfer },
            ],
        },
    };
}

/**
 * Forma que espera la vista del barbero. La comisión de cortes es la regla aprobada (RB-04):
 * porcentaje fijo; no hay escalones hasta que se defina la función de metas.
 */
export function toBarberStats(week: BusinessReport, today: BusinessReport, barberName: string, rate: number, tips = { week: 0, today: 0 }) {
    const w = week.barbers[0];
    const t = today.barbers[0];
    const sales = (today.sales ?? []).map((s) => ({
        id: s.id,
        created_at: s.created_at,
        items: s.items,
        payment_method: s.methods && !s.methods.includes(',') ? s.methods : 'mixed',
        total: s.amount,
    }));
    return {
        barber: { id: w?.id ?? t?.id ?? '', name: barberName, total_cuts: w?.cuts ?? 0, status: 'active', avatar_url: null as string | null },
        tier: { current: rate, next: rate, cutsForNext: 0 },
        weeklyStats: {
            cuts: w?.cuts ?? 0,
            totalGenerated: round2((w?.service_revenue ?? 0) + (w?.product_revenue ?? 0)),
            serviceRevenue: w?.service_revenue ?? 0,
            tips: tips.week,
            commission: round2((w?.service_commission ?? 0) + (w?.product_commission ?? 0)),
            serviceCommission: w?.service_commission ?? 0,
            productCommission: w?.product_commission ?? 0,
            serviceBreakdown: w?.service_breakdown ?? [],
        },
        todayStats: { cuts: t?.cuts ?? 0, tips: tips.today, sales },
    };
}

/** Forma que espera el perfil del barbero (/barberos/[id]): cifras del periodo y detalle por venta. */
export function toBarberProfile(report: BusinessReport, barberName: string, barberId: string, rate: number, tips = 0) {
    const b = report.barbers[0];
    const serviceCommission = b?.service_commission ?? 0;
    const productCommission = b?.product_commission ?? 0;
    return {
        barber: { id: barberId, name: barberName, status: 'active', commission_type: 'flat_50' },
        kpis: {
            cuts: b?.cuts ?? 0,
            serviceRevenue: b?.service_revenue ?? 0,
            productRevenue: b?.product_revenue ?? 0,
            totalRevenue: round2((b?.service_revenue ?? 0) + (b?.product_revenue ?? 0)),
            tips,
            commissionRate: rate,
            totalCommission: round2(serviceCommission + productCommission),
            serviceCommission,
            productCommission,
        },
        movements: (report.sales ?? []).map((s) => {
            const methods = s.methods ? s.methods.split(', ') : [];
            return {
                id: s.id,
                date: s.created_at,
                services: s.items.filter((i) => i.item_type === 'service').map((i) => i.item_name).join(', '),
                products: s.items.filter((i) => i.item_type === 'product').map((i) => i.item_name).join(', '),
                payment_method: methods.length === 1 ? methods[0] : 'mixed',
                cash_amount: s.cash_amount,
                card_amount: s.card_amount,
                transfer_amount: s.transfer_amount,
                tip: 0,
                total: s.amount,
                commission: s.commission,
            };
        }),
        serviceBreakdown: b?.service_breakdown ?? [],
    };
}

/**
 * Propinas vigentes de un barbero dentro de una ventana (inicio exclusivo, fin inclusivo, igual que
 * el pago semanal). La base solo deja ver las propias al barbero y todas a administración y recepción.
 */
export async function sumEmployeeTips(
    supabase: SupabaseClient, branchId: string, employeeId: string, window: { start: string; end: string },
): Promise<number> {
    const { data, error } = await supabase.from('sale_tips').select('amount')
        .eq('branch_id', branchId).eq('employee_id', employeeId).eq('status', 'generated')
        .gt('created_at', window.start).lte('created_at', window.end);
    if (error) throw error;
    const cents = ((data ?? []) as { amount: number | string }[]).reduce((sum, row) => sum + Math.round(Number(row.amount) * 100), 0);
    return cents / 100;
}
