import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { loadOpenSession } from '@/lib/cash/session-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const OpenSchema = z.object({ opening_cash: z.number().min(0).max(1_000_000) });

/** Caja abierta de la sucursal (o null si no hay). */
export async function GET() {
    try {
        const context = await requireAuthContext(['owner', 'admin', 'cashier']);
        const supabase = await createSupabaseServerClient();
        const session = await loadOpenSession(supabase, context.businessId, context.branchId);
        return Response.json(session, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Abre la caja con la funcion atomica open_cash_session. */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin', 'cashier']);
        const parsed = OpenSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.rpc('open_cash_session', {
            p_branch_id: context.branchId,
            p_opening_cash: parsed.data.opening_cash,
        } as never);
        if (error) throw error;
        const session = await loadOpenSession(supabase, context.businessId, context.branchId);
        return Response.json(session, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
