import { NextResponse } from 'next/server';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

export async function GET() {
    try {
        const context = await requireAuthContext();
        const db = await createSupabaseServerClient();
        const { data: memberships, error } = await db.from('business_memberships').select('user_id, role')
            .eq('business_id', context.businessId).eq('is_active', true).in('role', ['cashier', 'receptionist']);
        if (error) throw error;
        const ids = (memberships ?? []).map((item) => item.user_id);
        if (!ids.length) return NextResponse.json([]);
        const { data: profiles, error: profileError } = await db.from('profiles').select('user_id, full_name, phone').in('user_id', ids);
        if (profileError) throw profileError;
        const profileById = new Map((profiles ?? []).map((profile) => [profile.user_id, profile]));
        return NextResponse.json((memberships ?? []).map((membership) => ({
            id: membership.user_id,
            name: profileById.get(membership.user_id)?.full_name ?? 'Personal',
            phone: profileById.get(membership.user_id)?.phone,
            role: membership.role,
        })), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}

