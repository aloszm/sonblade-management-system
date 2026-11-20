import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { MonthSchema, NO_STORE, badRequest, num } from '@/lib/money/api';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({ month: MonthSchema.optional() });

type PendingRow = {
    id: string; name: string; category_id: string; category_name: string; suggested_amount: number | string; day_of_month: number;
    due_on: string; is_overdue: boolean; paid_from: string; method: string; vendor: string | null;
};

/**
 * Gastos fijos pendientes del mes (por omisión, el mes en curso del negocio): plantillas activas sin un gasto
 * vigente ligado a ellas en ese mes. La pantalla los propone y se confirman con un clic: POST /api/expenses con
 * recurring_expense_id, paid_from, method, category_id y el monto (sugerido o corregido), con PIN.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const parsed = QuerySchema.safeParse({ month: request.nextUrl.searchParams.get('month') || undefined });
        if (!parsed.success) return badRequest(parsed.error);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('pending_recurring_expenses', {
            p_branch_id: context.branchId,
            p_month: parsed.data.month ? `${parsed.data.month}-01` : undefined,
        });
        if (error) throw error;
        const pending = ((data ?? []) as PendingRow[]).map((row) => ({ ...row, suggested_amount: num(row.suggested_amount) }));
        return Response.json({ month: parsed.data.month ?? null, pending }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
