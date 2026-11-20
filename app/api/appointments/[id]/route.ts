import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { canSeeClientPhones } from '@/lib/auth/privacy';
import { FRONT_DESK_READ_ROLES, FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { APPOINTMENT_COLUMNS, toAppointmentView, type AppointmentRow } from '@/lib/appointments/appointments-view';
import { bookingSlotError } from '@/lib/appointments/calendar-grid';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { withAppointmentExtras, type ExtrasClient } from '@/lib/appointments/extras';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const IdSchema = z.string().uuid();
const StatusSchema = z.object({
    status: z.enum(['confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show']),
    reason: z.string().trim().max(300).optional().nullable(),
});

const COLUMNS = APPOINTMENT_COLUMNS;
const RescheduleSchema = z.object({
    scheduled_at: z.string().datetime({ message: 'La fecha u hora no son válidas.' }).optional(),
    barber_id: z.string().uuid().optional(),
    service_ids: z.array(z.string().uuid('Servicio no válido.')).min(1, 'Elige al menos un servicio.').max(10, 'Máximo 10 servicios.').optional(),
    duration_minutes: z.number().int().min(30).max(480).optional(),
    client_id: z.string().uuid().optional(),
    customer_name: z.string().trim().min(2, 'Escribe el nombre de quien reserva.').max(120).optional(),
    customer_phone: z.string().trim().max(32).optional(),
    notes: z.string().trim().max(500).optional(),
}).strict().refine((v) => Object.values(v).some((x) => x !== undefined), 'No hay cambios que guardar.');

/** Una cita, para precargar el cobro desde la agenda. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(FRONT_DESK_READ_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Cita no encontrada.', 404);
        const db = await createSupabaseServerClient();
        const { data, error } = await db.from('appointments').select(COLUMNS)
            .eq('business_id', context.businessId).eq('branch_id', context.branchId).eq('id', id.data).maybeSingle();
        if (error) throw error;
        if (!data) throw new AuthorizationError('Cita no encontrada.', 404);
        // Defensa extra: si algún día se abre esta ruta a más puestos, el barbero seguiría sin recibir el teléfono.
        const row = data as unknown as AppointmentRow;
        const view = toAppointmentView(row);
        // `products` (lo que el cobro precarga, con su vendedor) y `notifications` (último WhatsApp abierto por tipo).
        const [full] = await withAppointmentExtras(db as unknown as ExtrasClient, context,
            [canSeeClientPhones(context.role) ? view : { ...view, customer_phone: null }],
            new Map([[row.id, row.appointment_notifications ?? []]]));
        return Response.json(full, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/**
 * Cambia el estado de una cita (confirmar, llegó, completar, no llegó, cancelar).
 * Las reglas viven en public.change_appointment_status: transiciones válidas y motivo obligatorio
 * al cancelar. Las citas no se borran; el cambio queda en la bitácora con quién lo hizo.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireAuthContext([...FRONT_DESK_ROLES]);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Cita no encontrada.', 404);
        const parsed = StatusSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: 'El estado solicitado no es válido.' }, { status: 400, headers: NO_STORE });
        if (parsed.data.status === 'cancelled' && (parsed.data.reason ?? '').length < 3) {
            return Response.json({ error: 'Indica el motivo de la cancelación.' }, { status: 400, headers: NO_STORE });
        }
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('change_appointment_status', {
            p_appointment_id: id.data, p_status: parsed.data.status, p_reason: parsed.data.reason ?? undefined,
        });
        if (error) throw error;
        return Response.json({ id: data.id, status: data.status, notes: data.notes }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/**
 * C2: reprograma una cita abierta (fecha/hora, barbero, servicios, duración, cliente o nota) sin cambiar su id.
 * La base (public.save_appointment) valida empalmes, horario, ausencias, que siga abierta y sin cobrar, y deja en
 * la bitácora el horario anterior ('appointment_rescheduled'). Sin cambios reales no escribe nada.
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext([...FRONT_DESK_ROLES]);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Cita no encontrada.', 404);
        const parsed = RescheduleSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Los datos de la cita no son válidos.' }, { status: 400, headers: NO_STORE });
        }
        const v = parsed.data;
        const supabase = await createSupabaseServerClient();
        // La hora nueva va en bloques de 30 min en la hora de la barbería (la base también lo exige).
        if (v.scheduled_at) {
            const { data: business } = await supabase.from('businesses').select('timezone').eq('id', context.businessId).maybeSingle();
            const slotError = bookingSlotError(v.scheduled_at, v.service_ids ? 30 : v.duration_minutes ?? 30, business?.timezone ?? undefined);
            if (slotError) return Response.json({ error: slotError }, { status: 400, headers: NO_STORE });
        }
        const { error: saveError } = await supabase.rpc('save_appointment', {
            p_branch_id: context.branchId,
            p_appointment_id: id.data,
            p_start: v.scheduled_at ? new Date(v.scheduled_at).toISOString() : undefined,
            p_barber_id: v.barber_id,
            p_service_ids: v.service_ids,
            p_duration_minutes: v.service_ids ? undefined : v.duration_minutes,
            p_client_id: v.client_id,
            p_customer_name: v.customer_name,
            p_customer_phone: v.customer_phone,
            p_notes: v.notes,
        });
        if (saveError) throw saveError;
        const { data, error } = await supabase.from('appointments').select(COLUMNS)
            .eq('business_id', context.businessId).eq('branch_id', context.branchId).eq('id', id.data).maybeSingle();
        if (error) throw error;
        if (!data) throw new AuthorizationError('Cita no encontrada.', 404);
        return Response.json(toAppointmentView(data as unknown as AppointmentRow), { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
