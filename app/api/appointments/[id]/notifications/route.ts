import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { APPOINTMENT_COLUMNS, toAppointmentView, type AppointmentRow } from '@/lib/appointments/appointments-view';
import { loadBusinessTimezone } from '@/lib/business/timezone';
import { NO_STORE } from '@/lib/money/api';
import { KIND_TO_DB, buildWaNotification, type WaMessageKind } from '@/lib/notifications/wa-link';
import { SITE_CONTENT } from '@/lib/site/content';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const IdSchema = z.string().uuid();
const BodySchema = z.object({
    kind: z.enum(['confirmacion', 'recordatorio'], { message: 'Elige confirmación o recordatorio.' }),
}).strict();

/**
 * D3 — WhatsApp de un clic. Arma EN EL SERVIDOR el enlace https://wa.me/52XXXXXXXXXX?text=... (así el teléfono del
 * cliente solo llega a quien ya puede verlo: dueño, gerencia y recepción) y registra que se abrió el enlace
 * (public.record_appointment_notification). Registrar NO significa que el mensaje se envió ni que llegó.
 * Sin teléfono válido de 10 dígitos responde 422 y no registra nada.
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(FRONT_DESK_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Cita no encontrada.', 404);
        const parsed = BodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        const kind: WaMessageKind = parsed.data.kind;

        const db = await createSupabaseServerClient();
        const { data, error } = await db.from('appointments').select(APPOINTMENT_COLUMNS)
            .eq('business_id', context.businessId).eq('branch_id', context.branchId).eq('id', id.data).maybeSingle();
        if (error) throw error;
        if (!data) throw new AuthorizationError('Cita no encontrada.', 404);
        const row = data as unknown as AppointmentRow;
        const view = toAppointmentView(row);

        let phone = row.customer_phone;
        if (!phone && row.client_id) {
            const { data: client } = await db.from('clients').select('phone').eq('business_id', context.businessId).eq('id', row.client_id).maybeSingle();
            phone = (client as { phone: string | null } | null)?.phone ?? null;
        }
        const timeZone = await loadBusinessTimezone(db as unknown as SupabaseClient, context.businessId);
        const built = buildWaNotification(kind, phone, {
            clientName: view.client_name,
            services: view.services.map((s) => s.name),
            startsAt: view.scheduled_at,
            barberName: view.barber?.name ?? null,
        }, { name: SITE_CONTENT.name, address: SITE_CONTENT.address, phone: SITE_CONTENT.phone }, timeZone);
        if (!built) {
            return Response.json({ error: 'La cita no tiene un teléfono válido de 10 dígitos. Corrígelo antes de mandar el mensaje.', code: 'no_phone' },
                { status: 422, headers: NO_STORE });
        }

        const { data: saved, error: saveError } = await db.rpc('record_appointment_notification', { p_appointment_id: id.data, p_kind: KIND_TO_DB[kind] });
        if (saveError) throw saveError;
        const notification = (saved ?? {}) as { id?: string; kind?: string; created_at?: string };
        return Response.json({
            url: built.url,
            message: built.message,
            notification: { id: notification.id ?? null, kind: notification.kind ?? KIND_TO_DB[kind], created_at: notification.created_at ?? null },
        }, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
