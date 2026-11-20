import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES, MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { loadMemberNames } from '@/lib/auth/member-names';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { businessDayRange, loadBusinessTimezone } from '@/lib/business/timezone';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AmountSchema, DaySchema, IdSchema, IdempotencyKeySchema, NO_STORE, PinSchema, badRequest, needsPin } from '@/lib/money/api';
import { REASON_MAX, REASON_MIN } from '@/lib/cash/reasons';
import {
    LEDGER_PAID_FROM, MANUAL_ENTRY_TYPES, mapLedgerResult, mapLedgerRow, mapLoanRow, paidFromRule, pendingSummary,
    type LedgerRow, type LoanRow,
} from '@/lib/payroll/ledger';

export const dynamic = 'force-dynamic';

const ListSchema = z.object({
    employee_id: IdSchema.optional(),
    from: DaySchema.optional(),
    to: DaySchema.optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const REASON_MESSAGE = `Escribe el motivo (de ${REASON_MIN} a ${REASON_MAX} letras).`;
const CreateSchema = z.object({
    employee_id: IdSchema,
    entry_type: z.enum(MANUAL_ENTRY_TYPES, { message: 'Elige el tipo: adelanto, préstamo, abono a préstamo o descuento.' }),
    amount: AmountSchema,
    reason: z.string({ message: REASON_MESSAGE }).trim().min(REASON_MIN, REASON_MESSAGE).max(REASON_MAX, REASON_MESSAGE),
    paid_from: z.enum(LEDGER_PAID_FROM, { message: 'Indica de dónde sale el dinero: sobre, caja del día o banco.' }).nullable().optional(),
    method: z.enum(['cash', 'card', 'transfer', 'other']).optional(),
    envelope_id: IdSchema.optional(),
    loan_id: IdSchema.optional(),
    weekly_amount: AmountSchema.optional(),
    idempotency_key: IdempotencyKeySchema,
    pin: PinSchema,
}).superRefine((d, ctx) => {
    const problem = paidFromRule(d.entry_type, d.paid_from);
    if (problem) ctx.addIssue({ code: 'custom', message: problem, path: ['paid_from'] });
    if (d.entry_type === 'loan' && d.weekly_amount === undefined) ctx.addIssue({ code: 'custom', message: 'Indica el abono por semana del préstamo.', path: ['weekly_amount'] });
    if (d.entry_type === 'loan' && d.weekly_amount !== undefined && d.weekly_amount > d.amount) ctx.addIssue({ code: 'custom', message: 'El abono por semana no puede ser mayor que el préstamo.', path: ['weekly_amount'] });
    if (d.entry_type !== 'loan' && d.weekly_amount !== undefined) ctx.addIssue({ code: 'custom', message: 'El abono por semana solo aplica a un préstamo nuevo.', path: ['weekly_amount'] });
    if (d.entry_type === 'loan_payment' && !d.loan_id) ctx.addIssue({ code: 'custom', message: 'Elige el préstamo al que se abona.', path: ['loan_id'] });
    if (d.entry_type !== 'loan_payment' && d.loan_id) ctx.addIssue({ code: 'custom', message: 'Solo un abono lleva préstamo.', path: ['loan_id'] });
});

/**
 * Libro del empleado: asientos, préstamos con saldo y lo pendiente para el siguiente recibo.
 * Dueño, gerencia y consulta: todo el equipo (o `employee_id`). Cualquier otro puesto: solo lo suyo
 * (se ignora `employee_id`); la RLS de la base filtra lo mismo.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        const parsed = ListSchema.safeParse(Object.fromEntries([...request.nextUrl.searchParams.entries()].filter(([, v]) => v !== '')));
        if (!parsed.success) return badRequest(parsed.error);
        const f = parsed.data;
        const isManagement = MANAGEMENT_READ_ROLES.includes(context.role);
        const employeeId = isManagement ? f.employee_id ?? null : context.employeeId;
        if (!isManagement && !employeeId) throw new AuthorizationError('Tu cuenta no tiene ficha de empleado.', 403);

        const supabase = await createSupabaseServerClient();
        let from: string | null = null;
        let to: string | null = null;
        if (f.from || f.to) {
            const timezone = await loadBusinessTimezone(supabase, context.businessId);
            const range = businessDayRange(f.from ?? '2000-01-01', f.to ?? '2999-12-31', timezone);
            from = f.from ? range.from : null;
            to = f.to ? range.to : null;
        }
        const [entriesResult, loansResult] = await Promise.all([
            supabase.rpc('employee_ledger_list', {
                p_branch_id: context.branchId, p_employee_id: employeeId ?? undefined,
                p_from: from ?? undefined, p_to: to ?? undefined, p_limit: f.limit ?? 200,
            }),
            supabase.rpc('employee_loans_with_balance', { p_branch_id: context.branchId, p_employee_id: employeeId ?? undefined }),
        ]);
        if (entriesResult.error) throw entriesResult.error;
        if (loansResult.error) throw loansResult.error;
        const rows = (entriesResult.data ?? []) as unknown as LedgerRow[];
        const names = await loadMemberNames(supabase, context.businessId, rows.map((row) => row.created_by));
        const entries = rows.map((row) => mapLedgerRow(row, names));
        const loans = ((loansResult.data ?? []) as unknown as LoanRow[]).map(mapLoanRow);
        return Response.json({
            employee_id: employeeId,
            entries,
            loans,
            pending: pendingSummary(entries),
            can_edit: MANAGEMENT_ROLES.includes(context.role),
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/**
 * Registra un adelanto, préstamo, abono a préstamo o descuento (dueño y gerencia, con PIN y motivo).
 * El dinero sale (o entra) del sobre, de la caja del día o del banco según `paid_from`; la base aplica el candado de
 * efectivo (saldo del sobre / efectivo disponible en caja) y responde 409 si no alcanza.
 */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const d = parsed.data;
        if (!d.pin) return needsPin('Confirma con tu PIN.');
        const outcome = await runWithPin(context, d.pin, async (client) => {
            const { data, error } = await client.rpc('record_employee_ledger_entry', {
                p_branch_id: context.branchId,
                p_employee_id: d.employee_id,
                p_entry_type: d.entry_type,
                p_amount: d.amount,
                p_reason: d.reason,
                p_paid_from: d.paid_from ?? undefined,
                p_method: d.method,
                p_envelope_id: d.envelope_id,
                p_loan_id: d.loan_id,
                p_weekly_amount: d.weekly_amount,
                p_idempotency_key: d.idempotency_key,
            });
            if (error) throw error;
            return data as Record<string, unknown> | null;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        const result = mapLedgerResult(outcome.value);
        return Response.json(result, { status: result.replayed ? 200 : 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
