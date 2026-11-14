import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { fetchBusinessReport, toBarberStats } from '@/lib/reports/business-report';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();

/**
 * Cifras de un barbero: semana (corte sábado 8 pm) y hoy.
 * Dueño y administrador ven a cualquiera; un barbero solo a sí mismo (lo valida la base).
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
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

        const [week, today] = await Promise.all([
            fetchBusinessReport(supabase, context.branchId, 'week', employeeId),
            fetchBusinessReport(supabase, context.branchId, 'today', employeeId),
        ]);
        const rate = Number((rule as { percentage: number | string } | null)?.percentage ?? 0);
        return Response.json(toBarberStats(week, today, (employee as { display_name: string }).display_name, rate), {
            headers: { 'Cache-Control': 'no-store' },
        });
    } catch (error) {
        return authErrorResponse(error);
    }
}
