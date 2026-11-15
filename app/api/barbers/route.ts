import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const EmployeeSchema = z.object({ name: z.string().trim().min(2).max(120), phone: z.string().trim().max(32).optional().nullable() });

export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        // Administración puede pedir también a los inactivos (para reactivarlos); el resto solo ve activos.
        const includeInactive = request.nextUrl.searchParams.get('include_inactive') === '1' && ['owner', 'admin'].includes(context.role);
        let query = (await createSupabaseServerClient()).from('employees')
            .select('id, display_name, phone, is_active, user_id, can_authorize_discounts')
            .eq('business_id', context.businessId).order('display_name');
        if (!includeInactive) query = query.eq('is_active', true);
        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json((data ?? []).map((row) => ({ id: row.id, name: row.display_name, phone: row.phone, status: row.is_active ? 'active' : 'inactive', hasAccount: Boolean(row.user_id), canAuthorizeDiscounts: row.can_authorize_discounts })), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const parsed = EmployeeSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Los datos del empleado no son válidos.' }, { status: 400 });
        const { data, error } = await (await createSupabaseServerClient()).from('employees').insert({
            business_id: context.businessId, display_name: parsed.data.name, phone: parsed.data.phone || null,
        }).select('id, display_name, phone, is_active').single();
        if (error) throw error;
        return NextResponse.json({ id: data.id, name: data.display_name, phone: data.phone, status: 'active' }, { status: 201 });
    } catch (error) { return authErrorResponse(error); }
}

