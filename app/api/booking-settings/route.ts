import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_ROLES, OWNER_ONLY_ROLES } from '@/lib/auth/roles';
import { pinErrorResponse, runWithPin } from '@/lib/auth/pin-confirm';
import { NO_STORE, PinSchema, badRequest, needsPin } from '@/lib/money/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { toBookingSettings } from '@/lib/booking/settings-view';

export const dynamic = 'force-dynamic';

/**
 * D1 — Interruptor de reservas en línea. La regla vive en la base:
 *  - public.get_booking_settings: dueño y gerencia leen las reglas vigentes (private.booking_rules).
 *  - public.set_booking_settings: solo la cuenta principal (owner), con su PIN (consume_pin_proof).
 * Aquí solo se valida la forma para contestar pronto y en español.
 */
const int = (min: number, max: number, message: string) =>
    z.number({ message }).int(message).min(min, message).max(max, message);

const UpdateSchema = z.object({
    enabled: z.boolean({ message: 'Indica si las reservas en línea quedan encendidas o apagadas.' }),
    lead_minutes: int(0, 1440, 'La anticipación mínima debe ser de 0 a 1440 minutos.').optional(),
    max_days_ahead: int(1, 90, 'Se puede reservar de 1 a 90 días hacia adelante.').optional(),
    cancel_hours: int(0, 72, 'El límite para cancelar debe ser de 0 a 72 horas.').optional(),
    max_online_per_day: int(1, 200, 'El tope de reservas en línea por día debe ser de 1 a 200.').optional(),
    comment: z.string().trim().max(300, 'El comentario es muy largo (máximo 300 letras).').optional(),
    pin: PinSchema,
}).strict();

type Rules = Record<string, unknown>;

/** Reglas vigentes de las reservas en línea (dueño y gerencia). `can_edit` solo para la cuenta principal. */
export async function GET() {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('get_booking_settings', { p_business_id: context.businessId });
        if (error) throw error;
        const raw = (data ?? {}) as Rules;
        return Response.json({ settings: toBookingSettings(raw), can_edit: Boolean(raw.can_edit) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Enciende o apaga las reservas en línea (y ajusta sus reglas). Solo la cuenta principal, con PIN. */
export async function PUT(request: NextRequest) {
    try {
        const context = await requireAuthContext(OWNER_ONLY_ROLES);
        const parsed = UpdateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const input = parsed.data;
        if (!input.pin) return needsPin('Confirma el cambio de las reservas en línea con tu PIN.');
        const outcome = await runWithPin(context, input.pin, async (client) => {
            const { data, error } = await client.rpc('set_booking_settings', {
                p_business_id: context.businessId,
                p_enabled: input.enabled,
                p_lead_minutes: input.lead_minutes,
                p_max_days_ahead: input.max_days_ahead,
                p_cancel_hours: input.cancel_hours,
                p_max_online_per_day: input.max_online_per_day,
                p_comment: input.comment || undefined,
            });
            if (error) throw error;
            return (data ?? {}) as Rules;
        });
        if (!outcome.ok) return pinErrorResponse(outcome);
        return Response.json({ settings: toBookingSettings(outcome.value), changed: Boolean(outcome.value.changed) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
