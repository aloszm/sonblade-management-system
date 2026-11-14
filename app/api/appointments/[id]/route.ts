import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const IdSchema = z.string().uuid();
const StatusSchema = z.object({
    status: z.enum(['confirmed', 'checked_in', 'in_progress', 'completed', 'cancelled', 'no_show']),
    reason: z.string().trim().max(300).optional().nullable(),
});

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
