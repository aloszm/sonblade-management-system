import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { TEAM_SUMMARY_ROLES } from '@/lib/barber/permissions';
import { loadBusinessTimezone } from '@/lib/business/timezone';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadEmployees, loadTeamSummary } from '@/lib/team/load';
import { teamWindow } from '@/lib/team/summary';

export const dynamic = 'force-dynamic';

const PeriodSchema = z.enum(['today', 'week', 'month']).catch('today');

/**
 * "Barberos hoy": qué lleva cada persona del equipo (servicios por tipo, productos, comisiones, propinas y ventas generadas).
 * Para dueño, gerencia, caja y recepción. Lee con el cliente del usuario: lo que la base le permite ver.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(TEAM_SUMMARY_ROLES);
        const period = PeriodSchema.parse(request.nextUrl.searchParams.get('period') ?? undefined);
        const supabase = await createSupabaseServerClient();
        const timezone = await loadBusinessTimezone(supabase, context.businessId);
        const window = teamWindow(period, new Date(), timezone);
        const employees = await loadEmployees(supabase, context.businessId);
        const summary = await loadTeamSummary(supabase, context, window, employees);
        return Response.json({ period, timezone, window, ...summary }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
