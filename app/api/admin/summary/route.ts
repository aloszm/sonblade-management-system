import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { businessDayKey } from '@/lib/admin/profit';
import { loadProfitReport } from '@/lib/admin/profit-data';
import { businessDayRange, loadBusinessTimezone } from '@/lib/business/timezone';
import { fetchBusinessReport, toAdminSummary } from '@/lib/reports/business-report';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { financeFromProfit, summaryRange } from './finance';

export const dynamic = 'force-dynamic';

const PeriodSchema = z.enum(['today', 'week', 'month']).catch('week');

/**
 * Resumen del negocio. Solo dueño y administrador.
 * Sin `basis`, mantiene el corte de la semana de pago (sábado 8 pm) que usa Equipo.
 * Con `basis=finanzas` (el Panel): mismo periodo y misma fórmula que Finanzas, y las cifras
 * de dinero salen de loadProfitReport; la base solo aporta gráficas, ranking y stock.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const params = request.nextUrl.searchParams;
        const period = PeriodSchema.parse(params.get('period') ?? undefined);
        const supabase = await createSupabaseServerClient();
        if (params.get('basis') !== 'finanzas') {
            const report = await fetchBusinessReport(supabase, context.branchId, period);
            return Response.json(toAdminSummary(report), { headers: { 'Cache-Control': 'no-store' } });
        }
        const client = supabase as unknown as SupabaseClient;
        const timezone = await loadBusinessTimezone(client, context.businessId);
        const range = summaryRange(period, businessDayKey(new Date().toISOString(), timezone));
        const window = businessDayRange(range.from, range.to, timezone);
        const [profit, report] = await Promise.all([
            loadProfitReport(client, { businessId: context.businessId, branchId: context.branchId }, range),
            fetchBusinessReport(supabase, context.branchId, period, null, window),
        ]);
        const summary = toAdminSummary(report);
        const finance = financeFromProfit(profit);
        return Response.json({
            ...summary,
            kpis: {
                ...summary.kpis,
                totalRevenue: finance.revenue,
                totalTips: finance.tips,
                avgTicket: finance.avgTicket,
                totalCommissions: finance.commissions,
                netProfit: finance.profit,
                totalSales: finance.sales,
            },
            paymentBreakdown: finance.payments,
            finance,
        }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
