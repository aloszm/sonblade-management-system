import { FRONT_DESK_READ_ROLES } from '@/lib/auth/roles';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { loadProducts, summarizeProducts } from '@/lib/inventory/products-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Resumen del inventario de la sucursal: total, bajo mínimo, agotados y valor. */
export async function GET() {
    try {
        const context = await requireAuthContext(FRONT_DESK_READ_ROLES);
        const supabase = await createSupabaseServerClient();
        const products = await loadProducts(supabase, context.businessId, context.branchId);
        return Response.json(summarizeProducts(products), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
