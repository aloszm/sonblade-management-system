import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { loadClosedSessions } from '@/lib/cash/session-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Ultimas cajas cerradas de la sucursal. Solo dueño y administrador. */
export async function GET() {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const supabase = await createSupabaseServerClient();
        const sessions = await loadClosedSessions(supabase, context.businessId, context.branchId);
        return Response.json(sessions, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
