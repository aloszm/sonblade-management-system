import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const ReasonSchema = z.object({ reason: z.string().trim().min(3, 'Escribe el motivo de la anulación.').max(500) });

/**
 * Anula una venta (RB-13: las ventas no se borran). La función de la base devuelve el dinero a la
 * caja abierta, regresa las existencias, revierte las comisiones y deja la huella en la auditoría.
 * Solo dueño y administrador.
 */
export async function DELETE(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireAuthContext(['owner', 'admin']);
        const id = z.string().uuid().safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Venta no encontrada.', 404);
        const body = ReasonSchema.safeParse(await request.json().catch(() => null));
        if (!body.success) {
            return Response.json({ error: body.error.issues[0]?.message ?? 'Escribe el motivo de la anulación.' }, { status: 400, headers: { 'Cache-Control': 'no-store' } });
        }
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('reverse_sale', { p_sale_id: id.data, p_reason: body.data.reason } as never);
        if (error) throw error;
        return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
