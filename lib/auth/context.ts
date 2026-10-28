import 'server-only';

import { cookies } from 'next/headers';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import type { Database } from '@/lib/database.types';

export type BusinessRole = Database['public']['Enums']['business_role'];
export type AuthContext = {
    userId: string;
    email: string;
    displayName: string;
    employeeId: string | null;
    businessId: string;
    branchId: string;
    role: BusinessRole;
};

export class AuthorizationError extends Error {
    constructor(message = 'No tienes permiso para esta operación.', public status = 403) {
        super(message);
        this.name = 'AuthorizationError';
    }
}

export async function getAuthContext(): Promise<AuthContext | null> {
    const supabase = await createSupabaseServerClient();
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error || !user || !user.email) return null;

    const { data: memberships, error: membershipError } = await supabase
        .from('business_memberships')
        .select('business_id, role')
        .eq('user_id', user.id)
        .eq('is_active', true)
        .order('created_at', { ascending: true })
        .limit(1);
    const membership = memberships?.[0];
    if (membershipError || !membership) return null;

    const cookieStore = await cookies();
    const requestedBranch = cookieStore.get('sonblade-branch')?.value;
    const branchQuery = supabase.from('branches').select('id')
        .eq('business_id', membership.business_id).eq('is_active', true);
    const { data: branches, error: branchError } = requestedBranch
        ? await branchQuery.eq('id', requestedBranch).limit(1)
        : await branchQuery.order('created_at', { ascending: true }).limit(1);
    const branch = branches?.[0];
    if (branchError || !branch) return null;

    const [{ data: profile }, { data: employee }] = await Promise.all([
        supabase.from('profiles').select('full_name').eq('user_id', user.id).maybeSingle(),
        supabase.from('employees').select('id, display_name').eq('user_id', user.id).eq('business_id', membership.business_id).maybeSingle(),
    ]);
    return {
        userId: user.id,
        email: user.email,
        displayName: employee?.display_name ?? profile?.full_name ?? user.email,
        employeeId: employee?.id ?? null,
        businessId: membership.business_id,
        branchId: branch.id,
        role: membership.role,
    };
}

export async function requireAuthContext(roles?: BusinessRole[]) {
    const context = await getAuthContext();
    if (!context) throw new AuthorizationError('Debes iniciar sesión y pertenecer a un negocio activo.', 401);
    if (roles && !roles.includes(context.role)) throw new AuthorizationError();
    return context;
}

export function authErrorResponse(error: unknown) {
    if (error instanceof AuthorizationError) {
        return Response.json({ error: error.message }, { status: error.status, headers: { 'Cache-Control': 'no-store' } });
    }
    return Response.json({ error: 'No se pudo completar la operación.' }, { status: 500, headers: { 'Cache-Control': 'no-store' } });
}

