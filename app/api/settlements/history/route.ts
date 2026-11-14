import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

type SettlementRow = {
    id: string; employee_id: string; receipt_number: string; period_start: string; period_end: string;
    total_amount: number | string; paid_at: string | null; status: string;
};

/** Recibos de pago: dueño y administrador ven todos; cada barbero solo los suyos (lo aplica la base con RLS). */
export async function GET() {
    try {
        const context = await requireAuthContext(['owner', 'admin', 'barber']);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.from('commission_settlements')
            .select('id, employee_id, receipt_number, period_start, period_end, total_amount, paid_at, status')
            .eq('business_id', context.businessId).eq('branch_id', context.branchId)
            .order('paid_at', { ascending: false }).limit(100);
        if (error) throw error;
        const rows = (data ?? []) as unknown as SettlementRow[];

        const ids = Array.from(new Set(rows.map((r) => r.employee_id)));
        const names = new Map<string, string>();
        if (ids.length > 0) {
            const { data: employees, error: employeesError } = await supabase.from('employees').select('id, display_name').in('id', ids);
            if (employeesError) throw employeesError;
            for (const e of (employees ?? []) as unknown as { id: string; display_name: string }[]) names.set(e.id, e.display_name);
        }
        return Response.json(rows.map((r) => ({
            id: r.id, receipt_number: r.receipt_number, employee_name: names.get(r.employee_id) ?? 'Barbero',
            period_start: r.period_start, period_end: r.period_end, total_amount: Number(r.total_amount), paid_at: r.paid_at, status: r.status,
        })), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
