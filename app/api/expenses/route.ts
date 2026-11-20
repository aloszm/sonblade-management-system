import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES, MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { loadMemberNames } from '@/lib/auth/member-names';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { businessDayRange, loadBusinessTimezone } from '@/lib/business/timezone';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AmountSchema, DaySchema, IdSchema, IdempotencyKeySchema, NO_STORE, PinSchema, badRequest, needsPin, num } from '@/lib/money/api';
import { EXPENSE_STATUSES, PAID_FROM } from '@/lib/expenses/rules';
import { REASON_MAX, REASON_MIN } from '@/lib/cash/reasons';

export const dynamic = 'force-dynamic';

const ListSchema = z.object({
    from: DaySchema.optional(),
    to: DaySchema.optional(),
    category_id: IdSchema.optional(),
    paid_from: z.enum(PAID_FROM).optional(),
    status: z.enum([...EXPENSE_STATUSES, 'all']).optional(),
    limit: z.coerce.number().int().min(1).max(1000).optional(),
});

const optionalText = (max: number, message: string) => z.string().trim().max(max, message).optional().transform((v) => (v ? v : undefined));

const CreateSchema = z.object({
    paid_from: z.enum(PAID_FROM, { message: 'Indica de dónde salió el dinero: caja, sobre o banco.' }),
    amount: AmountSchema,
    category_id: IdSchema,
    description: z.string({ message: 'Escribe el concepto del gasto (de 2 a 300 letras).' }).trim()
        .min(2, 'Escribe el concepto del gasto (de 2 a 300 letras).').max(300, 'Escribe el concepto del gasto (de 2 a 300 letras).'),
    // Si no llega, la base usa el concepto como comentario de la bitácora (debe tener al menos 5 letras).
    comment: z.string().trim().max(REASON_MAX, `El comentario es muy largo (máximo ${REASON_MAX} letras).`).optional()
        .refine((v) => !v || v.length >= REASON_MIN, `Escribe un comentario (de ${REASON_MIN} a ${REASON_MAX} letras).`),
    incurred_on: DaySchema.optional(),
    method: z.enum(['cash', 'card', 'transfer', 'other']).optional(),
    envelope_id: IdSchema.optional(),
    vendor: optionalText(120, 'El nombre del proveedor es muy largo (máximo 120 letras).'),
    receipt_path: optionalText(300, 'Ruta de comprobante inválida.'),
    recurring_expense_id: IdSchema.optional(),
    idempotency_key: IdempotencyKeySchema,
    pin: PinSchema,
});

type ExpenseRow = {
    id: string; status: 'posted' | 'cancelled'; category: string; category_id: string; description: string; amount: number | string;
    method: string; incurred_at: string; created_at: string; created_by: string; paid_from: string; cash_session_id: string | null;
    envelope_id: string | null; vendor: string | null; receipt_path: string | null; recurring_expense_id: string | null;
    cancelled_by: string | null; cancelled_at: string | null; cancel_reason: string | null;
};

const COLUMNS = 'id, status, category, category_id, description, amount, method, incurred_at, created_at, created_by, paid_from, cash_session_id, envelope_id, vendor, receipt_path, recurring_expense_id, cancelled_by, cancelled_at, cancel_reason';

/** Gastos de la sucursal con filtros (dueño, gerencia y consulta). Fechas por día del negocio sobre incurred_at. */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const search = request.nextUrl.searchParams;
        const parsed = ListSchema.safeParse(Object.fromEntries([...search.entries()].filter(([, v]) => v !== '')));
        if (!parsed.success) return badRequest(parsed.error);
        const f = parsed.data;
        const supabase = await createSupabaseServerClient();
        let query = supabase.from('expenses').select(COLUMNS)
            .eq('business_id', context.businessId).eq('branch_id', context.branchId)
            .order('incurred_at', { ascending: false }).order('created_at', { ascending: false })
            .limit(f.limit ?? 500);
        if (f.from || f.to) {
            const timezone = await loadBusinessTimezone(supabase, context.businessId);
            const range = businessDayRange(f.from ?? '2000-01-01', f.to ?? '2999-12-31', timezone);
            if (f.from) query = query.gte('incurred_at', range.from);
            if (f.to) query = query.lt('incurred_at', range.to);
        }
        if (f.category_id) query = query.eq('category_id', f.category_id);
        if (f.paid_from) query = query.eq('paid_from', f.paid_from);
        if (f.status && f.status !== 'all') query = query.eq('status', f.status);
        const { data, error } = await query;
        if (error) throw error;
        const rows = (data ?? []) as unknown as ExpenseRow[];
        const names = await loadMemberNames(supabase, context.businessId, rows.flatMap((row) => [row.created_by, row.cancelled_by]));
        const expenses = rows.map((row) => ({
            ...row,
            amount: num(row.amount),
            payment_method: row.method,
            created_by_name: names.get(row.created_by) ?? null,
            cancelled_by_name: row.cancelled_by ? names.get(row.cancelled_by) ?? null : null,
            has_receipt: Boolean(row.receipt_path),
        }));
        const posted = expenses.filter((row) => row.status === 'posted');
        const cents = (list: typeof expenses) => list.reduce((sum, row) => sum + Math.round(row.amount * 100), 0) / 100;
        const totals = {
            posted: cents(posted),
            cancelled: cents(expenses.filter((row) => row.status === 'cancelled')),
            by_paid_from: Object.fromEntries(PAID_FROM.map((p) => [p, cents(posted.filter((row) => row.paid_from === p))])),
            count: expenses.length,
        };
        return Response.json({ expenses, totals, can_edit: MANAGEMENT_ROLES.includes(context.role) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Registra un gasto (dueño y gerencia, con PIN): del sobre, del banco o de la caja del día. */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const d = parsed.data;
        if (!d.pin) return needsPin('Confirma el gasto con tu PIN.');
        const outcome = await runWithPin(context, d.pin, async (client) => {
            const { data, error } = await client.rpc('record_expense', {
                p_branch_id: context.branchId,
                p_paid_from: d.paid_from,
                p_amount: d.amount,
                p_category_id: d.category_id,
                p_description: d.description,
                p_comment: d.comment,
                p_incurred_on: d.incurred_on,
                p_method: d.method,
                p_envelope_id: d.envelope_id,
                p_vendor: d.vendor,
                p_receipt_path: d.receipt_path,
                p_recurring_expense_id: d.recurring_expense_id,
                p_idempotency_key: d.idempotency_key,
            });
            if (error) throw error;
            return data as Record<string, unknown> | null;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        const v = outcome.value ?? {};
        return Response.json({
            ...v,
            amount: num(v.amount),
            envelope_balance: v.envelope_balance === null || v.envelope_balance === undefined ? null : num(v.envelope_balance),
            replayed: Boolean(v.replayed),
        }, { status: v.replayed ? 200 : 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
