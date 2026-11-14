import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { loadProducts } from '@/lib/inventory/products-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const IdSchema = z.string().uuid();
const UpdateSchema = z.object({
    name: z.string().trim().min(2).max(160).optional(),
    sku: z.string().trim().min(2).max(60).optional(),
    category: z.string().trim().min(2).max(160).optional(),
    stock: z.number().int().min(0).max(100_000).optional(),
    min_stock: z.number().int().min(0).max(100_000).optional(),
    cost: z.number().min(0).max(1_000_000).optional(),
    price: z.number().min(0).max(1_000_000).optional(),
    notes: z.string().trim().min(3).max(500).optional(),
});

/**
 * Edita un producto. Nombre, precio y costo se guardan con su rastro en la auditoría.
 * Las existencias NO se pisan: se calcula la diferencia y se registra un movimiento de
 * inventario (adjust_inventory_stock). Solo dueño y administrador.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Producto no encontrado.', 404);
        const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        const supabase = await createSupabaseServerClient();
        const current = (await loadProducts(supabase, context.businessId, context.branchId)).find((p) => p.id === id.data);
        if (!current) throw new AuthorizationError('Producto no encontrado.', 404);
        const v = parsed.data;

        const changes: Record<string, unknown> = {};
        if (v.name !== undefined && v.name !== current.name) changes.name = v.name;
        if (v.sku !== undefined && v.sku !== current.sku) changes.sku = v.sku;
        if (v.category !== undefined && v.category !== current.category) changes.description = v.category;
        if (v.price !== undefined && v.price !== current.price) changes.sale_price = v.price;
        if (v.cost !== undefined && v.cost !== current.cost) changes.cost_price = v.cost;
        if (Object.keys(changes).length > 0) {
            const { error } = await supabase.from('products').update(changes as never).eq('business_id', context.businessId).eq('id', id.data);
            if (error) throw error;
        }

        if (v.min_stock !== undefined && v.min_stock !== current.min_stock) {
            const { error } = await supabase.rpc('set_inventory_minimum', {
                p_branch_id: context.branchId, p_product_id: id.data, p_minimum_quantity: v.min_stock,
            } as never);
            if (error) throw error;
        }
        if (v.stock !== undefined && v.stock !== current.stock) {
            const { error } = await supabase.rpc('adjust_inventory_stock', {
                p_branch_id: context.branchId, p_product_id: id.data, p_quantity_delta: v.stock - current.stock,
                p_notes: v.notes ?? 'Ajuste manual de existencias desde Inventario',
            } as never);
            if (error) throw error;
        }

        const updated = (await loadProducts(supabase, context.businessId, context.branchId)).find((p) => p.id === id.data);
        return Response.json(updated ?? null, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Da de baja un producto (no se borra: el historial de ventas y movimientos se conserva). */
export async function DELETE(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Producto no encontrado.', 404);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.from('products').update({ is_active: false } as never)
            .eq('business_id', context.businessId).eq('id', id.data).select('id').maybeSingle();
        if (error) throw error;
        if (!data) throw new AuthorizationError('Producto no encontrado.', 404);
        return Response.json({ success: true }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
