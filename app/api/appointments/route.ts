import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { canSeeClientPhones } from '@/lib/auth/privacy';
import { FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { APPOINTMENT_COLUMNS, canCharge, toAppointmentView, type AppointmentRow } from '@/lib/appointments/appointments-view';
import { businessDayKey } from '@/lib/admin/profit';
import { businessDayRange, loadBusinessTimezone } from '@/lib/business/timezone';
import { bookingSlotError } from '@/lib/appointments/calendar-grid';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { addDays } from '@/lib/settlements/week';
import { withAppointmentExtras, type ExtrasClient, type NotificationRow } from '@/lib/appointments/extras';
import { waPhone } from '@/lib/notifications/wa-link';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const DEFAULT_TIMEZONE = 'America/Mexico_City';
// Incluye los servicios de la cita (appointment_items vigentes): el GET los devuelve en `services`.
const COLUMNS = APPOINTMENT_COLUMNS;

const RangeSchema = z.object({ from: z.string().datetime(), to: z.string().datetime() });
const AppointmentSchema = z.object({
    client_id: z.string().uuid().optional().nullable(),
    barber_id: z.string().uuid().optional().nullable(),
    customer_name: z.string().trim().min(2, 'Escribe el nombre de quien reserva.').max(120).optional().nullable(),
    customer_phone: z.string().trim().max(32).optional().nullable(),
    scheduled_at: z.string().datetime({ message: 'La fecha u hora no son válidas.' }),
    duration_minutes: z.number({ message: 'La duración no es válida.' }).int('La duración debe ser de 30 minutos o múltiplos de 30.')
        .min(30, 'La duración mínima es de 30 minutos.').max(480, 'La duración máxima es de 8 horas.').default(30),
    service_note: z.string().trim().max(500).optional().nullable(),
    /** C2: servicios de la cita (1 a 10). Con ellos la duración la calcula la base (suma de duraciones). */
    service_ids: z.array(z.string().uuid('Servicio no válido.')).min(1, 'Elige al menos un servicio.').max(10, 'Máximo 10 servicios.').optional(),
    /** C2: misma llave = misma cita (evita duplicar con doble clic). */
    idempotency_key: z.string().trim().min(12).max(128).optional(),
});

const OPEN_STATUSES = ['scheduled', 'confirmed', 'checked_in', 'in_progress'] as const;

/** Notificaciones que la RLS dejó ver, por cita (D3). */
function notificationRows(rows: AppointmentRow[]): Map<string, NotificationRow[]> {
    return new Map(rows.map((row) => [row.id, row.appointment_notifications ?? []]));
}

/**
 * Citas de la sucursal.
 * Con `?abiertas=1&barbero=<id>` (B3, solo lectura): citas de ese barbero de HOY (día del negocio) que siguen
 * abiertas y sin venta vigente; el cobro las ofrece para no duplicar la cita. Misma privacidad de teléfonos. El rango (from/to) lo calcula el dispositivo con su reloj local para que
 * "noviembre" sea noviembre en la barbería y no en UTC. Se conserva year/month por compatibilidad.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        const params = request.nextUrl.searchParams;
        const db = await createSupabaseServerClient();
        let query = db.from('appointments').select(COLUMNS)
            .eq('business_id', context.businessId).eq('branch_id', context.branchId).order('scheduled_start_at');
        const openOnly = params.get('abiertas') === '1';
        if (openOnly) {
            const barber = z.string().uuid().safeParse(params.get('barbero'));
            if (!barber.success) return NextResponse.json({ error: 'Indica el barbero.' }, { status: 400, headers: NO_STORE });
            const timezone = await loadBusinessTimezone(db as unknown as SupabaseClient, context.businessId);
            const today = businessDayKey(new Date().toISOString(), timezone);
            const day = businessDayRange(today, today, timezone);
            const { data, error } = await query.eq('assigned_employee_id', barber.data).in('status', [...OPEN_STATUSES])
                .gte('scheduled_start_at', day.from).lt('scheduled_start_at', day.to);
            if (error) throw error;
            const showPhones = canSeeClientPhones(context.role);
            const raw = (data ?? []) as unknown as AppointmentRow[];
            const rows = raw.map((row) => ({
                ...toAppointmentView(row), customer_phone: showPhones ? row.customer_phone : null, source: row.source,
            })).filter((view) => canCharge(view));
            return NextResponse.json(await withAppointmentExtras(db as unknown as ExtrasClient, context, rows, notificationRows(raw)), { headers: NO_STORE });
        }

        // D3: `?recordatorios=manana` — citas de MAÑANA (día del negocio) que siguen agendadas o confirmadas y sin
        // cobrar, con su estado de recordatorio. Solo mostrador y gerencia (mandan los mensajes).
        if (params.get('recordatorios') !== null) {
            if (params.get('recordatorios') !== 'manana') return NextResponse.json({ error: 'Usa recordatorios=manana.' }, { status: 400, headers: NO_STORE });
            if (!FRONT_DESK_ROLES.includes(context.role)) return NextResponse.json({ error: 'No tienes permiso para esta operación.' }, { status: 403, headers: NO_STORE });
            const timezone = await loadBusinessTimezone(db as unknown as SupabaseClient, context.businessId);
            const tomorrow = addDays(businessDayKey(new Date().toISOString(), timezone), 1);
            const day = businessDayRange(tomorrow, tomorrow, timezone);
            const { data, error } = await query.in('status', ['scheduled', 'confirmed'])
                .gte('scheduled_start_at', day.from).lt('scheduled_start_at', day.to);
            if (error) throw error;
            const raw = ((data ?? []) as unknown as AppointmentRow[]);
            const views = raw.map((row) => ({ ...toAppointmentView(row), source: row.source }))
                .filter((view) => !view.sale)
                .map((view) => ({ ...view, has_valid_phone: waPhone(view.customer_phone) !== null }));
            const withExtras = await withAppointmentExtras(db as unknown as ExtrasClient, context, views, notificationRows(raw));
            return NextResponse.json({
                day: tomorrow,
                timezone,
                appointments: withExtras.map((view) => ({ ...view, reminder_sent: view.notifications.reminder !== null })),
            }, { headers: NO_STORE });
        }

        const range = RangeSchema.safeParse({ from: params.get('from'), to: params.get('to') });
        const year = Number(params.get('year'));
        const month = params.get('month');
        if (range.success) {
            query = query.gte('scheduled_start_at', range.data.from).lt('scheduled_start_at', range.data.to);
        } else if (Number.isInteger(year) && month !== null && Number.isInteger(Number(month))) {
            query = query.gte('scheduled_start_at', new Date(Date.UTC(year, Number(month), 1)).toISOString())
                .lt('scheduled_start_at', new Date(Date.UTC(year, Number(month) + 1, 1)).toISOString());
        }
        const { data, error } = await query;
        if (error) throw error;
        // source (aditivo): 'appointment' | 'walk_in' | 'online' (reservada por el cliente en la página pública).
        // El barbero no recibe el teléfono del cliente (se quita aquí, en el servidor).
        const showPhones = canSeeClientPhones(context.role);
        const raw = (data ?? []) as unknown as AppointmentRow[];
        const views = raw.map((row) => ({
            ...toAppointmentView(row), customer_phone: showPhones ? row.customer_phone : null, source: row.source,
        }));
        // Cada cita trae `notifications` (último WhatsApp abierto por tipo) y `products` (productos propuestos).
        return NextResponse.json(await withAppointmentExtras(db as unknown as ExtrasClient, context, views, notificationRows(raw)), { headers: NO_STORE });
    } catch (error) { return authErrorResponse(error); }
}

/** Agenda una cita. Si el barbero ya tiene una cita activa que se empalma, la base la rechaza (409). */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext([...FRONT_DESK_ROLES]);
        const parsed = AppointmentSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Los datos de la cita no son válidos.' }, { status: 400, headers: NO_STORE });
        }
        const input = parsed.data;
        const db = await createSupabaseServerClient();
        // Las citas agendadas van en bloques de 30 minutos, en la hora de la barbería. Los registros "sin cita"
        // que crea el cobro (a la hora real, p. ej. 13:17) no pasan por aquí: los inserta la base directamente.
        const { data: business } = await db.from('businesses').select('timezone').eq('id', context.businessId).maybeSingle();
        const slotError = bookingSlotError(input.scheduled_at, input.service_ids ? 30 : input.duration_minutes, business?.timezone ?? DEFAULT_TIMEZONE);
        if (slotError) return NextResponse.json({ error: slotError }, { status: 400, headers: NO_STORE });
        if (input.service_ids) {
            // C2: la cita y sus servicios se guardan juntos en public.save_appointment (empalme, horario y ausencias en la base).
            const { data: saved, error: saveError } = await db.rpc('save_appointment', {
                p_branch_id: context.branchId,
                p_start: new Date(input.scheduled_at).toISOString(),
                p_barber_id: input.barber_id ?? undefined,
                p_service_ids: input.service_ids,
                p_client_id: input.client_id ?? undefined,
                p_customer_name: input.customer_name ?? undefined,
                p_customer_phone: input.customer_phone || undefined,
                p_notes: input.service_note || undefined,
                p_idempotency_key: input.idempotency_key,
            });
            if (saveError) throw saveError;
            const id = (saved as { appointment_id: string }).appointment_id;
            const { data, error } = await db.from('appointments').select(COLUMNS).eq('id', id).single();
            if (error) throw error;
            return NextResponse.json({ ...toAppointmentView(data as unknown as AppointmentRow), source: (data as unknown as AppointmentRow).source }, { status: 201, headers: NO_STORE });
        }
        let customerName = input.customer_name ?? undefined;
        let customerPhone = input.customer_phone || null;
        if (input.client_id) {
            const { data: client, error } = await db.from('clients').select('full_name, phone')
                .eq('business_id', context.businessId).eq('id', input.client_id).maybeSingle();
            if (error || !client) return NextResponse.json({ error: 'Cliente no encontrado en este negocio.' }, { status: 400, headers: NO_STORE });
            customerName = client.full_name;
            customerPhone = customerPhone ?? client.phone ?? null;
        }
        if (!customerName) {
            return NextResponse.json({ error: 'Elige un cliente o escribe el nombre de quien reserva.' }, { status: 400, headers: NO_STORE });
        }
        const start = new Date(input.scheduled_at);
        const end = new Date(start.getTime() + input.duration_minutes * 60_000);
        const { data, error } = await db.from('appointments').insert({
            business_id: context.businessId,
            branch_id: context.branchId,
            client_id: input.client_id ?? null,
            assigned_employee_id: input.barber_id ?? null,
            customer_name: customerName,
            customer_phone: customerPhone,
            scheduled_start_at: start.toISOString(),
            scheduled_end_at: end.toISOString(),
            notes: input.service_note || null,
            status: 'scheduled',
            source: 'appointment',
            created_by: context.userId,
        }).select(COLUMNS).single();
        if (error) throw error;
        return NextResponse.json({ ...toAppointmentView(data as unknown as AppointmentRow), source: (data as unknown as AppointmentRow).source }, { status: 201, headers: NO_STORE });
    } catch (error) { return authErrorResponse(error); }
}
