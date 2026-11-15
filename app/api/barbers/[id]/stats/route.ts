import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { fetchBusinessReport, sumEmployeeTips, toBarberProfile, toBarberStats, type ReportPeriod } from '@/lib/reports/business-report';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { businessDayRange, loadBusinessTimezone } from '@/lib/business/timezone';

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

        const [{ data: employee }, { data: rule }, { data: business }] = await Promise.all([
            supabase.from('employees').select('id, display_name').eq('business_id', context.businessId).eq('id', employeeId).maybeSingle(),
            supabase.from('commission_rules').select('percentage')
                .eq('business_id', context.businessId).eq('is_active', true).eq('target_type', 'service')
                .or(`employee_id.is.null,employee_id.eq.${employeeId}`)
                .order('priority', { ascending: false }).order('effective_from', { ascending: false }).limit(1).maybeSingle(),
            supabase.from('businesses').select('service_commission_pct').eq('id', context.businessId).maybeSingle(),
        ]);
        if (!employee) throw new AuthorizationError('Barbero no encontrado', 404);

        // Tasa de servicios: la regla específica si existe; si no, la tasa general del negocio.
        const rate = Number((rule as { percentage: number | string } | null)?.percentage
            ?? (business as unknown as { service_commission_pct: number | string } | null)?.service_commission_pct ?? 0);
        const name = (employee as { display_name: string }).display_name;
        const query = request.nextUrl.searchParams;

        // Perfil del barbero (/barberos/[id]): periodo o rango de fechas elegido.
        if (query.get('view') !== 'dashboard') {
            const period = PeriodSchema.parse(query.get('period') ?? undefined);
            const from = DaySchema.safeParse(query.get('from'));
            const to = DaySchema.safeParse(query.get('to'));
            let range: { from: string; to: string } | null = null;
            if (from.success && to.success) {
                // Los días son los de la barbería, no los del servidor (UTC).
                range = businessDayRange(from.data, to.data, await loadBusinessTimezone(supabase, context.businessId));
            }
            const report = await fetchBusinessReport(supabase, context.branchId, period, employeeId, range);
            const tips = await sumEmployeeTips(supabase, context.branchId, employeeId, report.window);
            return Response.json(toBarberProfile(report, name, employeeId, rate, tips), { headers: { 'Cache-Control': 'no-store' } });
        }

        // Panel personal (/barbero): semana (corte sábado 8 pm) y hoy.
        const [week, today] = await Promise.all([
            fetchBusinessReport(supabase, context.branchId, 'week', employeeId),
            fetchBusinessReport(supabase, context.branchId, 'today', employeeId),
        ]);
        const [weekTips, todayTips] = await Promise.all([
            sumEmployeeTips(supabase, context.branchId, employeeId, week.window),
            sumEmployeeTips(supabase, context.branchId, employeeId, today.window),
        ]);
        return Response.json(toBarberStats(week, today, name, rate, { week: weekTips, today: todayTips }), {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        return authErrorResponse(error);
    }
}
