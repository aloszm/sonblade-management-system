import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { fetchBusinessReport, toDashboard } from '@/lib/reports/business-report';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PeriodSchema = z.enum(['today', 'week', 'month']).catch('today');

/** Panel principal: cifras del periodo elegido y gráficas de semana y mes. Solo dueño y administrador. */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const period = PeriodSchema.parse(request.nextUrl.searchParams.get('period') ?? undefined);
        const supabase = await createSupabaseServerClient();
        const [selected, week, month] = await Promise.all([
            fetchBusinessReport(supabase, context.branchId, period),
            period === 'week' ? null : fetchBusinessReport(supabase, context.branchId, 'week'),
            period === 'month' ? null : fetchBusinessReport(supabase, context.branchId, 'month'),
        ]);
        return Response.json(toDashboard(selected, week ?? selected, month ?? selected), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
