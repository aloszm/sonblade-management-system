import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_ROLES, PAY_RECEIPT_ROLES } from '@/lib/auth/roles';
import {
    isPayPeriodClosed, isPayPeriodStart, latestClosedPayPeriod, nextPayPeriod, payPeriodAt, payPeriodEndOf, payPeriodForDate, previousPayPeriod,
} from '@/lib/payroll/pay-period';
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
    window_start: string; window_end: string; gross_commission: number; deductions: number; tips: number; total_amount: number;
    entry_count: number; can_settle: boolean; reason: string | null; settlement_id: string | null; receipt_number: string | null;
    // B7 (opcionales; la base los manda desde 20261120052000). `deductions` siguen siendo solo los ajustes por anulaciones.
    // total_amount = gross_commission − deductions + tips + bonuses − advances − loan_payments − staff_deductions − carryover_in,
    // con piso en 0; si el neto (net_amount) es negativo, carryover_out pasa a la semana siguiente.
    bonuses?: number; advances?: number; loan_payments?: number; staff_deductions?: number;
    carryover_in?: number; carryover_out?: number; net_amount?: number;
    ledger_lines?: unknown[]; loan_scheduled_lines?: unknown[]; loans_waiting?: unknown[];
    bonus_lines?: unknown[]; bonus_goals?: unknown[]; bonus_goals_enabled?: boolean;
    // Sueldo por día (20261120090000): `wages` entra al neto (total_amount = wages + …); `wage` trae el detalle día por
    // día (private.wage_week_summary, el mismo cálculo que el pago). Sin ficha de sueldo: wages 0 y wage null.
    wages?: number; wage?: unknown;
    // Periodo de pago (20261121100000): fecha de pago y periodo de transición.
    pay_date?: string; is_transition?: boolean; period_days?: number;
};

/**
 * Vista previa del pago de un periodo (lib/payroll/pay-period.ts: de jueves a miércoles desde el 19 nov 2026, con la
 * transición del 15 al 18 nov; antes, domingo a sábado): cuánto se le debe a cada persona (sueldo por día, comisiones,
 * propinas y libro) y si ya se pagó. Por omisión, el último periodo cerrado. Dueño, gerencia y consulta.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(PAY_RECEIPT_ROLES);
        const supabase = await createSupabaseServerClient();

        const { data: business, error: businessError } = await supabase.from('businesses').select('timezone').eq('id', context.businessId).single();
        if (businessError) throw businessError;
        const timezone = (business as unknown as { timezone: string }).timezone;

        const now = new Date();
        const latestClosed = latestClosedPayPeriod(now, timezone);
        const requested = request.nextUrl.searchParams.get('period_start');
        const periodStart = requested ?? latestClosed.start;
        if (!DateSchema.safeParse(periodStart).success || !isPayPeriodStart(periodStart)) {
            throw new AuthorizationError('Ese día no inicia un periodo de pago (AAAA-MM-DD).', 400);
        }
        const period = payPeriodForDate(periodStart, timezone);
        const periodEnd = period.end;

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
        // La base es la verdad: si su ventana no es la que calcula la app, la regla quedó desincronizada y no se muestra.
        const dbWindowEnd = first?.window_end ? Date.parse(first.window_end) : Number.NaN;
        if (Number.isFinite(dbWindowEnd) && dbWindowEnd !== Date.parse(period.windowEnd)) {
            throw new Error(`Periodo de pago desincronizado entre la app y la base (${periodStart}).`);
        }
        return Response.json({
            period_start: periodStart,
            period_end: periodEnd,
            pay_date: first?.pay_date ?? period.payDate,
            is_transition: first?.is_transition ?? period.isTransition,
            period_days: period.days,
            is_closed: isPayPeriodClosed(period, now),
            timezone,
            window_start: first?.window_start ?? period.windowStart,
            window_end: first?.window_end ?? period.windowEnd,
            is_latest_closed: periodStart === latestClosed.start,
            latest_closed_start: latestClosed.start,
            current_start: payPeriodAt(now, timezone).start,
            previous_start: previousPayPeriod(period, timezone).start,
            next_start: nextPayPeriod(period, timezone).start,
            rows,
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/**
 * Paga el periodo de una persona (se puede desde el cierre; el sábado es la fecha de pago, solo informativa): el servidor calcula el total (sueldo por día incluido), valida los pagos y genera el
 * folio. El efectivo sale de la caja abierta con el mismo freno de siempre.
 */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const parsed = SettleSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        }
        const periodEnd = payPeriodEndOf(parsed.data.period_start);
        if (!periodEnd) {
            return Response.json({ error: 'Ese día no inicia un periodo de pago.' }, { status: 400, headers: NO_STORE });
        }
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('settle_commissions', {
            p_branch_id: context.branchId,
            p_employee_id: parsed.data.employee_id,
            p_period_start: parsed.data.period_start,
            p_period_end: periodEnd,
            p_payments: parsed.data.payments,
        } as never);
        if (error) throw error;
        return Response.json(data, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
