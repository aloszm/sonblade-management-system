import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { fetchBusinessReport, toAdminSummary } from '@/lib/reports/business-report';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const PeriodSchema = z.enum(['today', 'week', 'month']).catch('week');

/** Resumen del negocio para el panel de administrador. Solo dueño y administrador. */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const period = PeriodSchema.parse(request.nextUrl.searchParams.get('period') ?? undefined);
        const supabase = await createSupabaseServerClient();
        const report = await fetchBusinessReport(supabase, context.branchId, period);
        return Response.json(toAdminSummary(report), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
