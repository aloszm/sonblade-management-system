import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };
const ClientPatchSchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    email: z.string().trim().email().max(254).nullable().optional(),
    notes: z.string().max(1000).nullable().optional(),
    preferences: z.string().max(1000).nullable().optional(),
}).strict().refine((value) => Object.keys(value).length > 0);

export async function GET(_request: NextRequest, { params }: RouteContext) {
    try {
        const context = await requireAuthContext();
        const { id } = await params;
        const { data, error } = await (await createSupabaseServerClient()).from('clients')
            .select('id, full_name, phone, email, notes, preferences, created_at, updated_at')
            .eq('business_id', context.businessId).eq('id', id).maybeSingle();
        if (error) throw error;
        if (!data) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
        return NextResponse.json({ ...data, name: data.full_name }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
    try {
        const context = await requireAuthContext(['owner', 'admin', 'cashier', 'receptionist']);
        const { id } = await params;
        const parsed = ClientPatchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Los datos del cliente no son válidos.' }, { status: 400 });
        const { name, ...rest } = parsed.data;
        const { data, error } = await (await createSupabaseServerClient()).from('clients')
            .update({ ...rest, ...(name ? { full_name: name } : {}) })
            .eq('business_id', context.businessId).eq('id', id)
            .select('id, full_name, phone, email, notes, preferences, created_at, updated_at').maybeSingle();
        if (error) throw error;
        if (!data) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
        return NextResponse.json({ ...data, name: data.full_name });
    } catch (error) { return authErrorResponse(error); }
}

export async function DELETE() {
    return NextResponse.json({ error: 'Los clientes con historial no se eliminan; desactiva el acceso o registra una solicitud de privacidad.' }, { status: 405 });
}

