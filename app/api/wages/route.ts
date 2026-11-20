import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES, OWNER_ONLY_ROLES } from '@/lib/auth/roles';
import { loadMemberNames } from '@/lib/auth/member-names';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { loadBusinessTimezone } from '@/lib/business/timezone';
import { REASON_MAX, REASON_MIN } from '@/lib/cash/reasons';
import { DaySchema, IdSchema, NO_STORE, PinSchema, badRequest, needsPin, num } from '@/lib/money/api';
import { currentPayWeekStart, rateAt, workDaysLabel, type WageRateRow } from '@/lib/payroll/wages';
import { localClock } from '@/lib/settlements/week';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Solo la cuenta principal cambia el sueldo por día (la base también lo exige, con PIN). */

const ListSchema = z.object({ employee_id: IdSchema.optional() });

const REASON_MESSAGE = `Escribe el motivo (de ${REASON_MIN} a ${REASON_MAX} letras).`;
const DAILY_MESSAGE = 'El sueldo por día va de $0 a $100,000, con máximo 2 decimales.';
const DAYS_MESSAGE = 'Los días fijos van de 0 (domingo) a 6 (sábado).';
const SaveSchema = z.object({
    employee_id: IdSchema,
    daily_amount: z.number({ message: DAILY_MESSAGE }).min(0, DAILY_MESSAGE).max(100_000, DAILY_MESSAGE)
        .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, DAILY_MESSAGE),
    work_days: z.array(z.number({ message: DAYS_MESSAGE }).int(DAYS_MESSAGE).min(0, DAYS_MESSAGE).max(6, DAYS_MESSAGE), { message: DAYS_MESSAGE })
        .max(7, DAYS_MESSAGE),
    /** Vacío = domingo de la semana de pago en curso. Nunca antes de ese domingo. */
    effective_from: DaySchema.optional(),
    reason: z.string({ message: REASON_MESSAGE }).trim().min(REASON_MIN, REASON_MESSAGE).max(REASON_MAX, REASON_MESSAGE),
    pin: PinSchema,
});

type RateRow = WageRateRow & { branch_id: string };

function mapRate(row: RateRow, names: Map<string, string>, employees: Map<string, string>) {
    const workDays = [...(row.work_days ?? [])].map(Number).sort((a, b) => a - b);
    return {
        id: row.id,
        employee_id: row.employee_id,
        employee_name: employees.get(row.employee_id) ?? null,
        daily_amount: num(row.daily_amount),
        work_days: workDays,
        work_days_label: workDaysLabel(workDays),
        effective_from: row.effective_from,
        reason: row.reason,
        created_by: row.created_by,
        created_by_name: names.get(row.created_by) ?? null,
        created_at: row.created_at,
    };
}

/**
 * Fichas de sueldo por día (historial con vigencia) y la vigente hoy de cada persona.
 * Dueño, gerencia y consulta: todo el equipo (o `employee_id`). Cualquier otro puesto: solo la suya (la RLS de la
 * base filtra lo mismo). `can_edit` solo para la cuenta principal; `min_effective_from` = domingo de la semana en curso.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        const parsed = ListSchema.safeParse(Object.fromEntries([...request.nextUrl.searchParams.entries()].filter(([, v]) => v !== '')));
        if (!parsed.success) return badRequest(parsed.error);
        const isManagement = MANAGEMENT_READ_ROLES.includes(context.role);
        const employeeId = isManagement ? parsed.data.employee_id ?? null : context.employeeId;
        if (!isManagement && !employeeId) throw new AuthorizationError('Tu cuenta no tiene ficha de empleado.', 403);

        const supabase = await createSupabaseServerClient();
        let query = supabase.from('employee_wage_rates')
            .select('id, branch_id, employee_id, daily_amount, work_days, effective_from, reason, created_by, created_at')
            .eq('business_id', context.businessId).eq('branch_id', context.branchId);
        if (employeeId) query = query.eq('employee_id', employeeId);
        const [ratesResult, employeesResult, timezone] = await Promise.all([
            query.order('effective_from', { ascending: false }).order('created_at', { ascending: false }),
            supabase.from('employees').select('id, display_name').eq('business_id', context.businessId),
            loadBusinessTimezone(supabase, context.businessId),
        ]);
        if (ratesResult.error) throw ratesResult.error;
        if (employeesResult.error) throw employeesResult.error;
        const rows = (ratesResult.data ?? []) as unknown as RateRow[];
        const employees = new Map(((employeesResult.data ?? []) as { id: string; display_name: string }[]).map((e) => [e.id, e.display_name]));
        const names = await loadMemberNames(supabase, context.businessId, rows.map((r) => r.created_by));
        const rates = rows.map((row) => mapRate(row, names, employees));

        const now = new Date();
        const today = localClock(now, timezone).date;
        const byEmployee = new Map<string, typeof rates>();
        for (const rate of rates) byEmployee.set(rate.employee_id, [...(byEmployee.get(rate.employee_id) ?? []), rate]);
        const current = [...byEmployee.entries()].map(([id, list]) => {
            const active = rateAt(list, today);
            const upcoming = list.filter((r) => r.effective_from > today)
                .sort((a, b) => a.effective_from.localeCompare(b.effective_from) || b.created_at.localeCompare(a.created_at))[0] ?? null;
            return { employee_id: id, employee_name: employees.get(id) ?? null, current: active, next: upcoming };
        }).sort((a, b) => (a.employee_name ?? '').localeCompare(b.employee_name ?? '', 'es'));

        return Response.json({
            employee_id: employeeId,
            today,
            min_effective_from: currentPayWeekStart(now, timezone),
            rates,
            current,
            can_edit: context.role === 'owner',
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/**
 * Guarda el sueldo por día de una persona (monto diario y días fijos) con vigencia desde una fecha.
 * Solo la cuenta principal, con PIN y motivo. No borra ni cambia lo anterior: agrega una ficha nueva.
 * La base rechaza vigencias anteriores al domingo de la semana en curso o que caigan en una semana ya pagada.
 */
export async function PUT(request: NextRequest) {
    try {
        const context = await requireAuthContext(OWNER_ONLY_ROLES);
        const parsed = SaveSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const d = parsed.data;
        if (!d.pin) return needsPin('Confirma el cambio de sueldo con tu PIN.');
        const outcome = await runWithPin(context, d.pin, async (client) => {
            const { data, error } = await client.rpc('set_employee_wage', {
                p_branch_id: context.branchId,
                p_employee_id: d.employee_id,
                p_daily_amount: d.daily_amount,
                p_work_days: d.work_days,
                p_reason: d.reason,
                p_effective_from: d.effective_from,
            });
            if (error) throw error;
            return data as Record<string, unknown> | null;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        const v = outcome.value ?? {};
        const previous = v.previous as Record<string, unknown> | null | undefined;
        return Response.json({
            ...v,
            daily_amount: num(v.daily_amount),
            work_days_label: workDaysLabel((v.work_days as number[] | undefined) ?? []),
            previous: previous ? { ...previous, daily_amount: num(previous.daily_amount) } : null,
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
