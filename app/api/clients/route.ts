import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const ClientSchema = z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(32).optional().nullable(),
    email: z.string().trim().email().max(254).optional().nullable(),
    notes: z.string().max(1000).optional().nullable(),
    preferences: z.string().max(1000).optional().nullable(),
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

export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin', 'cashier', 'receptionist']);
        const body = ClientSchema.safeParse(await request.json().catch(() => null));
        if (!body.success) return NextResponse.json({ error: 'Los datos del cliente no son válidos.' }, { status: 400 });
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

