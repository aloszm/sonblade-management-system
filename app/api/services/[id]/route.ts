import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { DurationSchema, ServiceCategorySchema, SortOrderSchema } from '@/lib/services/schema';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';

type RouteContext = { params: Promise<{ id: string }> };
const PatchSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), price: z.number().finite().min(0).max(100000).optional(), duration_minutes: DurationSchema.optional(), category: ServiceCategorySchema.optional(), sort_order: SortOrderSchema.optional(), description: z.string().max(500).nullable().optional(), is_active: z.boolean().optional(), variable_price: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: NextRequest, { params }: RouteContext) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const { id } = await params;
        const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Los datos del servicio no son válidos.' }, { status: 400 });
        const { data, error } = await (await createSupabaseServerClient()).from('services').update(parsed.data)
            .eq('business_id', context.businessId).eq('id', id).select().maybeSingle();
        if (error) throw error;
        if (!data) return Response.json({ error: 'Servicio no encontrado.' }, { status: 404 });
        return Response.json(data);
    } catch (error) { return authErrorResponse(error); }
}

// La pantalla de servicios edita y activa/desactiva con PUT y manda el servicio completo:
// se toman solo los campos editables y se aplica igual que PATCH.
export async function PUT(request: NextRequest, context: RouteContext) {
    const body = await request.json().catch(() => null) as Record<string, unknown> | null;
    const editable = ['name', 'price', 'duration_minutes', 'description', 'is_active', 'variable_price', 'category', 'sort_order'];
    const picked = body && typeof body === 'object'
        ? Object.fromEntries(editable.filter((key) => body[key] !== undefined && body[key] !== null).map((key) => [key, body[key]]))
        : null;
    return PATCH(new NextRequest(request.url, { method: 'PATCH', headers: request.headers, body: JSON.stringify(picked) }), context);
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const { id } = await params;
        const { data, error } = await (await createSupabaseServerClient()).from('services').update({ is_active: false })
            .eq('business_id', context.businessId).eq('id', id).select('id').maybeSingle();
        if (error) throw error;
        if (!data) return Response.json({ error: 'Servicio no encontrado.' }, { status: 404 });
        return Response.json({ success: true });
    } catch (error) { return authErrorResponse(error); }
}

