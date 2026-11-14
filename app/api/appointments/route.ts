import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { toAppointmentView, type AppointmentRow } from '@/lib/appointments/appointments-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const COLUMNS = 'id, client_id, assigned_employee_id, customer_name, customer_phone, scheduled_start_at, scheduled_end_at, status, notes, created_at, clients(id, full_name), employees(id, display_name)';

const RangeSchema = z.object({ from: z.string().datetime(), to: z.string().datetime() });
const AppointmentSchema = z.object({
    client_id: z.string().uuid().optional().nullable(),
    barber_id: z.string().uuid().optional().nullable(),
    customer_name: z.string().trim().min(2, 'Escribe el nombre de quien reserva.').max(120).optional().nullable(),
    customer_phone: z.string().trim().max(32).optional().nullable(),
    scheduled_at: z.string().datetime({ message: 'La fecha u hora no son válidas.' }),
    duration_minutes: z.number().int().min(5).max(480).default(30),
    service_note: z.string().trim().max(500).optional().nullable(),
});

/**
 * Citas de la sucursal. El rango (from/to) lo calcula el dispositivo con su reloj local para que
 * "noviembre" sea noviembre en la barbería y no en UTC. Se conserva year/month por compatibilidad.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        const params = request.nextUrl.searchParams;
        let query = (await createSupabaseServerClient()).from('appointments').select(COLUMNS)
            .eq('business_id', context.businessId).eq('branch_id', context.branchId).order('scheduled_start_at');

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
        return NextResponse.json(((data ?? []) as unknown as AppointmentRow[]).map(toAppointmentView), { headers: NO_STORE });
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
        return NextResponse.json(toAppointmentView(data as unknown as AppointmentRow), { status: 201, headers: NO_STORE });
    } catch (error) { return authErrorResponse(error); }
}
