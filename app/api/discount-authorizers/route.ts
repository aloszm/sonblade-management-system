import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Personas que pueden autorizar un descuento: dueño, administración, recepción y
 * los empleados con ese permiso (employees.can_authorize_discounts). Lo decide la base.
 */
export async function GET() {
    try {
        const context = await requireAuthContext([...FRONT_DESK_ROLES]);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('list_discount_authorizers', { p_branch_id: context.branchId });
        if (error) throw error;
        return Response.json({ current_user_id: context.userId, authorizers: data ?? [] }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
