import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { CommentSchema, IdSchema, IdempotencyKeySchema, NO_STORE, PinSchema, badRequest, needsPin, num } from '@/lib/money/api';

export const dynamic = 'force-dynamic';

const AdjustSchema = z.object({
    // Lo que se contó físicamente en el sobre. La base calcula la diferencia contra el saldo y registra
    // una entrada o salida "adjustment". Contar 0 es válido (sobre vacío).
    counted_balance: z.number({ message: 'Escribe lo que contaste en el sobre.' }).min(0, 'El conteo no puede ser negativo.').max(1_000_000)
        .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'El conteo lleva máximo 2 decimales.'),
    comment: CommentSchema,
    idempotency_key: IdempotencyKeySchema.optional(),
    pin: PinSchema,
});

/** Ajuste del sobre por conteo físico (también sirve para cargar el saldo inicial). Dueño y gerencia, con PIN. */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Sobre no encontrado.', 404);
        const parsed = AdjustSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        if (!parsed.data.pin) return needsPin('Confirma el ajuste del sobre con tu PIN.');
        const outcome = await runWithPin(context, parsed.data.pin, async (client) => {
            const { data, error } = await client.rpc('envelope_adjust_confirmed', {
                p_envelope_id: id.data,
                p_counted_balance: parsed.data.counted_balance,
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
            difference: v.difference === undefined ? null : num(v.difference),
            balance: num(v.balance),
            replayed: Boolean(v.replayed),
        }, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
