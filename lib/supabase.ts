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
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
        // Fallback to anon key if service role not available (client-side)
        console.warn('⚠️ SUPABASE_SERVICE_ROLE_KEY is missing! `supabaseAdmin` is falling back to the anon key. RLS policies will apply.');
        return supabase;
    }
    _adminClient = createClient(supabaseUrl, serviceRoleKey);
    return _adminClient;
})();
