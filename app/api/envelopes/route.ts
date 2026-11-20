import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NO_STORE, num } from '@/lib/money/api';

export const dynamic = 'force-dynamic';

type BalanceRow = {
    envelope_id: string; branch_id: string; name: string; is_default: boolean; is_active: boolean;
    balance: number | string; total_in: number | string; total_out: number | string; movements: number | string; last_movement_at: string | null;
};

/** Sobres de la sucursal con su saldo (dueño, gerencia y consulta; la RLS de la base filtra lo mismo). */
export async function GET() {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('envelope_balance', { p_branch_id: context.branchId });
        if (error) throw error;
        const envelopes = ((data ?? []) as BalanceRow[]).map((row) => ({
            id: row.envelope_id,
            branch_id: row.branch_id,
            name: row.name,
            is_default: row.is_default,
            is_active: row.is_active,
            balance: num(row.balance),
            total_in: num(row.total_in),
            total_out: num(row.total_out),
            movements: num(row.movements),
            last_movement_at: row.last_movement_at,
        }));
        return Response.json({ envelopes, can_edit: context.role === 'owner' || context.role === 'admin' }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
