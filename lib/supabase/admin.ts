import 'server-only';

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { getPublicConfig } from '@/lib/supabase/server';

/**
 * Cliente de ADMINISTRACIÓN de Supabase Auth (crear cuentas, poner PIN temporales).
 *
 * Usa la llave secreta del proyecto (`sb_secret_...`, o la antigua service_role), que se salta
 * todas las reglas de la base. Por eso: solo existe en el servidor (`server-only`), nunca lleva
 * el prefijo NEXT_PUBLIC_, nunca se manda al navegador ni se escribe en los registros, y cada
 * ruta que la usa valida antes a la persona con requireAuthContext y sus permisos.
 * Sin sesión persistente ni renovación automática, como pide la documentación de Supabase.
 */
export function adminKeyConfigured(): boolean {
    return Boolean(process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY);
}

export function createSupabaseAdminClient(): SupabaseClient<Database> | null {
    const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!key) return null;
    const { url } = getPublicConfig();
    return createClient<Database>(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export const MISSING_ADMIN_KEY = 'Falta configurar la llave del servidor para administrar accesos.';
