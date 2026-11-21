import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES, MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { PRODUCT_COST_MAX, PRODUCT_COST_REQUIRED, loadProducts, skuProblem } from '@/lib/inventory/products-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const CreateProductSchema = z.object({
    name: z.string().trim().min(2).max(160),
    // Opcional: los productos reales no traen código. Vacío = sin código (la base guarda null).
    sku: z.string().trim().superRefine((value, ctx) => {
        const problem = skuProblem(value);
        if (problem) ctx.addIssue({ code: 'custom', message: problem });
    }).optional(),
    category: z.string().trim().min(2).max(160),
    stock: z.number().int().min(0).max(100_000),
    min_stock: z.number().int().min(0).max(100_000).optional(),
    // Todo producto activo lleva costo mayor que cero (la base también lo exige: products_require_cost).
    cost: z.number({ error: PRODUCT_COST_REQUIRED }).positive(PRODUCT_COST_REQUIRED).max(PRODUCT_COST_MAX),
    price: z.number().min(0).max(1_000_000),
});

/**
 * Catálogo de productos con las existencias de la sucursal. El costo solo lo reciben dueño, gerencia
 * y consulta: recepción, caja y barberos ven nombre, existencias y precio de venta.
 */
export async function GET() {
    try {
        const context = await requireAuthContext();
        const supabase = await createSupabaseServerClient();
        const management = MANAGEMENT_READ_ROLES.includes(context.role);
        const products = await loadProducts(supabase, context.businessId, context.branchId, { withCost: management });
        if (management) return Response.json(products, { headers: NO_STORE });
        const withoutCost = products.map((p) => {
            const rest: Partial<typeof p> = { ...p };
            delete rest.cost;
            return rest;
        });
        return Response.json(withoutCost, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Alta de producto con existencias iniciales, en una sola operación atómica. Solo dueño y administrador. */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const parsed = CreateProductSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.rpc('create_catalog_product', {
            p_branch_id: context.branchId,
            p_name: parsed.data.name,
            p_sku: parsed.data.sku || null,
            p_description: parsed.data.category,
            p_sale_price: parsed.data.price,
            p_cost_price: parsed.data.cost,
            p_initial_stock: parsed.data.stock,
            p_minimum_quantity: parsed.data.min_stock ?? 0,
        } as never);
        if (error) throw error;
        // El nombre es único por negocio (products_business_id_name_key); el código puede venir vacío.
        const created = (await loadProducts(supabase, context.businessId, context.branchId, { withCost: true })).find((p) => p.name === parsed.data.name);
        return Response.json(created ?? null, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
