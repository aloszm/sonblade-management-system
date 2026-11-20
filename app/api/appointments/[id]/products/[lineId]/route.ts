import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext, type BusinessRole } from '@/lib/auth/context';
import { toProductLine } from '@/lib/appointments/extras';
import { NO_STORE } from '@/lib/money/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const EDITOR_ROLES: BusinessRole[] = ['owner', 'admin', 'cashier', 'receptionist', 'barber'];
const SELLER_ROLES: BusinessRole[] = ['owner', 'admin', 'cashier', 'receptionist'];
const IdSchema = z.string().uuid();
const SellerSchema = z.object({
    seller_employee_id: z.string({ message: 'Elige quién vendió el producto.' }).uuid('Vendedor no válido.'),
}).strict();
const QuantitySchema = z.coerce.number().int().min(1).max(50);

/** La línea debe ser de esta cita (y de esta sucursal): si no, 404. La RLS de lectura limita a la sucursal. */
async function checkLine(params: Promise<{ id: string; lineId: string }>, branchId: string) {
    const raw = await params;
    const id = IdSchema.safeParse(raw.id);
    const lineId = IdSchema.safeParse(raw.lineId);
    if (!id.success || !lineId.success) throw new AuthorizationError('Producto no encontrado en esta cita.', 404);
    const db = await createSupabaseServerClient();
    const { data, error } = await db.from('appointment_products').select('id')
        .eq('id', lineId.data).eq('appointment_id', id.data).eq('branch_id', branchId).maybeSingle();
    if (error) throw error;
    if (!data) throw new AuthorizationError('Producto no encontrado en esta cita.', 404);
    return { db, lineId: lineId.data };
}

/** Cambia a quién se apunta la venta (dueño, gerencia y recepción; el barbero no). Queda en la bitácora. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
    try {
        const context = await requireAuthContext(SELLER_ROLES);
        const parsed = SellerSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        const { db, lineId } = await checkLine(params, context.branchId);
        const { data, error } = await db.rpc('set_appointment_product_seller', { p_line_id: lineId, p_seller_employee_id: parsed.data.seller_employee_id });
        if (error) throw error;
        return Response.json({ line: toProductLine((data ?? {}) as Record<string, unknown>) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/**
 * Quita el producto de la cita. Con `?quantity=N` quita solo N piezas; sin él, toda la línea.
 * Nada se borra: la línea queda marcada como quitada (removed_at) y en la bitácora.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string; lineId: string }> }) {
    try {
        const context = await requireAuthContext(EDITOR_ROLES);
        const rawQuantity = request.nextUrl.searchParams.get('quantity');
        const quantity = rawQuantity === null ? null : QuantitySchema.safeParse(rawQuantity);
        if (quantity && !quantity.success) return Response.json({ error: 'La cantidad debe ser de 1 a 50.' }, { status: 400, headers: NO_STORE });
        const { db, lineId } = await checkLine(params, context.branchId);
        const { data, error } = await db.rpc('remove_appointment_product', { p_line_id: lineId, p_quantity: quantity ? quantity.data : undefined });
        if (error) throw error;
        const line = toProductLine((data ?? {}) as Record<string, unknown>);
        return Response.json({ line, removed: (data as { removed_at?: string | null } | null)?.removed_at != null }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
