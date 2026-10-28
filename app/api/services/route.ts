import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const ServiceSchema = z.object({ name: z.string().trim().min(2).max(120), price: z.number().finite().positive().max(100000), duration_minutes: z.number().int().min(5).max(480).default(30), description: z.string().max(500).optional().nullable(), is_active: z.boolean().default(true) });

export async function GET() {
    try {
        const context = await requireAuthContext();
        const { data, error } = await (await createSupabaseServerClient()).from('services')
            .select('id, name, price, duration_minutes, description, is_active, created_at, updated_at')
            .eq('business_id', context.businessId).order('name');
        if (error) throw error;
        return NextResponse.json((data ?? []).map((service) => ({ ...service, commission_rate: null })), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const parsed = ServiceSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Los datos del servicio no son válidos.' }, { status: 400 });
        const { data, error } = await (await createSupabaseServerClient()).from('services').insert({
            ...parsed.data,
            business_id: context.businessId,
            description: parsed.data.description || null,
        }).select().single();
        if (error) throw error;
        return NextResponse.json({ ...data, commission_rate: null }, { status: 201 });
    } catch (error) { return authErrorResponse(error); }
}

