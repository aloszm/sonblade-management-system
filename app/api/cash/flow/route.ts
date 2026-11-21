import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { DAY_SUMMARY_ANY_DAY_ROLES, FRONT_DESK_READ_ROLES, daySummaryDayAllowed } from '@/lib/auth/roles';
import { loadCashFlows, loadOtherExpenses, loadSessionRow } from '@/lib/cash/cash-flow-load';
import type { CashFlowPayload } from '@/lib/cash/cash-flow';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { localClock } from '@/lib/settlements/week';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const QuerySchema = z.object({ session_id: z.string().uuid('La caja no es válida.') });

/**
 * «El camino del efectivo» de UNA caja (GET ?session_id=): de dónde salió el efectivo que debe haber y a dónde se fue lo contado.
 * La caja abierta la ve quien ve Caja; una caja cerrada, con las mismas reglas del Resumen del día (recepción: hoy y ayer).
 * «Quién registró» cada movimiento y los gastos del sobre o del banco solo llegan a cuenta principal, gerencia y consulta.
 * Solo lee, con la sesión del usuario (RLS).
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(FRONT_DESK_READ_ROLES);
        const parsed = QuerySchema.safeParse({ session_id: request.nextUrl.searchParams.get('session_id') });
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });

        const supabase = await createSupabaseServerClient();
        const row = await loadSessionRow(supabase, context, parsed.data.session_id);
        if (!row) return Response.json({ error: 'No se encontró esa caja.' }, { status: 404, headers: NO_STORE });

        const { data: business, error } = await supabase.from('businesses').select('timezone').eq('id', context.businessId).single();
        if (error) throw error;
        const timezone = (business as { timezone: string }).timezone;
        const day = localClock(new Date(row.opened_at), timezone).date;
        const today = localClock(new Date(), timezone).date;
        if (row.status === 'closed' && !daySummaryDayAllowed(context.role, day, today)) {
            return Response.json({ error: 'Tu puesto puede ver las cajas de hoy y de ayer.' }, { status: 403, headers: NO_STORE });
        }

        const management = DAY_SUMMARY_ANY_DAY_ROLES.includes(context.role);
        const [flows, otherExpenses] = await Promise.all([
            loadCashFlows(supabase, context, [row], { showAuthors: management }),
            management ? loadOtherExpenses(supabase, context, day, timezone) : Promise.resolve(null),
        ]);
        const payload: CashFlowPayload = { flow: flows[0], timezone, day, otherExpenses };
        return Response.json(payload, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
