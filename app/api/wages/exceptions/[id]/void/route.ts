import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { REASON_MAX, REASON_MIN } from '@/lib/cash/reasons';
import { IdSchema, NO_STORE, PinSchema, badRequest, needsPin } from '@/lib/money/api';
import { mapWageWeek, type WageWeekIn } from '@/lib/payroll/wages';

export const dynamic = 'force-dynamic';

const REASON_MESSAGE = `Escribe el motivo de la anulación (de ${REASON_MIN} a ${REASON_MAX} letras).`;
const VoidSchema = z.object({
    reason: z.string({ message: REASON_MESSAGE }).trim().min(REASON_MIN, REASON_MESSAGE).max(REASON_MAX, REASON_MESSAGE),
    pin: PinSchema,
});

/**
 * Anula (sin borrar) una falta o un día extra mientras su semana NO esté pagada (409 si ya lo está: se corrige con
 * un descuento o asiento en el siguiente recibo). Dueño y gerencia, con PIN y motivo; queda en la bitácora.
 * Devuelve el sueldo de la semana ya recalculado (`week`).
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Excepción no encontrada.', 404);
        const parsed = VoidSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        if (!parsed.data.pin) return needsPin('Confirma la anulación con tu PIN.');
        const outcome = await runWithPin(context, parsed.data.pin, async (client) => {
            const { data, error } = await client.rpc('void_attendance_exception', { p_exception_id: id.data, p_reason: parsed.data.reason });
            if (error) throw error;
            return data as Record<string, unknown> | null;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        const v = outcome.value ?? {};
        return Response.json({ ...v, week: mapWageWeek(v.week as WageWeekIn | null) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
