import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES, MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { AmountSchema, IdSchema, NO_STORE, badRequest, num } from '@/lib/money/api';

export const dynamic = 'force-dynamic';

const NAME_MESSAGE = 'El nombre del gasto fijo lleva de 2 a 80 letras.';
const Fields = {
    name: z.string({ message: NAME_MESSAGE }).trim().min(2, NAME_MESSAGE).max(80, NAME_MESSAGE),
    category_id: IdSchema,
    suggested_amount: AmountSchema,
    day_of_month: z.number({ message: 'El día del mes va de 1 a 31.' }).int().min(1, 'El día del mes va de 1 a 31.').max(31, 'El día del mes va de 1 a 31.'),
    paid_from: z.enum(['envelope', 'bank'], { message: 'Un gasto fijo se paga del sobre o del banco.' }),
    method: z.enum(['cash', 'card', 'transfer', 'other']).optional(),
    // Cadena vacía quita el proveedor.
    vendor: z.string().trim().max(120, 'El nombre del proveedor es muy largo (máximo 120 letras).').optional(),
    is_active: z.boolean().optional(),
    // Punto de equilibrio: cada cuántos meses se paga (luz bimestral = 2), orden de las cubetas y monto estimado.
    every_months: z.number({ message: 'Cada cuántos meses se paga: de 1 a 12.' }).int('Cada cuántos meses se paga: de 1 a 12.')
        .min(1, 'Cada cuántos meses se paga: de 1 a 12.').max(12, 'Cada cuántos meses se paga: de 1 a 12.').optional(),
    sort_order: z.number({ message: 'El orden va de 0 a 10,000.' }).int().min(0, 'El orden va de 0 a 10,000.').max(10_000, 'El orden va de 0 a 10,000.').optional(),
    is_estimate: z.boolean().optional(),
};
const CreateSchema = z.object(Fields);
const UpdateSchema = z.object({
    id: IdSchema,
    name: Fields.name.optional(), category_id: Fields.category_id.optional(), suggested_amount: Fields.suggested_amount.optional(),
    day_of_month: Fields.day_of_month.optional(), paid_from: Fields.paid_from.optional(), method: Fields.method,
    vendor: Fields.vendor, is_active: Fields.is_active,
    every_months: Fields.every_months, sort_order: Fields.sort_order, is_estimate: Fields.is_estimate,
});

type TemplateRow = {
    id: string; name: string; category_id: string; suggested_amount: number | string; day_of_month: number; paid_from: string;
    method: string; vendor: string | null; is_active: boolean; created_at: string; updated_at: string;
    every_months?: number; sort_order?: number; is_estimate?: boolean;
};
const shape = (row: TemplateRow) => ({ ...row, suggested_amount: num(row.suggested_amount) });

/** Plantillas de gastos fijos de la sucursal (dueño, gerencia y consulta). ?all=1 incluye las desactivadas. */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const supabase = await createSupabaseServerClient();
        let query = supabase.from('recurring_expenses')
            .select('id, name, category_id, suggested_amount, day_of_month, paid_from, method, vendor, is_active, created_at, updated_at, every_months, sort_order, is_estimate')
            .eq('business_id', context.businessId).eq('branch_id', context.branchId).order('day_of_month').order('name');
        if (request.nextUrl.searchParams.get('all') !== '1') query = query.eq('is_active', true);
        const { data, error } = await query;
        if (error) throw error;
        return Response.json({ templates: ((data ?? []) as TemplateRow[]).map(shape), can_edit: MANAGEMENT_ROLES.includes(context.role) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

type SaveInput = Partial<z.infer<typeof CreateSchema>> & { id?: string };
async function save(branchId: string, input: SaveInput) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('save_recurring_expense', {
        p_branch_id: branchId,
        p_id: input.id,
        p_name: input.name,
        p_category_id: input.category_id,
        p_suggested_amount: input.suggested_amount,
        p_day_of_month: input.day_of_month,
        p_paid_from: input.paid_from,
        p_method: input.method,
        p_vendor: input.vendor,
        p_is_active: input.is_active,
        p_every_months: input.every_months,
        p_sort_order: input.sort_order,
        p_is_estimate: input.is_estimate,
    });
    if (error) throw error;
    return shape(data as unknown as TemplateRow);
}

/** Nueva plantilla (dueño y gerencia; no mueve dinero, sin PIN). */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        return Response.json(await save(context.branchId, parsed.data), { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Cambiar una plantilla (incluye desactivarla con is_active: false). Dueño y gerencia. */
export async function PATCH(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        return Response.json(await save(context.branchId, parsed.data), { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
