import { profitPresetRange, type ProfitReport } from '@/lib/admin/profit';

export type SummaryPeriod = 'today' | 'week' | 'month';

/** Mismo rango que usa Finanzas: el día, la semana de calendario (domingo a sábado; no es el periodo de pago) o el mes. */
export function summaryRange(period: SummaryPeriod, today: string): { from: string; to: string } {
    return period === 'today' ? { from: today, to: today } : profitPresetRange(period, today);
}

/**
 * Cifras del Panel que salen de la misma fórmula que Finanzas (computeProfit): ingresos netos de
 * descuento, comisiones, sueldos por día, bonos, costo de producto guardado en cada venta, gastos y propinas (aparte).
 * El Panel no recalcula nada: solo da forma a lo que ya calculó Finanzas.
 */
export function financeFromProfit(profit: ProfitReport) {
    const sales = profit.counts.sales;
    return {
        period: profit.period,
        revenue: profit.revenue.total,
        commissions: profit.commissions.total,
        /** Sueldos por día devengados (concepto aparte de comisiones). */
        wages: profit.wages.total,
        bonuses: profit.bonuses.total,
        productCost: profit.productCost.total,
        expenses: profit.expenses.total,
        tips: profit.tips.total,
        profit: profit.profit,
        marginPct: profit.marginPct,
        productsWithoutCost: profit.productsWithoutCost,
        sales,
        avgTicket: sales > 0 ? Math.round((profit.revenue.total / sales) * 100) / 100 : 0,
        previousProfit: profit.comparison.hasBase ? profit.comparison.profit.previous : null,
        profitDeltaPct: profit.comparison.hasBase ? profit.comparison.profit.pct : null,
        payments: {
            cash: profit.payments.byMethod.find((m) => m.method === 'cash')?.total ?? 0,
            card: profit.payments.byMethod.find((m) => m.method === 'card')?.total ?? 0,
            transfer: profit.payments.byMethod.find((m) => m.method === 'transfer')?.total ?? 0,
        },
    };
}

export type FinanceSummary = ReturnType<typeof financeFromProfit>;
