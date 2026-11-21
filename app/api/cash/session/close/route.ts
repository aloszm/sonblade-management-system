import { NextRequest } from 'next/server';
import { z } from 'zod';
import { FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { RELOAD_FOR_REASON, differenceReasonProblem, isDifferenceReasonError, REASON_MAX } from '@/lib/cash/reasons';
import { loadSessionById } from '@/lib/cash/session-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const CloseSchema = z.object({
    session_id: z.string().uuid(),
    physical_count: z.number().min(0).max(10_000_000),
    // Conteo por billetes y monedas: { "500": 2, "0.5": 3 }. La base verifica que sume lo contado.
    breakdown: z.record(z.string().regex(/^\d+(\.\d+)?$/), z.number().int().min(0).max(100_000)).optional(),
    float_left: z.number().min(0).max(10_000_000).optional(),
    reserve_amount: z.number().min(0).max(10_000_000).optional(),
    // A quién se entrega el retiro. Opcional: la base lo guarda en el cierre y en la bitácora.
    withdrawal_delivered_to: z.string().trim().max(120, 'El nombre de quien recibe el retiro es muy largo.').optional(),
    // Obligatorio (5 a 300 letras) si se deja menos del fondo recomendado; lo exige la base.
    short_float_reason: z.string().trim().max(300, 'El motivo es muy largo (máximo 300 letras).').optional(),
    // Obligatorio (5 a 300 letras) si hay sobrante o faltante; lo exige la base con su propia cuenta de la diferencia.
    // La pantalla de esta versión SIEMPRE manda la llave (vacía si cuadra); una pantalla abierta antes de publicar no la manda.
    difference_reason: z.string().trim().max(REASON_MAX, `El motivo de la diferencia es muy largo (máximo ${REASON_MAX} letras).`).nullable().optional(),
});

/** PostgREST no encuentra la función con ese juego de parámetros: la base todavía no tiene p_difference_reason. */
const isMissingSignature = (error: unknown) => (error as { code?: unknown } | null)?.code === 'PGRST202';

/** Cierra la caja con close_cash_session: el servidor calcula el esperado y la diferencia. */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(FRONT_DESK_ROLES);
        const parsed = CloseSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        const input = parsed.data;
        const sendsReasonKey = input.difference_reason !== undefined;
        const differenceReason = input.difference_reason?.trim() || null;
        const supabase = await createSupabaseServerClient();

        // Aviso temprano con el mismo mensaje de la base (que vuelve a contar y es la que manda). Solo para la pantalla nueva:
        // una pantalla vieja no tiene dónde escribir el motivo, y con la base anterior todavía puede cerrar.
        if (sendsReasonKey) {
            const current = await loadSessionById(supabase, context.businessId, context.branchId, input.session_id);
            if (current && current.status === 'open' && current.expected_cash !== undefined) {
                const problem = differenceReasonProblem(Math.round((input.physical_count - current.expected_cash) * 100) / 100, differenceReason);
                if (problem) return Response.json({ error: problem, expected_cash: current.expected_cash }, { status: 400, headers: NO_STORE });
            }
        }

        const args = {
            p_cash_session_id: input.session_id,
            p_counted_cash: input.physical_count,
            p_breakdown: input.breakdown ?? null,
            p_float_left: input.float_left ?? null,
            p_reserve_amount: input.reserve_amount ?? null,
            p_withdrawal_delivered_to: input.withdrawal_delivered_to || null,
            ...(input.short_float_reason ? { p_short_float_reason: input.short_float_reason } : {}),
        };
        // El motivo solo viaja si hay texto. Si la base aún no conoce el parámetro (se publica el código antes que la base),
        // se repite la llamada sin él: esa base no exige motivo, y en cuanto se migra la llamada con motivo funciona sola.
        let { error } = await supabase.rpc('close_cash_session', (differenceReason ? { ...args, p_difference_reason: differenceReason } : args) as never);
        if (error && differenceReason && isMissingSignature(error)) {
            ({ error } = await supabase.rpc('close_cash_session', args as never));
        }
        if (error) {
            const message = typeof error.message === 'string' ? error.message : '';
            if (isDifferenceReasonError(message)) {
                return Response.json({ error: sendsReasonKey ? message : `${message} ${RELOAD_FOR_REASON}` }, { status: 400, headers: NO_STORE });
            }
            throw error;
        }
        const session = await loadSessionById(supabase, context.businessId, context.branchId, input.session_id);
        return Response.json(session, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
