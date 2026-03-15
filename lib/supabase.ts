import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

// Client-side Supabase client (safe for browser)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Server-side Supabase client (bypasses RLS - use in services / API routes)
// Cached singleton to avoid creating a new client on every call
let _adminClient: ReturnType<typeof createClient> | null = null;

export const supabaseAdmin = (() => {
    if (_adminClient) return _adminClient;
    
    // Si estamos en el cliente, retornamos el cliente normal para evitar crash en imports
    if (typeof window !== 'undefined') {
        return supabase;
    }

    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        throw new Error('SUPABASE_SERVICE_ROLE_KEY is required. Add it to .env.local');
    }
    _adminClient = createClient(supabaseUrl, serviceRoleKey);
    return _adminClient;
})();
