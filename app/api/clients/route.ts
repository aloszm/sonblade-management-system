import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { CLIENT_CREATE_ROLES } from '@/lib/barber/permissions';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
// Los campos opcionales que llegan vacíos ('') se guardan como nulos.
const optionalText = (max: number) => z.string().trim().max(max).nullish().transform((value) => value || null);
const ClientSchema = z.object({
    name: z.string().trim().min(2, 'El nombre es muy corto.').max(120),
    phone: optionalText(32),
    email: z.union([z.literal(''), z.string().trim().email('El correo no es válido.').max(254)]).nullish().transform((value) => value || null),
    notes: optionalText(1000),
    preferences: optionalText(1000),
}).strict();

export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        const query = request.nextUrl.searchParams.get('q')?.trim();
        let dbQuery = (await createSupabaseServerClient()).from('clients')
            .select('id, full_name, phone, email, notes, preferences, created_at, updated_at')
            .eq('business_id', context.businessId).order('full_name').limit(250);
        if (query) dbQuery = dbQuery.ilike('full_name', `%${query.replace(/[%_]/g, '\\$&')}%`);
        const { data, error } = await dbQuery;
        if (error) throw error;
        return NextResponse.json((data ?? []).map((client) => ({ ...client, name: client.full_name })), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}

// Crear: también el barbero (registra a quien llega). Editar y eliminar (`[id]`) no.
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(CLIENT_CREATE_ROLES);
        const body = ClientSchema.safeParse(await request.json().catch(() => null));
        if (!body.success) return NextResponse.json({ error: body.error.issues[0]?.message ?? 'Los datos del cliente no son válidos.' }, { status: 400 });
        const { data, error } = await (await createSupabaseServerClient()).from('clients').insert({
            business_id: context.businessId,
            full_name: body.data.name,
            phone: body.data.phone || null,
            email: body.data.email || null,
            notes: body.data.notes || null,
            preferences: body.data.preferences || null,
        }).select('id, full_name, phone, email, notes, preferences, created_at, updated_at').single();
        if (error) throw error;
        return NextResponse.json({ ...data, name: data.full_name }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}

