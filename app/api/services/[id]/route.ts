import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };
const PatchSchema = z.object({ name: z.string().trim().min(2).max(120).optional(), price: z.number().finite().positive().max(100000).optional(), duration_minutes: z.number().int().min(5).max(480).optional(), description: z.string().max(500).nullable().optional(), is_active: z.boolean().optional() }).strict().refine((value) => Object.keys(value).length > 0);

export async function PATCH(request: NextRequest, { params }: RouteContext) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const { id } = await params;
        const parsed = PatchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: 'Los datos del servicio no son válidos.' }, { status: 400 });
        const { data, error } = await (await createSupabaseServerClient()).from('services').update(parsed.data)
            .eq('business_id', context.businessId).eq('id', id).select().maybeSingle();
        if (error) throw error;
        if (!data) return Response.json({ error: 'Servicio no encontrado.' }, { status: 404 });
        return Response.json(data);
    } catch (error) { return authErrorResponse(error); }
}

export async function DELETE(_request: NextRequest, { params }: RouteContext) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const { id } = await params;
        const { data, error } = await (await createSupabaseServerClient()).from('services').update({ is_active: false })
            .eq('business_id', context.businessId).eq('id', id).select('id').maybeSingle();
        if (error) throw error;
        if (!data) return Response.json({ error: 'Servicio no encontrado.' }, { status: 404 });
        return Response.json({ success: true });
    } catch (error) { return authErrorResponse(error); }
}

