import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { isSunday } from '@/lib/settlements/week';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DaySchema, IdSchema, NO_STORE, badRequest, num } from '@/lib/money/api';
import { BONUS_METRIC_LABELS, type BonusMetric } from '@/lib/payroll/ledger';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
    employee_id: IdSchema.optional(),
    period_start: DaySchema.refine(isSunday, 'La semana debe empezar en domingo (AAAA-MM-DD).').optional(),
});

type GoalProgress = {
    goal_id: string; name: string; metric: BonusMetric; threshold: number | string; bonus_amount: number | string;
    value: number | string; achieved: boolean; remaining: number | string;
};
type Progress = {
    enabled: boolean; period_start: string; period_end: string; window_start: string; window_end: string;
    people: { employee_id: string; name: string; goals: GoalProgress[] }[];
};

/**
 * Avance de las metas de bono en una semana de pago (por omisión, la semana en curso). Para "Mi semana".
 * Dueño, gerencia y consulta ven a todos (o a `employee_id`); cualquier otro puesto solo se ve a sí mismo
 * (lo decide la base). Sin metas activas: `enabled: false` y `people: []` — la pantalla no muestra nada de bonos.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        const parsed = QuerySchema.safeParse(Object.fromEntries([...request.nextUrl.searchParams.entries()].filter(([, v]) => v !== '')));
        if (!parsed.success) return badRequest(parsed.error);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('bonus_goal_progress', {
            p_branch_id: context.branchId,
            p_employee_id: parsed.data.employee_id,
            p_period_start: parsed.data.period_start,
        });
        if (error) throw error;
        const p = data as unknown as Progress;
        return Response.json({
            ...p,
            people: (p.people ?? []).map((person) => ({
                ...person,
                goals: person.goals.map((g) => ({
                    ...g,
                    metric_label: BONUS_METRIC_LABELS[g.metric] ?? g.metric,
                    threshold: num(g.threshold),
                    bonus_amount: num(g.bonus_amount),
                    value: num(g.value),
                    remaining: num(g.remaining),
                })),
            })),
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
