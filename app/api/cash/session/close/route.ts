import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { loadSessionById } from '@/lib/cash/session-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const CloseSchema = z.object({
    session_id: z.string().uuid(),
    physical_count: z.number().min(0).max(10_000_000),
});

/** Cierra la caja con close_cash_session: el servidor calcula el esperado y la diferencia. */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin', 'cashier']);
        const parsed = CloseSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.rpc('close_cash_session', {
            p_cash_session_id: parsed.data.session_id,
            p_counted_cash: parsed.data.physical_count,
        } as never);
        if (error) throw error;
        const session = await loadSessionById(supabase, context.businessId, context.branchId, parsed.data.session_id);
        return Response.json(session, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
