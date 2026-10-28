import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

const HaircutSchema = z.object({
    name: z.string().trim().min(2).max(80),
    price: z.number().finite().positive().max(100000),
    durationMinutes: z.number().int().min(5).max(480).default(30),
});

export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const input = HaircutSchema.safeParse(await request.json().catch(() => null));
        if (!input.success) return NextResponse.json({ error: 'Revisa el nombre, precio y duración del servicio.' }, { status: 400 });

        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('create_initial_haircut_service' as never, {
            p_business_id: context.businessId,
            p_branch_id: context.branchId,
            p_name: input.data.name,
            p_price: input.data.price,
            p_duration_minutes: input.data.durationMinutes,
        } as never);
        if (error) return NextResponse.json({ error: 'No se pudo guardar el servicio inicial.' }, { status: 409 });
        return NextResponse.json({ success: true, result: data }, { status: 201, headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}

