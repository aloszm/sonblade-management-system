import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import type { ScheduleDay, WeekHours } from '@/lib/appointments/hours';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Horario del negocio y el semanal de cada barbero, para la agenda y el equipo. Todo el equipo lo puede ver. */
export async function GET() {
    try {
        const context = await requireAuthContext();
        const db = await createSupabaseServerClient();
        const [business, schedule] = await Promise.all([
            db.from('businesses').select('timezone, settings').eq('id', context.businessId).single(),
            db.from('employee_weekly_schedule').select('employee_id, weekday, is_off, starts, ends').eq('business_id', context.businessId),
        ]);
        if (business.error) throw business.error;
        if (schedule.error) throw schedule.error;
        const biz = business.data as unknown as { timezone: string; settings: { hours?: WeekHours } | null };
        const settings = biz.settings ?? {};
        const barbers: Record<string, ScheduleDay[]> = {};
        for (const row of (schedule.data ?? []) as { employee_id: string; weekday: number; is_off: boolean; starts: string | null; ends: string | null }[]) {
            (barbers[row.employee_id] ??= []).push({
                weekday: row.weekday, off: row.is_off, starts: row.starts?.slice(0, 5) ?? null, ends: row.ends?.slice(0, 5) ?? null,
            });
        }
        return Response.json({ timezone: biz.timezone, hours: settings.hours ?? null, barbers }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}
