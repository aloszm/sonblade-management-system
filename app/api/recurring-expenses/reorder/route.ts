import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { IdSchema, NO_STORE, badRequest } from '@/lib/money/api';

export const dynamic = 'force-dynamic';

const BodySchema = z.object({
    ids: z.array(IdSchema, { message: 'Indica el orden de los gastos fijos.' }).min(1, 'Indica el orden de los gastos fijos.').max(200)
        .refine((ids) => new Set(ids).size === ids.length, 'El orden trae gastos repetidos.'),
});

/**
 * Orden de las cubetas del punto de equilibrio: los ids en el orden deseado (los que no vengan quedan después).
 * Mismos puestos que editar una plantilla (cuenta principal y gerencia; la base lo vuelve a revisar y deja bitácora).
 */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const parsed = BodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('reorder_recurring_expenses', { p_branch_id: context.branchId, p_ids: parsed.data.ids });
        if (error) throw error;
        return Response.json({ order: data ?? [] }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
