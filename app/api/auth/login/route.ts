import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { MISSING_PIN_PEPPER, pinPassword, pinPepperConfigured } from '@/lib/auth/pin-hash';
import { loginBusinessSlug, loginIdFor, normalizeLoginName } from '@/lib/auth/login-id';
import { isPinFormat } from '@/lib/auth/pin';

export const dynamic = 'force-dynamic';
const CredentialsSchema = z.object({ username: z.string().max(64), pin: z.string().max(16) });
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' };

const WRONG = 'Usuario o PIN incorrectos.';
const TOO_MANY = 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
/**
 * Tiempo mínimo de respuesta. Supabase tarda más en contestar cuando el usuario existe
 * (compara la contraseña cifrada) que cuando no existe; con este piso, más un poco de azar,
 * ambos casos tardan lo mismo para quien mide desde fuera.
 */
const MIN_RESPONSE_MS = 900;

async function settle(startedAt: number) {
    const wait = MIN_RESPONSE_MS + Math.floor(Math.random() * 150) - (Date.now() - startedAt);
    if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait));
}

/**
 * Inicio de sesión con usuario + PIN.
 *
 * Bloqueo por usuario (por qué hace falta: un PIN de 6 dígitos son 1,000,000 de combinaciones
 * y el límite de Supabase es por IP, no por cuenta): antes de intentar se pregunta a la base si
 * ese usuario está bloqueado y cada fallo se registra; al 5.º fallo seguido se bloquea 15 min,
 * más si reincide. El contador se aplica igual a usuarios que no existen, así el mensaje y el
 * bloqueo nunca revelan quién tiene cuenta.
 *
 * El bloqueo solo lo puede consultar y escribir el servidor (cliente de administración, llave
 * secreta): la base ya no deja a nadie sin sesión tocarlo. Sin la llave secreta o sin PIN_PEPPER
 * el inicio de sesión responde 503 (falla cerrado): nunca se entra sin bloqueo.
 * La contraseña que se manda a Supabase Auth es pinPassword(loginId, pin), no el PIN.
 */
export async function POST(request: NextRequest) {
    const startedAt = Date.now();
    const parsed = CredentialsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || !parsed.data.username.trim() || !isPinFormat(parsed.data.pin)) {
        return NextResponse.json({ error: 'Escribe tu usuario y tu PIN de 6 números.' }, { status: 400, headers: NO_CACHE });
    }
    const unavailable = () => NextResponse.json({ error: 'No pudimos conectar con el servidor. Intenta de nuevo en un momento.' }, { status: 503, headers: NO_CACHE });
    const admin = createSupabaseAdminClient();
    if (!admin || !pinPepperConfigured()) {
        console.error('[login] falta SUPABASE_SECRET_KEY o PIN_PEPPER en el servidor');
        return NextResponse.json({ error: MISSING_PIN_PEPPER }, { status: 503, headers: NO_CACHE });
    }
    const name = normalizeLoginName(parsed.data.username);
    // Un usuario mal escrito (con espacios o símbolos) no puede existir: se cuenta como fallo
    // con una clave propia para que tarde y se bloquee igual que cualquier otro.
    const loginId = name ? loginIdFor(name, loginBusinessSlug()) : `invalido:${parsed.data.username.trim().toLowerCase().slice(0, 64)}`;
    try {
        const supabase = await createSupabaseServerClient();
        const { data: lockedFor, error: checkError } = await admin.rpc('login_attempt_check', { p_login_id: loginId });
        if (checkError) { await settle(startedAt); return unavailable(); }
        if ((lockedFor ?? 0) > 0) {
            await settle(startedAt);
            return NextResponse.json({ error: TOO_MANY }, { status: 429, headers: NO_CACHE });
        }
        const failed = async () => {
            const { data: nowLocked } = await admin.rpc('login_attempt_failed', { p_login_id: loginId });
            await settle(startedAt);
            if ((nowLocked ?? 0) > 0) return NextResponse.json({ error: TOO_MANY }, { status: 429, headers: NO_CACHE });
            return NextResponse.json({ error: WRONG }, { status: 401, headers: NO_CACHE });
        };
        if (!name) return failed();

        const { data, error } = await supabase.auth.signInWithPassword({ email: loginId, password: pinPassword(loginId, parsed.data.pin) });
        if (error) {
            const status = (error as { status?: number }).status;
            if (status === 429 || (error as { code?: string }).code === 'over_request_rate_limit') {
                await settle(startedAt);
                return NextResponse.json({ error: TOO_MANY }, { status: 429, headers: NO_CACHE });
            }
            // Falla de red hacia el servicio de acceso (status 0 o sin número) o error del servicio (5xx): no es culpa del PIN.
            if (error.name === 'AuthRetryableFetchError' || status === undefined || status === 0 || status >= 500) { await settle(startedAt); return unavailable(); }
            return failed();
        }
        if (!data.user) return failed();
        await admin.rpc('login_attempt_succeeded', { p_login_id: loginId });
        const { data: status } = await supabase.rpc('my_account_status');
        const mustChangePin = Boolean((status as { must_change_pin?: boolean } | null)?.must_change_pin);
        await settle(startedAt);
        return NextResponse.json({ success: true, mustChangePin }, { headers: NO_CACHE });
    } catch {
        await settle(startedAt);
        return unavailable();
    }
}

export async function DELETE() {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return NextResponse.json({ success: true }, { headers: NO_CACHE });
}
