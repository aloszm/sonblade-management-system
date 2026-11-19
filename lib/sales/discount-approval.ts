import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { MISSING_PIN_PEPPER } from '@/lib/auth/pin-hash';
import { runWithPin, WRONG_PIN, type PinConfirmOutcome } from '@/lib/auth/pin-confirm';

/**
 * Descuento autorizado con el PIN de quien autoriza (B2).
 *
 * El cajero no puede "poner" a otra persona como autorizadora: quien autoriza escribe su PIN en la
 * caja; el servidor abre con ese PIN una sesión aparte (runWithPin) y, como esa persona, pide a la base
 * una autorización de un solo uso (public.issue_discount_approval: monto máximo, motivo, 5 minutos).
 * Después la venta se registra con la sesión de quien cobra y consume esa autorización en la misma
 * transacción. Así la venta queda a nombre del cajero y el descuento a nombre de quien autorizó.
 *
 * Decisión (documentada en FASE_4.md): si quien cobra ya puede autorizar descuentos (dueño, gerencia o
 * empleado con permiso), también escribe su propio PIN; así todo descuento queda firmado.
 */

export const DISCOUNT_PIN_REQUIRED = 'Para aplicar el descuento, quien lo autoriza debe confirmar con su PIN.';
export const AUTHORIZER_NOT_FOUND = 'No encontramos a la persona que autoriza el descuento.';

/** Suma de los descuentos de los renglones, en pesos con dos decimales (sin errores de punto flotante). */
export function discountTotalOf(items: ReadonlyArray<{ discount_amount?: number | null }>): number {
    return items.reduce((sum, item) => sum + Math.round(Math.max(item.discount_amount ?? 0, 0) * 100), 0) / 100;
}

type Identity = { userId: string; email: string };

export type IssueDiscountApprovalInput = {
    /** Quién cobra (sesión actual). */
    cashier: Identity;
    /** Quién autoriza; si es el mismo que cobra, se usa su identidad sin consultar nada más. */
    authorizerUserId: string;
    pin: string;
    branchId: string;
    maxAmount: number;
    reason: string;
};

export type IssueDiscountApprovalDeps = {
    lookupEmail: (userId: string) => Promise<string | null | undefined>;
    runWithPin: <T>(identity: Identity, pin: string, action: (client: SupabaseClient<Database>) => Promise<T>) => Promise<PinConfirmOutcome<T>>;
};

function defaultDeps(): IssueDiscountApprovalDeps {
    return {
        lookupEmail: async (userId) => {
            const admin = createSupabaseAdminClient();
            if (!admin) throw new Error(MISSING_PIN_PEPPER);
            const { data, error } = await admin.auth.admin.getUserById(userId);
            if (error) return null;
            return data.user?.email ?? null;
        },
        runWithPin: (identity, pin, action) => runWithPin(identity, pin, action),
    };
}

/**
 * Verifica el PIN de quien autoriza y obtiene el id de la autorización de un solo uso.
 * Los rechazos de la base (sin permiso, monto inválido) se lanzan para que la ruta los traduzca.
 */
export async function issueDiscountApproval(
    input: IssueDiscountApprovalInput,
    deps: IssueDiscountApprovalDeps = defaultDeps(),
): Promise<PinConfirmOutcome<string>> {
    let identity: Identity;
    if (input.authorizerUserId === input.cashier.userId) {
        identity = input.cashier;
    } else {
        let email: string | null | undefined;
        try {
            email = await deps.lookupEmail(input.authorizerUserId);
        } catch {
            return { ok: false, status: 503, error: MISSING_PIN_PEPPER };
        }
        if (!email) return { ok: false, status: 400, error: AUTHORIZER_NOT_FOUND };
        identity = { userId: input.authorizerUserId, email };
    }
    const outcome = await deps.runWithPin(identity, input.pin, async (client) => {
        const { data, error } = await client.rpc('issue_discount_approval', {
            p_branch_id: input.branchId,
            p_requested_by: input.cashier.userId,
            p_max_amount: input.maxAmount,
            p_reason: input.reason,
        });
        if (error) throw error;
        const id = (data as { approval_id?: unknown } | null)?.approval_id;
        if (typeof id !== 'string') throw new Error('La base no devolvió la autorización del descuento.');
        return id;
    });
    // Si autoriza otra persona, el mensaje no debe decir "tu PIN".
    if (!outcome.ok && identity.userId !== input.cashier.userId && outcome.error === WRONG_PIN) {
        return { ...outcome, error: 'El PIN de quien autoriza no es correcto.' };
    }
    return outcome;
}
