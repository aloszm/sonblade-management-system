import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { REASON_MAX, REASON_MIN } from '@/lib/cash/reasons';
import { DaySchema, IdSchema, NO_STORE, PinSchema, badRequest, needsPin } from '@/lib/money/api';
import { ATTENDANCE_KINDS, mapWageWeek, type WageWeekIn } from '@/lib/payroll/wages';

export const dynamic = 'force-dynamic';

const REASON_MESSAGE = `Escribe el motivo (de ${REASON_MIN} a ${REASON_MAX} letras).`;
const CreateSchema = z.object({
    employee_id: IdSchema,
    work_date: DaySchema,
    kind: z.enum(ATTENDANCE_KINDS, { message: 'Elige: faltó o día extra.' }),
    reason: z.string({ message: REASON_MESSAGE }).trim().min(REASON_MIN, REASON_MESSAGE).max(REASON_MAX, REASON_MESSAGE),
    pin: PinSchema,
});

/**
 * Registra una excepción al sueldo por día: `absent` (faltó un día fijo: no se paga) o `extra` (trabajó un día que no
 * es fijo, p. ej. cubrió a alguien: sí se paga a la tarifa de ese día). Dueño y gerencia, con PIN y motivo; queda en
 * la bitácora. La base rechaza (409) si la semana ya se pagó o si ese día ya tiene otra excepción, y (400) una falta
 * en un día no fijo, un día extra en un día fijo o sin sueldo vigente. La misma excepción dos veces no duplica:
 * responde 200 con `replayed: true`. Devuelve el sueldo de la semana ya recalculado (`week`).
 */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const d = parsed.data;
        if (!d.pin) return needsPin('Confirma con tu PIN.');
        const outcome = await runWithPin(context, d.pin, async (client) => {
            const { data, error } = await client.rpc('record_attendance_exception', {
                p_branch_id: context.branchId,
                p_employee_id: d.employee_id,
                p_work_date: d.work_date,
                p_kind: d.kind,
                p_reason: d.reason,
            });
            if (error) throw error;
            return data as Record<string, unknown> | null;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        const v = outcome.value ?? {};
        const replayed = Boolean(v.replayed);
        return Response.json({ ...v, replayed, week: mapWageWeek(v.week as WageWeekIn | null) }, { status: replayed ? 200 : 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
