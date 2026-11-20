import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { loadBusinessTimezone } from '@/lib/business/timezone';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadEmployees, loadTeamWeekData } from '@/lib/team/load';
import { buildPersonLines, lineApi, personWeekApi, summarizePerson } from '@/lib/team/person-week';
import { teamWindow } from '@/lib/team/summary';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Desglose de la semana de una persona: cada servicio o producto con su fecha, folio, base, porcentaje, comisión y
 * propina, más los totales (los mismos de su tarjeta). Mismos permisos que la pantalla Equipo.
 */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ employeeId: string }> }) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const id = z.string().uuid().safeParse((await params).employeeId);
        if (!id.success) return Response.json({ error: 'Persona no encontrada.' }, { status: 404, headers: NO_STORE });
        const supabase = await createSupabaseServerClient();
        const timezone = await loadBusinessTimezone(supabase, context.businessId);
        const window = teamWindow('week', new Date(), timezone);
        const employees = await loadEmployees(supabase, context.businessId);
        const employee = employees.find((e) => e.id === id.data);
        if (!employee) return Response.json({ error: 'Persona no encontrada.' }, { status: 404, headers: NO_STORE });
        const data = await loadTeamWeekData(supabase, context, window, employees);
        const summary = summarizePerson(data, { id: employee.id, name: employee.display_name, isBarber: employee.is_barber });
        return Response.json({
            timezone, window, summary: personWeekApi(summary), lines: buildPersonLines(data, employee.id).map(lineApi),
        }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
