import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';

function getPublicConfig() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Falta la configuración pública de Supabase.');
    return { url, key };
}

export async function createSupabaseServerClient() {
    const { url, key } = getPublicConfig();
    const cookieStore = await cookies();
    return createServerClient<Database>(url, key, {
        cookies: {
            getAll: () => cookieStore.getAll(),
            setAll: (values) => {
                try {
                    values.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
                } catch {
                    // Server Components cannot write cookies; middleware refreshes sessions.
                }
            },
        },
    });
}

export function createSupabaseAdminClient() {
    const { url } = getPublicConfig();
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SECRET_KEY;
    if (!key) throw new Error('Falta la clave de servicio de Supabase en el servidor.');
    return createClient<Database>(url, key, {
        auth: { autoRefreshToken: false, persistSession: false },
    });
}

