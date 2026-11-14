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

export type BusinessReport = {
    window: { start: string; end: string; timezone: string };
    kpis: { total_revenue: number; total_sales: number; avg_ticket: number; total_commissions: number; expenses: number; cuts: number } | null;
    payment_breakdown: { cash: number; card: number; transfer: number; other: number };
    barbers: BarberRow[];
    service_breakdown: { name: string; count: number; revenue: number }[];
    hourly: { hour: string; revenue: number }[];
    daily: { day: string; revenue: number }[];
    weekly: { week: string; revenue: number }[];
    low_stock: { id: string; name: string; stock: number; min_stock: number }[];
    sales: { id: string; created_at: string; items: { item_name: string; item_type: 'service' | 'product' }[]; amount: number; methods: string | null }[] | null;
};

export async function fetchBusinessReport(
    supabase: SupabaseClient,
    branchId: string,
    period: ReportPeriod,
    employeeId: string | null = null,
): Promise<BusinessReport> {
    const { data, error } = await supabase.rpc('business_report', {
        p_branch_id: branchId,
        p_period: period,
        p_employee_id: employeeId,
    } as never);
    if (error) throw error;
    return data as unknown as BusinessReport;
}

const round2 = (value: number) => Math.round(value * 100) / 100;

/** % efectivo de comisión por servicios: lo que pagó la regla sobre lo vendido en servicios. */
export function effectiveRate(serviceCommission: number, serviceRevenue: number): number {
    return serviceRevenue > 0 ? Math.round((serviceCommission / serviceRevenue) * 100) : 0;
}

/** Forma que espera el panel de administrador (/admin, /reportes, /equipo). */
export function toAdminSummary(report: BusinessReport) {
    const kpis = report.kpis;
    const revenue = kpis?.total_revenue ?? 0;
    const commissions = kpis?.total_commissions ?? 0;
    const expenses = kpis?.expenses ?? 0;
    return {
        kpis: {
            totalRevenue: revenue,
            totalTips: 0, // las propinas todavía no existen en el modelo nuevo
            avgTicket: kpis?.avg_ticket ?? 0,
            totalCommissions: round2(commissions),
            netProfit: round2(revenue - commissions - expenses),
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
export function toBarberStats(week: BusinessReport, today: BusinessReport, barberName: string, rate: number) {
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
            tips: 0,
            commission: round2((w?.service_commission ?? 0) + (w?.product_commission ?? 0)),
            serviceCommission: w?.service_commission ?? 0,
            productCommission: w?.product_commission ?? 0,
            serviceBreakdown: w?.service_breakdown ?? [],
        },
        todayStats: { cuts: t?.cuts ?? 0, tips: 0, sales },
    };
}
