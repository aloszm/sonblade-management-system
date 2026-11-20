import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { loadBusinessTimezone } from '@/lib/business/timezone';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { loadEmployees, loadTeamWeekData } from '@/lib/team/load';
import { buildWeekPeople, personWeekApi } from '@/lib/team/person-week';
import { teamWindow } from '@/lib/team/summary';

export const dynamic = 'force-dynamic';

/**
 * Semana de pago en curso (domingo a sábado, corte sábado 8 pm) de cada persona del equipo, para las tarjetas de
 * Equipo: servicios, productos, comisiones con su porcentaje, propinas y ventas. Para quienes ven la pantalla Equipo
 * (dueño, gerencia y consulta). Solo lee y agrupa lo ya generado; no calcula comisiones.
 */
export async function GET() {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const supabase = await createSupabaseServerClient();
        const timezone = await loadBusinessTimezone(supabase, context.businessId);
        const window = teamWindow('week', new Date(), timezone);
        const employees = await loadEmployees(supabase, context.businessId);
        const data = await loadTeamWeekData(supabase, context, window, employees);
        return Response.json({ timezone, window, people: buildWeekPeople(data).map(personWeekApi) }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
