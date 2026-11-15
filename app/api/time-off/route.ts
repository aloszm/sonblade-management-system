import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { REQUESTED_VIA, toTimeOffView, type TimeOffRow } from '@/lib/appointments/time-off';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const COLUMNS = 'id, employee_id, starts_at, ends_at, reason, requested_at, requested_via, created_by, created_at, cancelled_at, cancelled_by, cancel_reason';
const RangeSchema = z.object({ from: z.string().datetime(), to: z.string().datetime() });
const CreateSchema = z.object({
    barber_id: z.string().uuid('Elige al barbero.'),
    starts_at: z.string().datetime({ message: 'La hora de inicio no es válida.' }),
    ends_at: z.string().datetime({ message: 'La hora de fin no es válida.' }),
    reason: z.string().trim().min(3, 'Escribe el motivo de la ausencia.').max(300),
    requested_at: z.string().datetime({ message: 'Indica cuándo avisó.' }),
    requested_via: z.enum(REQUESTED_VIA, { message: 'Indica cómo avisó.' }),
});

/**
 * Ausencias de la sucursal que tocan el rango (incluye las canceladas, que se muestran tachadas
 * para que quede el historial). Todo el equipo las ve; solo mostrador y dirección las registran.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext();
        const range = RangeSchema.safeParse({ from: request.nextUrl.searchParams.get('from'), to: request.nextUrl.searchParams.get('to') });
        if (!range.success) return Response.json({ error: 'Indica el rango de fechas.' }, { status: 400, headers: NO_STORE });
        const db = await createSupabaseServerClient();
        const { data, error } = await db.from('employee_time_off').select(COLUMNS)
            .eq('business_id', context.businessId).eq('branch_id', context.branchId)
            .lt('starts_at', range.data.to).gt('ends_at', range.data.from)
            .order('starts_at');
        if (error) throw error;
        const rows = (data ?? []) as unknown as TimeOffRow[];
        // Nombres: el barbero por employee_id y quien registró/canceló por su usuario.
        const { data: employees, error: employeesError } = await db.from('employees')
            .select('id, user_id, display_name').eq('business_id', context.businessId);
        if (employeesError) throw employeesError;
        const list = (employees ?? []) as { id: string; user_id: string | null; display_name: string }[];
        const employeeNames = new Map(list.map((e) => [e.id, e.display_name]));
        const userNames = new Map(list.filter((e) => e.user_id).map((e) => [e.user_id as string, e.display_name]));
        return Response.json(rows.map((row) => toTimeOffView(row, employeeNames, userNames)), { headers: NO_STORE });
    } catch (error) { return authErrorResponse(error); }
}

/** Registra una ausencia. Devuelve las citas que quedaron dentro para reagendarlas. */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext([...FRONT_DESK_ROLES]);
        const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) {
            return Response.json({ error: parsed.error.issues[0]?.message ?? 'Los datos de la ausencia no son válidos.' }, { status: 400, headers: NO_STORE });
        }
        const input = parsed.data;
        if (new Date(input.ends_at) <= new Date(input.starts_at)) {
            return Response.json({ error: 'La hora de fin debe ser después del inicio.' }, { status: 400, headers: NO_STORE });
        }
        const { data, error } = await (await createSupabaseServerClient()).rpc('create_time_off', {
            p_branch_id: context.branchId,
            p_employee_id: input.barber_id,
            p_starts_at: input.starts_at,
            p_ends_at: input.ends_at,
            p_reason: input.reason,
            p_requested_at: input.requested_at,
            p_requested_via: input.requested_via,
        });
        if (error) throw error;
        return Response.json(data, { status: 201, headers: NO_STORE });
    } catch (error) { return authErrorResponse(error); }
}
