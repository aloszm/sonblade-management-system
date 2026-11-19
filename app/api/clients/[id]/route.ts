import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { CLIENT_EDIT_ROLES } from '@/lib/barber/permissions';
import { CLIENT_COLUMNS, withSummaries, type ClientRow } from '@/lib/clients/summary';

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
    /** Desactivar (false) o reactivar (true). Nunca se borra un cliente. */
    is_active: z.boolean().optional(),
}).strict().refine((value) => Object.values(value).some((field) => field !== undefined), 'No hay cambios que guardar.');

const IdSchema = z.string().uuid();

/** Ficha del cliente con su resumen. El barbero solo abre clientes con citas o ventas con él (si no, 404). */
export async function GET(_request: NextRequest, { params }: RouteContext) {
    try {
        const context = await requireAuthContext();
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.from('clients').select(CLIENT_COLUMNS)
            .eq('business_id', context.businessId).eq('id', id.data).maybeSingle();
        if (error) throw error;
        if (!data) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
        const [client] = await withSummaries(supabase as unknown as SupabaseClient, context.branchId, [data as unknown as ClientRow]);
        return NextResponse.json(client, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
    try {
        const context = await requireAuthContext(CLIENT_EDIT_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
        const parsed = ClientPatchSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Los datos del cliente no son válidos.' }, { status: 400 });
        const { name, ...rest } = parsed.data;
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.from('clients')
            .update({ ...rest, ...(name ? { full_name: name } : {}), updated_at: new Date().toISOString() })
            .eq('business_id', context.businessId).eq('id', id.data)
            .select(CLIENT_COLUMNS).maybeSingle();
        if (error) throw error;
        if (!data) return NextResponse.json({ error: 'Cliente no encontrado.' }, { status: 404 });
        const [client] = await withSummaries(supabase as unknown as SupabaseClient, context.branchId, [data as unknown as ClientRow]);
        return NextResponse.json(client);
    } catch (error) { return authErrorResponse(error); }
}

export async function DELETE() {
    return NextResponse.json({ error: 'Los clientes no se eliminan: desactívalo (PATCH con is_active: false) o registra una solicitud de privacidad.' }, { status: 405 });
}

