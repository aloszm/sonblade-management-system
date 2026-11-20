import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { IdSchema, NO_STORE, badRequest } from '@/lib/money/api';

export const dynamic = 'force-dynamic';

const NAME_MESSAGE = 'El nombre de la categoría lleva de 2 a 60 letras.';
const NameSchema = z.string({ message: NAME_MESSAGE }).trim().min(2, NAME_MESSAGE).max(60, NAME_MESSAGE);
const SortSchema = z.number().int().min(0).max(10000);
const CreateSchema = z.object({ name: NameSchema, sort_order: SortSchema.optional() });
const UpdateSchema = z.object({ id: IdSchema, name: NameSchema.optional(), is_active: z.boolean().optional(), sort_order: SortSchema.optional() })
    .refine((v) => v.name !== undefined || v.is_active !== undefined || v.sort_order !== undefined, 'No hay cambios que guardar.');

type CategoryRow = { id: string; name: string; is_active: boolean; affects_profit: boolean; sort_order: number };

/** Categorías de gastos del negocio. ?all=1 incluye las desactivadas (para administrarlas). */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const supabase = await createSupabaseServerClient();
        let query = supabase.from('expense_categories').select('id, name, is_active, affects_profit, sort_order')
            .eq('business_id', context.businessId).order('sort_order').order('name');
        if (request.nextUrl.searchParams.get('all') !== '1') query = query.eq('is_active', true);
        const { data, error } = await query;
        if (error) throw error;
        return Response.json({ categories: (data ?? []) as CategoryRow[], can_edit: context.role === 'owner' }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

async function save(args: { p_business_id: string; p_id?: string; p_name?: string; p_is_active?: boolean; p_sort_order?: number }) {
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.rpc('save_expense_category', args);
    if (error) throw error;
    return data;
}

/** Nueva categoría. Solo la cuenta principal. */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner']);
        const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const data = await save({ p_business_id: context.businessId, p_name: parsed.data.name, p_sort_order: parsed.data.sort_order });
        return Response.json(data, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Renombrar, activar/desactivar u ordenar. Solo la cuenta principal. "General" no se renombra ni se desactiva. */
export async function PATCH(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner']);
        const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const data = await save({
            p_business_id: context.businessId, p_id: parsed.data.id, p_name: parsed.data.name,
            p_is_active: parsed.data.is_active, p_sort_order: parsed.data.sort_order,
        });
        return Response.json(data, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
