import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DaySchema, IdSchema, NO_STORE, badRequest, num } from '@/lib/money/api';
import { BONUS_METRICS, BONUS_METRIC_LABELS, type BonusMetric } from '@/lib/payroll/ledger';

export const dynamic = 'force-dynamic';

/**
 * Metas de bono (B7). Configurables y APAGADAS: no hay metas por omisión; sin una meta activa no se calcula ni se
 * muestra nada de bonos. Solo la cuenta principal las ve aquí y las cambia (la base también lo exige al guardar).
 */
const OWNER_ONLY = ['owner'] as const;

const name = z.string({ message: 'El nombre de la meta lleva de 2 a 80 letras.' }).trim()
    .min(2, 'El nombre de la meta lleva de 2 a 80 letras.').max(80, 'El nombre de la meta lleva de 2 a 80 letras.');
const metric = z.enum(BONUS_METRICS, { message: 'Elige la métrica: número de servicios o ventas de servicios en pesos.' });
const threshold = z.number({ message: 'Escribe la meta.' }).positive('La meta debe ser mayor a 0.').max(1_000_000, 'La meta es muy grande.');
const bonusAmount = z.number({ message: 'Escribe el monto del bono.' }).positive('El bono debe ser mayor a 0.').max(100_000, 'El bono es de máximo 100,000.')
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'El bono lleva máximo 2 decimales.');
const appliesTo = z.enum(['employee', 'all_barbers'], { message: 'Indica a quién aplica: una persona o todos los barberos.' });

const integerForCount = (d: { metric?: BonusMetric; threshold?: number }, ctx: z.RefinementCtx) => {
    if (d.metric === 'services_count' && d.threshold !== undefined && !Number.isInteger(d.threshold)) {
        ctx.addIssue({ code: 'custom', message: 'En número de servicios la meta es un número entero.', path: ['threshold'] });
    }
};

const CreateSchema = z.object({
    name,
    metric,
    threshold,
    bonus_amount: bonusAmount,
    applies_to: appliesTo,
    employee_id: IdSchema.nullable().optional(),
    valid_from: DaySchema.optional(),
    valid_to: DaySchema.nullable().optional(),
    is_active: z.boolean().optional(),
}).superRefine((d, ctx) => {
    integerForCount(d, ctx);
    if (d.applies_to === 'employee' && !d.employee_id) ctx.addIssue({ code: 'custom', message: 'Elige a la persona.', path: ['employee_id'] });
});

const PatchSchema = z.object({
    id: IdSchema,
    name: name.optional(),
    metric: metric.optional(),
    threshold: threshold.optional(),
    bonus_amount: bonusAmount.optional(),
    applies_to: appliesTo.optional(),
    employee_id: IdSchema.nullable().optional(),
    valid_from: DaySchema.optional(),
    /** null = sin fecha de fin. */
    valid_to: DaySchema.nullable().optional(),
    is_active: z.boolean().optional(),
}).superRefine(integerForCount);

type GoalRow = {
    id: string; branch_id: string; name: string; metric: BonusMetric; threshold: number | string; bonus_amount: number | string;
    applies_to: 'employee' | 'all_barbers'; employee_id: string | null; valid_from: string; valid_to: string | null; is_active: boolean;
    created_by: string; created_at: string; updated_at: string;
};

function mapGoal(row: GoalRow, employeeNames: Map<string, string>) {
    return {
        id: row.id,
        branch_id: row.branch_id,
        name: row.name,
        metric: row.metric,
        metric_label: BONUS_METRIC_LABELS[row.metric] ?? row.metric,
        threshold: num(row.threshold),
        bonus_amount: num(row.bonus_amount),
        applies_to: row.applies_to,
        employee_id: row.employee_id,
        employee_name: row.employee_id ? employeeNames.get(row.employee_id) ?? null : null,
        valid_from: row.valid_from,
        valid_to: row.valid_to,
        is_active: row.is_active,
        created_at: row.created_at,
        updated_at: row.updated_at,
    };
}

async function employeeNames(supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>, businessId: string) {
    const { data } = await supabase.from('employees').select('id, display_name').eq('business_id', businessId);
    return new Map(((data ?? []) as { id: string; display_name: string }[]).map((e) => [e.id, e.display_name]));
}

/** Metas de la sucursal (activas e inactivas). */
export async function GET() {
    try {
        const context = await requireAuthContext([...OWNER_ONLY]);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.from('bonus_goals')
            .select('id, branch_id, name, metric, threshold, bonus_amount, applies_to, employee_id, valid_from, valid_to, is_active, created_by, created_at, updated_at')
            .eq('business_id', context.businessId).eq('branch_id', context.branchId)
            .order('is_active', { ascending: false }).order('name');
        if (error) throw error;
        const names = await employeeNames(supabase, context.businessId);
        const goals = ((data ?? []) as unknown as GoalRow[]).map((row) => mapGoal(row, names));
        return Response.json({ goals, enabled: goals.some((g) => g.is_active) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Crea una meta (solo la cuenta principal). */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext([...OWNER_ONLY]);
        const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const d = parsed.data;
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('save_bonus_goal', {
            p_branch_id: context.branchId,
            p_name: d.name,
            p_metric: d.metric,
            p_threshold: d.threshold,
            p_bonus_amount: d.bonus_amount,
            p_applies_to: d.applies_to,
            p_employee_id: d.applies_to === 'employee' ? d.employee_id ?? undefined : undefined,
            p_valid_from: d.valid_from,
            p_valid_to: d.valid_to ?? undefined,
            p_is_active: d.is_active,
        });
        if (error) throw error;
        const names = await employeeNames(supabase, context.businessId);
        return Response.json({ goal: mapGoal(data as unknown as GoalRow, names) }, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Cambia una meta (solo lo que llega). `valid_to: null` la deja sin fecha de fin; `is_active: false` la apaga. */
export async function PATCH(request: NextRequest) {
    try {
        const context = await requireAuthContext([...OWNER_ONLY]);
        const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const d = parsed.data;
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('save_bonus_goal', {
            p_branch_id: context.branchId,
            p_id: d.id,
            p_name: d.name,
            p_metric: d.metric,
            p_threshold: d.threshold,
            p_bonus_amount: d.bonus_amount,
            p_applies_to: d.applies_to,
            p_employee_id: d.employee_id ?? undefined,
            p_valid_from: d.valid_from,
            p_valid_to: d.valid_to ?? undefined,
            p_is_active: d.is_active,
            p_clear_valid_to: d.valid_to === null,
        });
        if (error) throw error;
        const names = await employeeNames(supabase, context.businessId);
        return Response.json({ goal: mapGoal(data as unknown as GoalRow, names) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
