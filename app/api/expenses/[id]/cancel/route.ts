import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { REASON_MAX, REASON_MIN } from '@/lib/cash/reasons';
import { IdSchema, NO_STORE, PinSchema, badRequest, needsPin, num } from '@/lib/money/api';

export const dynamic = 'force-dynamic';

const REASON_MESSAGE = `Escribe el motivo de la cancelación (de ${REASON_MIN} a ${REASON_MAX} letras).`;
const CancelSchema = z.object({
    reason: z.string({ message: REASON_MESSAGE }).trim().min(REASON_MIN, REASON_MESSAGE).max(REASON_MAX, REASON_MESSAGE),
    pin: PinSchema,
});

/**
 * Cancela un gasto (nunca se borra). Dueño y gerencia, con PIN y motivo. La base devuelve el dinero:
 * sobre -> al sobre; caja aún abierta -> ajuste de entrada en esa caja; caja ya cerrada en efectivo -> al sobre por omisión;
 * banco -> solo se marca (returned_to = 'none').
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Gasto no encontrado.', 404);
        const parsed = CancelSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        if (!parsed.data.pin) return needsPin('Confirma la cancelación con tu PIN.');
        const outcome = await runWithPin(context, parsed.data.pin, async (client) => {
            const { data, error } = await client.rpc('cancel_expense', { p_expense_id: id.data, p_reason: parsed.data.reason });
            if (error) throw error;
            return data as Record<string, unknown> | null;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        const v = outcome.value ?? {};
        return Response.json({
            expense_id: id.data,
            status: 'cancelled',
            paid_from: v.paid_from ?? null,
            returned_to: v.returned_to ?? 'none',
            reference_id: v.reference_id ?? null,
            envelope_id: v.envelope_id ?? null,
            envelope_balance: v.envelope_balance === null || v.envelope_balance === undefined ? null : num(v.envelope_balance),
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
