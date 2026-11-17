import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { checkNewPin, isPinFormat, PIN_PROBLEM_MESSAGES } from '@/lib/auth/pin';
import { createSupabaseServerClient, getPublicConfig } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { MISSING_PIN_PEPPER, pinPassword, pinPepperConfigured } from '@/lib/auth/pin-hash';
import type { Database } from '@/lib/database.types';

export const dynamic = 'force-dynamic';
const NO_CACHE = { 'Cache-Control': 'no-store' };
const Schema = z.object({ current: z.string().max(16), next: z.string().max(16), confirm: z.string().max(16) });

/**
 * Cambiar MI PIN (cualquier puesto, incluida la consulta: es su propia credencial).
 * 1) Se verifica el PIN actual iniciando una sesión aparte (reautenticación), con el mismo
 *    bloqueo por intentos que el inicio de sesión: quien tome un celular desbloqueado no
 *    puede ponerse a adivinar el PIN desde aquí.
 * 2) El PIN nuevo se guarda con `auth.updateUser({ password })` en esa sesión recién abierta
 *    (así se cumple la regla de Supabase de que el cambio venga de un inicio reciente).
 * 3) La base quita la marca "debe cambiar su PIN", deja constancia en la bitácora (sin el PIN) y
 *    cierra las demás sesiones abiertas (otros celulares con el PIN viejo).
 * El bloqueo se consulta con el cliente de administración y las contraseñas son pinPassword():
 * sin llave secreta o sin PIN_PEPPER responde 503.
 */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        const parsed = Schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: PIN_PROBLEM_MESSAGES.format }, { status: 400, headers: NO_CACHE });
        const { current, next, confirm } = parsed.data;
        if (!isPinFormat(current)) return NextResponse.json({ error: 'Escribe tu PIN actual (6 números).' }, { status: 400, headers: NO_CACHE });
        const problem = checkNewPin(current, next, confirm);
        if (problem) return NextResponse.json({ error: PIN_PROBLEM_MESSAGES[problem] }, { status: 400, headers: NO_CACHE });

        const admin = createSupabaseAdminClient();
        if (!admin || !pinPepperConfigured()) return NextResponse.json({ error: MISSING_PIN_PEPPER }, { status: 503, headers: NO_CACHE });
        const supabase = await createSupabaseServerClient();
        const loginId = context.email.toLowerCase();
        const { data: lockedFor } = await admin.rpc('login_attempt_check', { p_login_id: loginId });
        if ((lockedFor ?? 0) > 0) return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }, { status: 429, headers: NO_CACHE });

        const { url, key } = getPublicConfig();
        const verifier = createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
        const { data: signIn, error: signInError } = await verifier.auth.signInWithPassword({ email: context.email, password: pinPassword(loginId, current) });
        if (signInError || signIn.user?.id !== context.userId) {
            const status = (signInError as { status?: number } | null)?.status;
            if (status === 429) return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }, { status: 429, headers: NO_CACHE });
            if (status === undefined || status === 0 || (status ?? 0) >= 500) return NextResponse.json({ error: 'No pudimos conectar con el servidor. Intenta de nuevo en un momento.' }, { status: 503, headers: NO_CACHE });
            const { data: nowLocked } = await admin.rpc('login_attempt_failed', { p_login_id: loginId });
            if ((nowLocked ?? 0) > 0) return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }, { status: 429, headers: NO_CACHE });
            return NextResponse.json({ error: 'Tu PIN actual no es correcto.' }, { status: 400, headers: NO_CACHE });
        }

        const { error: updateError } = await verifier.auth.updateUser({ password: pinPassword(loginId, next) });
        // La sesión de verificación ya no se necesita.
        await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined);
        if (updateError) {
            const code = (updateError as { code?: string }).code;
            if (code === 'same_password') return NextResponse.json({ error: PIN_PROBLEM_MESSAGES.same }, { status: 400, headers: NO_CACHE });
            if (code === 'weak_password') return NextResponse.json({ error: 'Supabase rechazó ese PIN por débil. Elige otro.' }, { status: 400, headers: NO_CACHE });
            return NextResponse.json({ error: 'No se pudo guardar el PIN nuevo. Intenta de nuevo.' }, { status: 502, headers: NO_CACHE });
        }
        const { error: flagError } = await supabase.rpc('pin_changed');
        if (flagError) throw flagError;
        return NextResponse.json({ success: true }, { headers: NO_CACHE });
    } catch (error) { return authErrorResponse(error); }
}
