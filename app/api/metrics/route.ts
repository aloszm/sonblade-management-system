import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const QuerySchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inicial no válida.'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha final no válida.'),
    barber: z.string().uuid().optional(),
});

/**
 * Métricas del negocio en días de la barbería (zona horaria del negocio): totales, comparación con
 * el periodo anterior, series por día, hora y día de la semana, barberos, servicios y el registro
 * de cada servicio con su hora exacta. Solo dueño y gerencia; la base lo vuelve a validar.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const params = request.nextUrl.searchParams;
        const parsed = QuerySchema.safeParse({ from: params.get('from'), to: params.get('to'), barber: params.get('barber') || undefined });
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('business_metrics', {
            p_branch_id: context.branchId, p_from: parsed.data.from, p_to: parsed.data.to,
            ...(parsed.data.barber ? { p_employee_id: parsed.data.barber } : {}),
        });
        if (error) throw error;
        return Response.json(data, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
