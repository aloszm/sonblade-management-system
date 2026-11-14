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

// Errores que lanzan las funciones de la base (RAISE EXCEPTION ... USING ERRCODE).
// Se traducen a un estado HTTP y a un mensaje en español; el mensaje técnico original
// viaja en `detail` para poder diagnosticar sin ocultar la causa real.
const DB_ERRORS: Record<string, { status: number; message: string }> = {
    '42501': { status: 403, message: 'No tienes permiso para esta operación.' },
    '22023': { status: 400, message: 'Los datos enviados no son válidos.' },
    '55000': { status: 409, message: 'La operación no se puede realizar en el estado actual.' },
    '23505': { status: 409, message: 'Ya existe un registro igual.' },
    '23514': { status: 409, message: 'La operación no cumple las reglas del negocio.' },
    '23503': { status: 400, message: 'Una referencia no existe o no pertenece a este negocio.' },
    // exclusion_violation: hoy solo la usa appointments_no_barber_overlap (agenda).
    '23P01': { status: 409, message: 'Ese barbero ya tiene una cita en ese horario.' },
    P0002: { status: 404, message: 'No se encontró el registro.' },
};

export function authErrorResponse(error: unknown) {
    const headers = { 'Cache-Control': 'no-store' };
    if (error instanceof AuthorizationError) {
        return Response.json({ error: error.message }, { status: error.status, headers });
    }
    const dbError = error as { code?: unknown; message?: unknown } | null;
    const known = dbError && typeof dbError.code === 'string' ? DB_ERRORS[dbError.code] : undefined;
    if (known) {
        const detail = typeof dbError?.message === 'string' ? dbError.message : undefined;
        return Response.json({ error: known.message, detail }, { status: known.status, headers });
    }
    console.error('[api] error no controlado:', error);
    return Response.json({ error: 'No se pudo completar la operación.' }, { status: 500, headers });
}

