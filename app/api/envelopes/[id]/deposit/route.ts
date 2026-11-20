import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { AmountSchema, CommentSchema, IdSchema, IdempotencyKeySchema, NO_STORE, PinSchema, badRequest, needsPin, num } from '@/lib/money/api';

export const dynamic = 'force-dynamic';

const DepositSchema = z.object({
    amount: AmountSchema,
    comment: CommentSchema,
    idempotency_key: IdempotencyKeySchema.optional(),
    pin: PinSchema,
});

/** Depósito al banco desde el sobre (salida). Dueño y gerencia, con PIN; la base no deja el saldo negativo (409). */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Sobre no encontrado.', 404);
        const parsed = DepositSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        if (!parsed.data.pin) return needsPin('Confirma el depósito con tu PIN.');
        const outcome = await runWithPin(context, parsed.data.pin, async (client) => {
            const { data, error } = await client.rpc('envelope_bank_deposit_confirmed', {
                p_envelope_id: id.data,
                p_amount: parsed.data.amount,
                p_comment: parsed.data.comment,
                p_idempotency_key: parsed.data.idempotency_key,
            });
            if (error) throw error;
            return data as Record<string, unknown> | null;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        const v = outcome.value ?? {};
        return Response.json({
            movement_id: v.movement_id ?? null,
            envelope_id: id.data,
            previous_balance: v.previous_balance === undefined ? null : num(v.previous_balance),
            balance: num(v.balance),
            replayed: Boolean(v.replayed),
        }, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
