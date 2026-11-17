import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const EmployeeSchema = z.object({
    name: z.string().trim().min(2).max(120),
    phone: z.string().trim().max(32).optional().nullable(),
    // false = recepción: vende productos y gana su comisión, pero no se le asignan servicios.
    is_barber: z.boolean().optional().default(true),
});

export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        // Administración puede pedir también a los inactivos (para reactivarlos); el resto solo ve activos.
        const includeInactive = request.nextUrl.searchParams.get('include_inactive') === '1' && MANAGEMENT_READ_ROLES.includes(context.role);
        let query = (await createSupabaseServerClient()).from('employees')
            .select('id, display_name, phone, is_active, is_barber, user_id, can_authorize_discounts')
            .eq('business_id', context.businessId).order('display_name');
        if (!includeInactive) query = query.eq('is_active', true);
        // Por omisión solo barberos (a quienes se asignan servicios y citas); scope=team incluye a recepción.
        if (request.nextUrl.searchParams.get('scope') !== 'team') query = query.eq('is_barber', true);
        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json((data ?? []).map((row) => ({ id: row.id, name: row.display_name, phone: row.phone, status: row.is_active ? 'active' : 'inactive', hasAccount: Boolean(row.user_id), canAuthorizeDiscounts: row.can_authorize_discounts, isBarber: row.is_barber })), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const parsed = EmployeeSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Los datos del empleado no son válidos.' }, { status: 400 });
        const { data, error } = await (await createSupabaseServerClient()).from('employees').insert({
            business_id: context.businessId, display_name: parsed.data.name, phone: parsed.data.phone || null, is_barber: parsed.data.is_barber,
        }).select('id, display_name, phone, is_active, is_barber').single();
        if (error) throw error;
        return NextResponse.json({ id: data.id, name: data.display_name, phone: data.phone, status: 'active', isBarber: data.is_barber }, { status: 201 });
    } catch (error) { return authErrorResponse(error); }
}

