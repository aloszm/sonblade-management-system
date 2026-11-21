import { NextRequest } from 'next/server';
import { z } from 'zod';
import { PinConfirmSchema, pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const RecipientSchema = z.object({
    // null = sin receptor fijo (el cierre vuelve a pedir un texto opcional).
    user_id: z.string().uuid().nullable(),
}).merge(PinConfirmSchema);

/**
 * Cambia a quién se entrega el retiro del cierre de caja. Solo la cuenta principal, con su PIN y un comentario:
 * el PIN se verifica en esta misma petición y el cambio lo hace set_cash_withdrawal_recipient con la sesión recién
 * abierta (la base vuelve a revisar el puesto y que la persona sea gerencia o cuenta principal). Queda en la bitácora.
 */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner']);
        const parsed = RecipientSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        const outcome = await runWithPin(context, parsed.data.pin, async (client) => {
            const { data, error } = await client.rpc('set_cash_withdrawal_recipient', {
                p_branch_id: context.branchId,
                p_user_id: parsed.data.user_id,
                p_comment: parsed.data.comment,
            });
            if (error) throw error;
            return data;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        return Response.json({ withdrawal_recipient: outcome.value ?? null }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
