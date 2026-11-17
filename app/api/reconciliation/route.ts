import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const QuerySchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inicial no válida.'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha final no válida.'),
});

const KEY = /^(llego_sin_cobro|sin_cerrar|completada_sin_cobro|cobro_sin_agenda|otro_barbero):\d{4}-\d{2}-\d{2}(:(-|[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})){3}$/;
const ActionSchema = z.discriminatedUnion('action', [
    z.object({
        action: z.literal('review'),
        key: z.string().regex(KEY, 'La diferencia no es válida.'),
        decision: z.enum(['aceptada', 'reabierta'], { message: 'La decisión no es válida.' }),
        reason: z.string().trim().min(3, 'Escribe el motivo (al menos 3 letras).').max(300, 'El motivo es demasiado largo (máximo 300 caracteres).'),
    }),
    z.object({ action: z.literal('accept_pre_agenda') }),
], { message: 'Acción no válida.' });

/** Cuadre agenda ↔ cobros ↔ comisiones ↔ recibos, por barbero y día. Solo dueño y gerencia (la base lo vuelve a validar). */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const params = request.nextUrl.searchParams;
        const parsed = QuerySchema.safeParse({ from: params.get('from'), to: params.get('to') });
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        const { data, error } = await (await createSupabaseServerClient()).rpc('agenda_reconciliation', {
            p_branch_id: context.branchId, p_from: parsed.data.from, p_to: parsed.data.to,
        });
        if (error) throw error;
        return Response.json(data, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/**
 * Revisar una diferencia ("aceptada" = revisada, está bien; "reabierta" = vuelve a pendientes), siempre con motivo,
 * o aceptar de una vez las ventas anteriores a la agenda. La base valida rol, motivo y que la diferencia exista,
 * y deja todo en la bitácora. Repetir la misma petición no duplica nada.
 */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const parsed = ActionSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        const supabase = await createSupabaseServerClient();
        const body = parsed.data;
        const { data, error } = body.action === 'review'
            ? await supabase.rpc('review_reconciliation_issue', {
                p_branch_id: context.branchId, p_issue_key: body.key, p_decision: body.decision, p_reason: body.reason,
            })
            : await supabase.rpc('accept_pre_agenda_sales', { p_branch_id: context.branchId });
        if (error) throw error;
        return Response.json(data, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
