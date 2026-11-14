import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { addDays, isSunday, latestClosedWeekStart } from '@/lib/settlements/week';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const DateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const PaymentSchema = z.object({
    method: z.enum(['cash', 'card', 'transfer', 'other']),
    amount: z.number().positive().max(10_000_000),
    reference: z.string().trim().max(200).optional(),
});
const SettleSchema = z.object({
    employee_id: z.string().uuid(),
    period_start: DateSchema,
    payments: z.array(PaymentSchema).max(4),
});

type Preview = {
    window_start: string; window_end: string; gross_commission: number; deductions: number; total_amount: number;
    entry_count: number; can_settle: boolean; reason: string | null; settlement_id: string | null; receipt_number: string | null;
};

/**
 * Vista previa de la liquidación de una semana (domingo a sábado, corte sábado 8 pm):
 * cuánto se le debe a cada barbero y si ya se pagó. Solo dueño y administrador.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const supabase = await createSupabaseServerClient();

        const { data: business, error: businessError } = await supabase.from('businesses').select('timezone').eq('id', context.businessId).single();
        if (businessError) throw businessError;
        const timezone = (business as unknown as { timezone: string }).timezone;

        const requested = request.nextUrl.searchParams.get('period_start');
        const periodStart = requested ?? latestClosedWeekStart(new Date(), timezone);
        if (!DateSchema.safeParse(periodStart).success || !isSunday(periodStart)) {
            throw new AuthorizationError('La semana debe empezar en domingo (AAAA-MM-DD).', 400);
        }
        const periodEnd = addDays(periodStart, 6);

        const { data: employees, error: employeesError } = await supabase.from('employees').select('id, display_name')
            .eq('business_id', context.businessId).eq('is_active', true).order('display_name');
        if (employeesError) throw employeesError;

        const rows = await Promise.all(((employees ?? []) as unknown as { id: string; display_name: string }[]).map(async (employee) => {
            const { data, error } = await supabase.rpc('preview_commission_settlement', {
                p_branch_id: context.branchId, p_employee_id: employee.id, p_period_start: periodStart, p_period_end: periodEnd,
            } as never);
            if (error) throw error;
            return { employee_id: employee.id, name: employee.display_name, ...(data as unknown as Preview) };
        }));

        const first = rows[0];
        return Response.json({
            period_start: periodStart,
            period_end: periodEnd,
            timezone,
            window_start: first?.window_start ?? null,
            window_end: first?.window_end ?? null,
            is_latest_closed: periodStart === latestClosedWeekStart(new Date(), timezone),
            rows,
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Paga la semana de un barbero: el servidor calcula el total, valida los pagos y genera el folio. */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const parsed = SettleSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        if (!isSunday(parsed.data.period_start)) {
            return Response.json({ error: 'La semana debe empezar en domingo.' }, { status: 400, headers: NO_STORE });
        }
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('settle_commissions', {
            p_branch_id: context.branchId,
            p_employee_id: parsed.data.employee_id,
            p_period_start: parsed.data.period_start,
            p_period_end: addDays(parsed.data.period_start, 6),
            p_payments: parsed.data.payments,
        } as never);
        if (error) throw error;
        return Response.json(data, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
