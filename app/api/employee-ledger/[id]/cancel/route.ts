import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { REASON_MAX, REASON_MIN } from '@/lib/cash/reasons';
import { IdSchema, NO_STORE, PinSchema, badRequest, needsPin } from '@/lib/money/api';
import { mapLedgerResult } from '@/lib/payroll/ledger';

export const dynamic = 'force-dynamic';

const REASON_MESSAGE = `Escribe el motivo de la cancelación (de ${REASON_MIN} a ${REASON_MAX} letras).`;
const CancelSchema = z.object({
    reason: z.string({ message: REASON_MESSAGE }).trim().min(REASON_MIN, REASON_MESSAGE).max(REASON_MAX, REASON_MESSAGE),
    pin: PinSchema,
});

/**
 * Cancela un adelanto, descuento, préstamo sin abonos o abono que espera su recibo, mientras NO esté incluido en un
 * recibo (409 si ya lo está: se corrige con un asiento nuevo). Dueño y gerencia, con PIN y motivo. Nunca borra: crea un
 * asiento de reversa y devuelve el dinero: sobre -> al sobre; caja aún abierta -> a esa caja; caja ya cerrada -> al sobre
 * por omisión; banco -> solo se marca (returned_to = 'none').
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Asiento no encontrado.', 404);
        const parsed = CancelSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        if (!parsed.data.pin) return needsPin('Confirma la cancelación con tu PIN.');
        const outcome = await runWithPin(context, parsed.data.pin, async (client) => {
            const { data, error } = await client.rpc('cancel_employee_ledger_entry', { p_entry_id: id.data, p_reason: parsed.data.reason });
            if (error) throw error;
            return data as Record<string, unknown> | null;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        const v = mapLedgerResult(outcome.value);
        return Response.json({
            entry_id: id.data,
            reversal_id: v.reversal_id ?? null,
            entry_type: v.entry_type ?? null,
            amount: v.amount,
            returned_to: v.returned_to ?? 'none',
            envelope_id: v.envelope_id ?? null,
            envelope_balance: v.envelope_balance,
            cash_available: v.cash_available,
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
