import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES, OWNER_ONLY_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MonthSchema, NO_STORE, badRequest } from '@/lib/money/api';
import { normalizeBreakEven } from '@/lib/break-even/model';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({ month: MonthSchema.optional() });

/**
 * Punto de equilibrio del mes (solo lectura). Cuenta principal, gerencia y consulta; recepción y barbero: 403.
 * Todo se calcula en la base (public.break_even_period, con la misma fórmula de utilidad de Finanzas).
 * ?month=AAAA-MM (por omisión, el mes en curso del negocio). `can_edit`: solo la cuenta principal edita los gastos
 * fijos desde esta pantalla (gerencia y consulta la ven en solo lectura).
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const parsed = QuerySchema.safeParse({ month: request.nextUrl.searchParams.get('month') || undefined });
        if (!parsed.success) return badRequest(parsed.error);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('break_even_period', {
            p_branch_id: context.branchId,
            p_month: parsed.data.month ? `${parsed.data.month}-01` : undefined,
        });
        if (error) throw error;
        return Response.json({ ...normalizeBreakEven(data), can_edit: OWNER_ONLY_ROLES.includes(context.role) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
