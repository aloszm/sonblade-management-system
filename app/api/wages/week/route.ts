import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { loadMemberNames } from '@/lib/auth/member-names';
import { DaySchema, IdSchema, NO_STORE, badRequest, num } from '@/lib/money/api';
import { ATTENDANCE_LABELS, mapWageWeek, wageDayDetails, type AttendanceKind, type WageWeekIn } from '@/lib/payroll/wages';
import { isPayPeriodStart, payPeriodDates } from '@/lib/payroll/pay-period';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
    employee_id: IdSchema.optional(),
    period_start: DaySchema.refine((d) => isPayPeriodStart(d), 'Ese día no inicia un periodo de pago (AAAA-MM-DD).').optional(),
});

type ExceptionRow = {
    id: string; work_date: string; kind: AttendanceKind; reason: string; created_by: string; created_at: string;
    voided_at: string | null; voided_by: string | null; void_reason: string | null; can_void: boolean;
};
type PersonRow = {
    employee_id: string; name: string; settlement_id: string | null; receipt_number: string | null; settled: boolean;
    wage: WageWeekIn | null; accrued_amount: number | string; accrued_days: number | string;
    rate: { daily_amount: number | string; work_days: number[]; effective_from: string } | null;
    exceptions: ExceptionRow[]; can_edit: boolean;
};
type WeekRow = { period_start: string; period_end: string; today: string; can_edit: boolean; people: PersonRow[] };

/**
 * Sueldo por día de un periodo de pago (por omisión, el periodo en curso), con el detalle día por día, lo devengado
 * hasta hoy y las excepciones (faltó / día extra, también las anuladas). Para "Mi semana" y para gerencia.
 * Dueño, gerencia y consulta ven a todas las personas con sueldo (o a `employee_id`); cualquier otro puesto solo se ve
 * a sí mismo (lo decide la base). Semana pagada: el detalle sellado en su recibo (`settled`, `receipt_number`).
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        const parsed = QuerySchema.safeParse(Object.fromEntries([...request.nextUrl.searchParams.entries()].filter(([, v]) => v !== '')));
        if (!parsed.success) return badRequest(parsed.error);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('employee_wage_week', {
            p_branch_id: context.branchId,
            p_employee_id: parsed.data.employee_id,
            p_period_start: parsed.data.period_start,
        });
        if (error) throw error;
        const week = data as unknown as WeekRow;
        const people = week.people ?? [];
        const names = await loadMemberNames(supabase, context.businessId,
            people.flatMap((p) => p.exceptions.flatMap((x) => [x.created_by, x.voided_by])));
        // Fecha de pago y transición: de la misma regla que la base (lib/payroll/pay-period.ts).
        const dates = payPeriodDates(week.period_start);
        return Response.json({
            period_start: week.period_start,
            period_end: week.period_end,
            pay_date: dates.payDate,
            is_transition: dates.isTransition,
            today: week.today,
            can_edit: week.can_edit,
            people: people.map((p) => {
                const wage = mapWageWeek(p.wage);
                return {
                    employee_id: p.employee_id,
                    name: p.name,
                    settled: p.settled,
                    settlement_id: p.settlement_id,
                    receipt_number: p.receipt_number,
                    can_edit: p.can_edit,
                    rate: p.rate ? { ...p.rate, daily_amount: num(p.rate.daily_amount) } : null,
                    amount: wage?.amount ?? 0,
                    summary: wage ? `Sueldo: ${wage.summary}` : null,
                    accrued_amount: num(p.accrued_amount),
                    accrued_days: num(p.accrued_days),
                    wage,
                    day_lines: wage ? wageDayDetails(wage) : [],
                    exceptions: p.exceptions.map((x) => ({
                        ...x,
                        label: ATTENDANCE_LABELS[x.kind] ?? x.kind,
                        created_by_name: names.get(x.created_by) ?? null,
                        voided_by_name: x.voided_by ? names.get(x.voided_by) ?? null : null,
                    })),
                };
            }),
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
