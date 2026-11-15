import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'La hora debe tener el formato HH:MM.');
const ScheduleSchema = z.object({
    days: z.array(z.object({
        weekday: z.number().int().min(0).max(6),
        off: z.boolean(),
        starts: hhmm.nullable().optional(),
        ends: hhmm.nullable().optional(),
    })).min(1).max(7),
});

/** Horario semanal de un barbero (días de descanso y horas). Dueño y gerencia; queda en la bitácora. */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireAuthContext(['owner', 'admin']);
        const id = z.string().uuid().safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Barbero no encontrado.', 404);
        const parsed = ScheduleSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'El horario no es válido.' }, { status: 400, headers: NO_STORE });
        const { data, error } = await (await createSupabaseServerClient()).rpc('set_employee_schedule', {
            p_employee_id: id.data, p_days: parsed.data.days,
        } as never);
        if (error) throw error;
        return Response.json(data, { headers: NO_STORE });
    } catch (error) { return authErrorResponse(error); }
}
