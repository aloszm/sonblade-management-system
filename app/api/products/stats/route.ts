import { FRONT_DESK_READ_ROLES, MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { loadProducts, summarizeProducts } from '@/lib/inventory/products-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Resumen del inventario de la sucursal: total, bajo mínimo, agotados y valor a precio de venta.
 * El valor a costo (`totalCost`) solo va a quien puede ver costos: dueño, gerencia y consulta.
 */
export async function GET() {
    try {
        const context = await requireAuthContext(FRONT_DESK_READ_ROLES);
        const supabase = await createSupabaseServerClient();
        const withCost = MANAGEMENT_READ_ROLES.includes(context.role);
        const products = await loadProducts(supabase, context.businessId, context.branchId, { withCost });
        return Response.json(summarizeProducts(products, { withCost }), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
