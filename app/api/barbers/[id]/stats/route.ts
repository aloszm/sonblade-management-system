import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { fetchBusinessReport, toBarberProfile, toBarberStats, type ReportPeriod } from '@/lib/reports/business-report';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();
const PeriodSchema = z.enum(['today', 'week', 'month']).catch('week') as z.ZodType<ReportPeriod>;
const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

/**
 * Cifras de un barbero: semana (corte sábado 8 pm) y hoy.
 * Dueño y administrador ven a cualquiera; un barbero solo a sí mismo (lo valida la base).
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(['owner', 'admin', 'barber']);
        const parsedId = IdSchema.safeParse((await params).id);
        if (!parsedId.success) throw new AuthorizationError('Barbero no encontrado', 404);
        const employeeId = parsedId.data;
        const supabase = await createSupabaseServerClient();

        const [{ data: employee }, { data: rule }] = await Promise.all([
            supabase.from('employees').select('id, display_name').eq('business_id', context.businessId).eq('id', employeeId).maybeSingle(),
            supabase.from('commission_rules').select('percentage')
                .eq('business_id', context.businessId).eq('is_active', true).eq('target_type', 'service')
                .or(`employee_id.is.null,employee_id.eq.${employeeId}`)
                .order('priority', { ascending: false }).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
        ]);
        if (!employee) throw new AuthorizationError('Barbero no encontrado', 404);

        const rate = Number((rule as { percentage: number | string } | null)?.percentage ?? 0);
        const name = (employee as { display_name: string }).display_name;
        const query = request.nextUrl.searchParams;

        // Perfil del barbero (/barberos/[id]): periodo o rango de fechas elegido.
        if (query.get('view') !== 'dashboard') {
            const period = PeriodSchema.parse(query.get('period') ?? undefined);
            const from = DaySchema.safeParse(query.get('from'));
            const to = DaySchema.safeParse(query.get('to'));
            const range = from.success && to.success
                ? { from: new Date(`${from.data}T00:00:00`).toISOString(), to: new Date(new Date(`${to.data}T00:00:00`).getTime() + 86_400_000).toISOString() }
                : null;
            const report = await fetchBusinessReport(supabase, context.branchId, period, employeeId, range);
            return Response.json(toBarberProfile(report, name, employeeId, rate), { headers: { 'Cache-Control': 'no-store' } });
        }

        // Panel personal (/barbero): semana (corte sábado 8 pm) y hoy.
        const [week, today] = await Promise.all([
            fetchBusinessReport(supabase, context.branchId, 'week', employeeId),
            fetchBusinessReport(supabase, context.branchId, 'today', employeeId),
        ]);
        return Response.json(toBarberStats(week, today, name, rate), {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        return authErrorResponse(error);
    }
}
