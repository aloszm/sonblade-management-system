import { NextRequest } from 'next/server';
import { z } from 'zod';
import { FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
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
});

/** Cierra la caja con close_cash_session: el servidor calcula el esperado y la diferencia. */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(FRONT_DESK_ROLES);
        const parsed = CloseSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.rpc('close_cash_session', {
            p_cash_session_id: parsed.data.session_id,
            p_counted_cash: parsed.data.physical_count,
            p_breakdown: parsed.data.breakdown ?? null,
            p_float_left: parsed.data.float_left ?? null,
            p_reserve_amount: parsed.data.reserve_amount ?? null,
            p_withdrawal_delivered_to: parsed.data.withdrawal_delivered_to || null,
            ...(parsed.data.short_float_reason ? { p_short_float_reason: parsed.data.short_float_reason } : {}),
        } as never);
        if (error) throw error;
        const session = await loadSessionById(supabase, context.businessId, context.branchId, parsed.data.session_id);
        return Response.json(session, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
