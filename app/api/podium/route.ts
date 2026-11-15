import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Podio de la semana: cortes por barbero, ordenados. Lo ve todo el equipo.
 * Solo cortes: la base no entrega ingresos ni comisiones de otras personas por aquí.
 */
export async function GET() {
    try {
        const context = await requireAuthContext();
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('weekly_cuts_podium', { p_branch_id: context.branchId });
        if (error) throw error;
        return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
