import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { RECEIVE_COMMENT_MAX, RECEIVE_COMMENT_MIN, RECEIVE_MAX } from '@/lib/inventory/receive';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const IdSchema = z.string().uuid();
const COMMENT_MESSAGE = `Escribe un comentario de la entrada (de ${RECEIVE_COMMENT_MIN} a ${RECEIVE_COMMENT_MAX} letras).`;
const ReceiveSchema = z.object({
    quantity: z.number({ message: 'Escribe cuántas piezas llegaron (al menos 1).' })
        .int('Escribe cuántas piezas llegaron (al menos 1).')
        .min(1, 'Escribe cuántas piezas llegaron (al menos 1).')
        .max(RECEIVE_MAX, `Una entrada no puede pasar de ${RECEIVE_MAX} piezas. Si llegó más, regístrala en varias partes.`),
    comment: z.string({ message: COMMENT_MESSAGE }).trim().min(RECEIVE_COMMENT_MIN, COMMENT_MESSAGE).max(RECEIVE_COMMENT_MAX, COMMENT_MESSAGE),
    pin: z.string().max(16).optional(),
});

/**
 * Registra una ENTRADA de mercancía (solo suma). Dueño, gerencia, recepción y caja, siempre con el PIN
 * de quien la registra y un comentario. El PIN se verifica en esta petición y la suma la hace
 * public.receive_inventory_stock con la sesión recién abierta (la base exige esa sesión reciente y de
 * un solo uso, y vuelve a revisar puesto, sucursal, cantidad y comentario). Restar, corregir o cambiar
 * el mínimo sigue en PATCH /api/products/[id] (dueño y gerencia).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(FRONT_DESK_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Producto no encontrado.', 404);
        const parsed = ReceiveSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        const { quantity, comment, pin } = parsed.data;
        if (!pin) {
            return Response.json({ error: 'Confirma la entrada con tu PIN.', needs_pin: true }, { status: 428, headers: NO_STORE });
        }
        const outcome = await runWithPin(context, pin, async (client) => {
            const { data, error } = await client.rpc('receive_inventory_stock', {
                p_branch_id: context.branchId, p_product_id: id.data, p_quantity: quantity, p_comment: comment,
            });
            if (error) throw error;
            return data as { movement_id?: string; quantity_on_hand?: number | string } | null;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        return Response.json({
            product_id: id.data,
            received: quantity,
            stock: Number(outcome.value?.quantity_on_hand ?? 0),
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
