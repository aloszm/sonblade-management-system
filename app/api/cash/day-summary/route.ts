import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { DAY_SUMMARY_ANY_DAY_ROLES, DAY_SUMMARY_ROLES, daySummaryDayAllowed } from '@/lib/auth/roles';
import { loadDaySummary } from '@/lib/cash/day-summary-load';
import type { DaySummaryPayload } from '@/lib/cash/day-summary';
import { addDay } from '@/lib/cash/day-summary-text';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { localClock } from '@/lib/settlements/week';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const QuerySchema = z.object({
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'La fecha no es válida (AAAA-MM-DD).')
        .refine((d) => {
        const [y, m, day] = d.split('-').map(Number);
        const t = new Date(Date.UTC(y, m - 1, day));
        return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === day;
    }, 'La fecha no es válida.')
        .refine((d) => d >= '2020-01-01', 'La fecha es demasiado antigua.'),
});

/**
 * Resumen de caja de un día (GET ?date=AAAA-MM-DD). Cuenta principal, gerencia y consulta: cualquier día;
 * recepción: solo hoy y ayer; barbero: no. Solo lee, con la sesión del usuario (RLS). Sin datos de clientes ni costos.
 * «Quién registró» cada movimiento y los gastos del sobre o del banco solo llegan a quien ve cualquier día (no a recepción).
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(DAY_SUMMARY_ROLES);
        const parsed = QuerySchema.safeParse({ date: request.nextUrl.searchParams.get('date') });
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        const day = parsed.data.date;

        const supabase = await createSupabaseServerClient();
        const { data: business, error } = await supabase.from('businesses').select('name, timezone').eq('id', context.businessId).single();
        if (error) throw error;
        const { name, timezone } = business as { name: string; timezone: string };
        const today = localClock(new Date(), timezone).date;

        if (day > today) return Response.json({ error: 'Ese día todavía no llega.' }, { status: 400, headers: NO_STORE });
        if (!daySummaryDayAllowed(context.role, day, today)) {
            return Response.json({ error: 'Tu puesto puede ver el resumen de hoy y de ayer.' }, { status: 403, headers: NO_STORE });
        }

        const data = await loadDaySummary(supabase, context, day, timezone, DAY_SUMMARY_ANY_DAY_ROLES.includes(context.role));
        const payload: DaySummaryPayload = {
            date: day, timezone, businessName: name, today,
            minDay: DAY_SUMMARY_ANY_DAY_ROLES.includes(context.role) ? null : addDay(today, -1),
            ...data,
        };
        return Response.json(payload, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
