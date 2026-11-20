import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { loadMemberNames } from '@/lib/auth/member-names';
import { businessDayRange, loadBusinessTimezone } from '@/lib/business/timezone';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DaySchema, IdSchema, NO_STORE, badRequest, num } from '@/lib/money/api';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
    from: DaySchema.optional(),
    to: DaySchema.optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
});

type MovementRow = {
    id: string; envelope_id: string; direction: 'in' | 'out'; amount: number | string; signed_amount: number | string;
    balance_after: number | string; source: string; cash_session_id: string | null; expense_id: string | null;
    reason: string | null; created_by: string; created_at: string;
};

/** Movimientos del sobre, del más reciente al más antiguo, con el saldo después de cada uno. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Sobre no encontrado.', 404);
        const search = request.nextUrl.searchParams;
        const parsed = QuerySchema.safeParse({
            from: search.get('from') ?? undefined, to: search.get('to') ?? undefined, limit: search.get('limit') ?? undefined,
        });
        if (!parsed.success) return badRequest(parsed.error);
        const supabase = await createSupabaseServerClient();
        let from: string | null = null;
        let to: string | null = null;
        if (parsed.data.from || parsed.data.to) {
            const timezone = await loadBusinessTimezone(supabase, context.businessId);
            const range = businessDayRange(parsed.data.from ?? '2000-01-01', parsed.data.to ?? '2999-12-31', timezone);
            from = parsed.data.from ? range.from : null;
            to = parsed.data.to ? range.to : null;
        }
        const { data, error } = await supabase.rpc('envelope_movements_list', {
            p_envelope_id: id.data, p_from: from ?? undefined, p_to: to ?? undefined, p_limit: parsed.data.limit ?? 200,
        });
        if (error) throw error;
        const rows = (data ?? []) as MovementRow[];
        const names = await loadMemberNames(supabase, context.businessId, rows.map((row) => row.created_by));
        const movements = rows.map((row) => ({
            id: row.id,
            direction: row.direction,
            amount: num(row.amount),
            signed_amount: num(row.signed_amount),
            balance_after: num(row.balance_after),
            source: row.source,
            cash_session_id: row.cash_session_id,
            expense_id: row.expense_id,
            reason: row.reason,
            created_by: row.created_by,
            created_by_name: names.get(row.created_by) ?? null,
            created_at: row.created_at,
        }));
        return Response.json({ envelope_id: id.data, movements }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
