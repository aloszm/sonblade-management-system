import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FRONT_DESK_READ_ROLES, FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { toAppointmentView, type AppointmentRow } from '@/lib/appointments/appointments-view';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const IdSchema = z.string().uuid();
const StatusSchema = z.object({
    status: z.enum(['confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show']),
    reason: z.string().trim().max(300).optional().nullable(),
});

const COLUMNS = 'id, client_id, assigned_employee_id, customer_name, customer_phone, scheduled_start_at, scheduled_end_at, status, notes, created_at, source, clients(id, full_name), employees(id, display_name), sales(id, status, total_amount)';

/** Una cita, para precargar el cobro desde la agenda. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(FRONT_DESK_READ_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Cita no encontrada.', 404);
        const { data, error } = await (await createSupabaseServerClient()).from('appointments').select(COLUMNS)
            .eq('business_id', context.businessId).eq('branch_id', context.branchId).eq('id', id.data).maybeSingle();
        if (error) throw error;
        if (!data) throw new AuthorizationError('Cita no encontrada.', 404);
        return Response.json(toAppointmentView(data as unknown as AppointmentRow), { headers: NO_STORE });
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
