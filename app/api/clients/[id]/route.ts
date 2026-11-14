import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

type RouteContext = { params: Promise<{ id: string }> };
// Un campo opcional que llega vacío ('') se guarda como nulo; si no llega, no se toca.
const patchText = (max: number) => z.string().trim().max(max).nullable().optional().transform((value) => (value === undefined ? undefined : value || null));
const ClientPatchSchema = z.object({
    name: z.string().trim().min(2, 'El nombre es muy corto.').max(120).optional(),
    phone: patchText(32),
    email: z.union([z.literal(''), z.string().trim().email('El correo no es válido.').max(254)]).nullable().optional()
        .transform((value) => (value === undefined ? undefined : value || null)),
    notes: patchText(1000),
    preferences: patchText(1000),
}).strict().refine((value) => Object.values(value).some((field) => field !== undefined), 'No hay cambios que guardar.');

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
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Los datos del cliente no son válidos.' }, { status: 400 });
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

