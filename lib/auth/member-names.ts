import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Nombre visible de personas del negocio ("quién abrió la caja", "Cobró", "Registró").
 * Sale de public.member_display_names: solo el nombre (nunca correo, teléfono ni usuario de inicio de
 * sesión), solo de quien pertenece o perteneció al negocio y solo para miembros activos del negocio.
 * Antes se leía public.profiles, que por RLS solo ve su dueño: recepción y barberos recibían "Usuario"
 * cuando la acción la hizo la cuenta principal (que no tiene ficha de empleado).
 *
 * Los nombres son informativos: si la consulta falla se devuelve lo que haya y la pantalla usa su comodín,
 * en lugar de romper la caja o el ticket por un nombre.
 */
export async function loadMemberNames(
    supabase: SupabaseClient,
    businessId: string,
    userIds: ReadonlyArray<string | null | undefined>,
): Promise<Map<string, string>> {
    const ids = Array.from(new Set(userIds.filter((id): id is string => typeof id === 'string' && id.length > 0)));
    const names = new Map<string, string>();
    if (ids.length === 0) return names;
    const { data, error } = await supabase.rpc('member_display_names', { p_business_id: businessId, p_user_ids: ids.slice(0, 500) });
    if (error) {
        console.error('member_display_names', error.code ?? '', error.message);
        return names;
    }
    for (const row of (data ?? []) as { user_id: string; display_name: string | null }[]) {
        if (row.user_id && row.display_name) names.set(row.user_id, row.display_name);
    }
    return names;
}
