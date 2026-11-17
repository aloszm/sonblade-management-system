import { NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, AuthorizationError, requireAuthContext } from '@/lib/auth/context';
import { canManageAccount } from '@/lib/auth/account-rules';
import { generateTemporaryPin } from '@/lib/auth/pin';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient, MISSING_ADMIN_KEY } from '@/lib/supabase/admin';
import { MISSING_PIN_PEPPER, pinPassword, pinPepperConfigured } from '@/lib/auth/pin-hash';

export const dynamic = 'force-dynamic';
const NO_CACHE = { 'Cache-Control': 'no-store' };

/**
 * Restablecer el PIN de otra persona: se genera uno temporal aleatorio, se guarda con la API de
 * administración de Supabase Auth y se devuelve UNA vez para dictárselo. La base marca que debe
 * cambiarlo al entrar, limpia su bloqueo, cierra sus sesiones abiertas y deja constancia en la
 * bitácora (nunca el PIN).
 */
export async function POST(_request: Request, { params }: { params: Promise<{ userId: string }> }) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const { userId } = await params;
        if (!z.string().uuid().safeParse(userId).success) return NextResponse.json({ error: 'Cuenta no válida.' }, { status: 400, headers: NO_CACHE });
        if (userId === context.userId) throw new AuthorizationError('Tu propio PIN se cambia en "Mi cuenta".');
        const supabase = await createSupabaseServerClient();
        const { data: target, error } = await supabase.from('business_memberships').select('role, login_name')
            .eq('business_id', context.businessId).eq('user_id', userId).maybeSingle();
        if (error) throw error;
        if (!target) return NextResponse.json({ error: 'La cuenta no existe en este negocio.' }, { status: 404, headers: NO_CACHE });
        if (!canManageAccount(context.role, target.role)) throw new AuthorizationError('Tu puesto no puede restablecer el PIN de esta persona.');

        const admin = createSupabaseAdminClient();
        if (!admin) return NextResponse.json({ error: MISSING_ADMIN_KEY }, { status: 503, headers: NO_CACHE });
        if (!pinPepperConfigured()) return NextResponse.json({ error: MISSING_PIN_PEPPER }, { status: 503, headers: NO_CACHE });
        // La base confirma el permiso ANTES de tocar la contraseña (no basta la revisión de la app).
        const { error: permissionError } = await admin.rpc('assert_can_manage_account', { p_actor_user_id: context.userId, p_business_id: context.businessId, p_user_id: userId });
        if (permissionError) throw permissionError;
        const { data: authUser, error: userError } = await admin.auth.admin.getUserById(userId);
        if (userError || !authUser.user?.email) return NextResponse.json({ error: 'No se pudo restablecer el PIN. Intenta de nuevo.' }, { status: 502, headers: NO_CACHE });
        const pin = generateTemporaryPin();
        const { error: updateError } = await admin.auth.admin.updateUserById(userId, { password: pinPassword(authUser.user.email, pin) });
        if (updateError) return NextResponse.json({ error: 'No se pudo restablecer el PIN. Intenta de nuevo.' }, { status: 502, headers: NO_CACHE });
        const { error: markError } = await admin.rpc('mark_pin_reset', { p_actor_user_id: context.userId, p_business_id: context.businessId, p_user_id: userId });
        if (markError) throw markError;
        return NextResponse.json({ loginName: target.login_name, temporaryPin: pin }, { headers: NO_CACHE });
    } catch (error) { return authErrorResponse(error); }
}
