import 'server-only';

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';
import { SESSION_COOKIE_OPTIONS } from '@/lib/supabase/cookie-options';

export function getPublicConfig() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Falta la configuración pública de Supabase.');
    return { url, key };
}

export async function createSupabaseServerClient() {
    const { url, key } = getPublicConfig();
    const cookieStore = await cookies();
    return createServerClient<Database>(url, key, {
        cookieOptions: SESSION_COOKIE_OPTIONS,
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
