import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const AppointmentSchema = z.object({
    client_id: z.string().uuid().optional().nullable(),
    barber_id: z.string().uuid().optional().nullable(),
    customer_name: z.string().trim().min(2).max(120).optional(),
    customer_phone: z.string().trim().max(32).optional().nullable(),
    scheduled_at: z.string().datetime(),
    duration_minutes: z.number().int().min(5).max(480).default(30),
    service_note: z.string().max(500).optional().nullable(),
});

export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        const year = Number(request.nextUrl.searchParams.get('year'));
        const month = request.nextUrl.searchParams.get('month');
        let query = (await createSupabaseServerClient()).from('appointments')
            .select('id, business_id, branch_id, client_id, assigned_employee_id, customer_name, customer_phone, scheduled_start_at, scheduled_end_at, status, source, notes, created_at, clients(id, full_name), employees(id, display_name)')
            .eq('business_id', context.businessId).eq('branch_id', context.branchId).order('scheduled_start_at');
        if (Number.isInteger(year) && month !== null && Number.isInteger(Number(month))) {
            const from = new Date(year, Number(month), 1).toISOString();
            const to = new Date(year, Number(month) + 1, 1).toISOString();
            query = query.gte('scheduled_start_at', from).lt('scheduled_start_at', to);
        }
        const { data, error } = await query;
        if (error) throw error;
        return NextResponse.json((data ?? []).map((appointment) => ({
            ...appointment,
            scheduled_at: appointment.scheduled_start_at,
            client_name: appointment.clients?.full_name ?? appointment.customer_name,
            barber: appointment.employees ? { id: appointment.employees.id, name: appointment.employees.display_name } : null,
        })), { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}

export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin', 'cashier', 'receptionist']);
        const parsed = AppointmentSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return NextResponse.json({ error: 'Los datos de la cita no son válidos.' }, { status: 400 });
        const input = parsed.data;
        const db = await createSupabaseServerClient();
        let customerName = input.customer_name;
        if (input.client_id) {
            const { data: client, error } = await db.from('clients').select('full_name, phone')
                .eq('business_id', context.businessId).eq('id', input.client_id).maybeSingle();
            if (error || !client) return NextResponse.json({ error: 'Cliente no encontrado en este negocio.' }, { status: 400 });
            customerName = client.full_name;
        }
        if (!customerName) return NextResponse.json({ error: 'Indica un cliente o el nombre del visitante.' }, { status: 400 });
        const start = new Date(input.scheduled_at);
        const end = new Date(start.getTime() + input.duration_minutes * 60_000);
        const { data, error } = await db.from('appointments').insert({
            business_id: context.businessId,
            branch_id: context.branchId,
            client_id: input.client_id ?? null,
            assigned_employee_id: input.barber_id ?? null,
            customer_name: customerName,
            customer_phone: input.customer_phone ?? null,
            scheduled_start_at: start.toISOString(),
            scheduled_end_at: end.toISOString(),
            notes: input.service_note ?? null,
            status: 'scheduled',
            source: 'appointment',
            created_by: context.userId,
        }).select('id, business_id, branch_id, client_id, assigned_employee_id, customer_name, customer_phone, scheduled_start_at, scheduled_end_at, status, source, notes, created_at').single();
        if (error) throw error;
        return NextResponse.json({ ...data, scheduled_at: data.scheduled_start_at, client_name: data.customer_name }, { status: 201 });
    } catch (error) { return authErrorResponse(error); }
}

