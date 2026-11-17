import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/lib/database.types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { getPublicConfig } from '@/lib/supabase/server';
import { MISSING_PIN_PEPPER, pinPassword } from '@/lib/auth/pin-hash';
import { isPinFormat } from '@/lib/auth/pin';
import { REASON_MAX, REASON_MIN } from '@/lib/cash/reasons';

/**
 * Confirmación con PIN de cambios sensibles (ajustes de caja, inventario, movimientos manuales
 * de gerencia). Lo pidió el dueño: "poniendo su PIN siempre, y que haga un comentario".
 *
 * Cómo funciona, en UNA sola petición (no se emiten tokens reutilizables):
 * 1) Se revisa el bloqueo por intentos de esa persona (el mismo del inicio de sesión, con el cliente
 *    de administración): con 5 fallos seguidos queda bloqueada como si se equivocara al entrar.
 * 2) Se abre una sesión APARTE (cliente sin cookies) con pinPassword(usuario, PIN). Su sesión actual
 *    en el celular no se toca.
 * 3) Si el PIN es correcto, la acción se ejecuta con esa sesión recién abierta. La base exige que la
 *    sesión tenga menos de 2 minutos y no se haya usado antes (private.consume_pin_proof): así ni
 *    llamando directo a la base se salta el PIN.
 * 4) Al terminar, esa sesión se cierra (signOut local), salga bien o mal.
 */
export const PinConfirmSchema = z.object({
    pin: z.string().max(16),
    comment: z.string().trim().min(REASON_MIN, `Escribe un comentario (de ${REASON_MIN} a ${REASON_MAX} letras).`).max(REASON_MAX, `El comentario es muy largo (máximo ${REASON_MAX} letras).`),
});
export type PinConfirmInput = z.infer<typeof PinConfirmSchema>;

export const WRONG_PIN = 'El PIN no es correcto.';
export const TOO_MANY = 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.';
export const UNAVAILABLE = 'No pudimos conectar con el servidor. Intenta de nuevo en un momento.';

type RpcResult = { data: unknown; error: unknown };
type AdminLike = { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<RpcResult> };
type VerifierLike = {
    auth: {
        signInWithPassword: (credentials: { email: string; password: string }) => Promise<{ data: { user: { id: string } | null }; error: unknown }>;
        signOut: (options: { scope: 'local' }) => Promise<unknown>;
    };
};

export type PinConfirmDeps<C> = {
    admin: AdminLike | null;
    newClient: () => C;
    password: (loginId: string, pin: string) => Promise<string>;
};

export type PinConfirmOutcome<T> = { ok: true; value: T } | { ok: false; status: number; error: string };

function defaultDeps(): PinConfirmDeps<SupabaseClient<Database>> {
    const { url, key } = getPublicConfig();
    return {
        admin: createSupabaseAdminClient() as unknown as AdminLike | null,
        newClient: () => createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } }),
        password: pinPassword,
    };
}

/**
 * Verifica el PIN de quien ya tiene sesión y, si es correcto, corre `action` con la sesión recién
 * abierta. Los errores de la acción (reglas de la base) se propagan tal cual para que la ruta los
 * traduzca con authErrorResponse.
 */
export async function runWithPin<T, C extends VerifierLike = SupabaseClient<Database>>(
    identity: { userId: string; email: string },
    pin: string,
    action: (client: C) => Promise<T>,
    deps?: PinConfirmDeps<C>,
): Promise<PinConfirmOutcome<T>> {
    if (!isPinFormat(pin)) return { ok: false, status: 400, error: 'Escribe tu PIN de 6 números.' };
    let resolved: PinConfirmDeps<C>;
    try {
        resolved = deps ?? (defaultDeps() as unknown as PinConfirmDeps<C>);
    } catch {
        return { ok: false, status: 503, error: MISSING_PIN_PEPPER };
    }
    const { admin } = resolved;
    if (!admin) return { ok: false, status: 503, error: MISSING_PIN_PEPPER };
    const loginId = identity.email.trim().toLowerCase();

    const check = await admin.rpc('login_attempt_check', { p_login_id: loginId });
    if (check.error) return { ok: false, status: 503, error: UNAVAILABLE };
    if (Number(check.data ?? 0) > 0) return { ok: false, status: 429, error: TOO_MANY };

    let password: string;
    try {
        password = await resolved.password(loginId, pin);
    } catch {
        return { ok: false, status: 503, error: MISSING_PIN_PEPPER };
    }

    const verifier = resolved.newClient();
    let signedIn = false;
    try {
        const { data, error } = await verifier.auth.signInWithPassword({ email: loginId, password });
        if (error || !data.user || data.user.id !== identity.userId) {
            const status = (error as { status?: number; name?: string } | null)?.status;
            if (error && (status === 429 || (error as { code?: string }).code === 'over_request_rate_limit')) return { ok: false, status: 429, error: TOO_MANY };
            if (error && ((error as { name?: string }).name === 'AuthRetryableFetchError' || status === undefined || status === 0 || status >= 500)) {
                return { ok: false, status: 503, error: UNAVAILABLE };
            }
            if (data.user) signedIn = true;
            const failed = await admin.rpc('login_attempt_failed', { p_login_id: loginId });
            if (Number(failed.data ?? 0) > 0) return { ok: false, status: 429, error: TOO_MANY };
            return { ok: false, status: 400, error: WRONG_PIN };
        }
        signedIn = true;
        await admin.rpc('login_attempt_succeeded', { p_login_id: loginId });
        return { ok: true, value: await action(verifier) };
    } finally {
        if (signedIn) await verifier.auth.signOut({ scope: 'local' }).catch(() => undefined);
    }
}

/** Respuesta HTTP para un PIN rechazado. */
export function pinErrorResponse(outcome: { status: number; error: string }) {
    return Response.json({ error: outcome.error, pin_error: true }, { status: outcome.status, headers: { 'Cache-Control': 'no-store' } });
}
