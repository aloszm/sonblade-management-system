import type { SupabaseClient } from '@supabase/supabase-js';
import { addDays } from '@/lib/settlements/week';
import { zonedDayStartIso } from '@/lib/utils/dates';

/** Zona horaria configurada del negocio (businesses.timezone), por ejemplo 'America/Mexico_City'. */
export async function loadBusinessTimezone(supabase: SupabaseClient, businessId: string): Promise<string> {
    const { data, error } = await supabase.from('businesses').select('timezone').eq('id', businessId).single();
    if (error) throw error;
    return (data as { timezone: string }).timezone;
}

/**
 * Convierte días 'YYYY-MM-DD' del negocio en un rango de instantes [from, to):
 * desde la medianoche del primer día hasta la medianoche siguiente al último.
 */
export function businessDayRange(fromDay: string, toDay: string, timeZone: string): { from: string; to: string } {
    return { from: zonedDayStartIso(fromDay, timeZone), to: zonedDayStartIso(addDays(toDay, 1), timeZone) };
}
