import { createClient } from '@supabase/supabase-js';

/**
 * Cliente de la página pública de reservas: siempre anónimo (clave publicable, sin sesión ni cookies),
 * aunque quien abra la página tenga una sesión del sistema. Solo puede ejecutar las funciones public.booking_*.
 * Tipos propios (no se regenera lib/database.types.ts). Sin 'server-only' para poder probar las rutas con Vitest:
 * no guarda secretos (solo la clave publicable) y solo lo importan rutas de API.
 */
type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

type Fn<Args> = { Args: Args; Returns: Json };

export interface BookingDatabase {
    public: {
        Tables: Record<string, never>;
        Views: Record<string, never>;
        Functions: {
            booking_config: Fn<{ p_slug: string }>;
            booking_availability: Fn<{ p_slug: string; p_service_id: string; p_date: string; p_barber_id: string | null; p_client: string }>;
            booking_days: Fn<{ p_slug: string; p_service_id: string; p_barber_id: string | null; p_from: string; p_to: string; p_client: string }>;
            booking_create: Fn<{
                p_slug: string; p_service_id: string; p_barber_id: string | null; p_date: string; p_time: string;
                p_name: string; p_phone: string; p_accept_privacy: boolean; p_client: string;
            }>;
            booking_get: Fn<{ p_slug: string; p_token: string }>;
            booking_cancel: Fn<{ p_slug: string; p_token: string }>;
        };
        Enums: Record<string, never>;
        CompositeTypes: Record<string, never>;
    };
}

export type BookingFunction = keyof BookingDatabase['public']['Functions'];

function bookingClient() {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error('Falta la configuración pública de Supabase.');
    return createClient<BookingDatabase>(url, key, {
        auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
    });
}

/** Llama una función de reservas y devuelve su JSON (o lanza si la base falla). */
export async function callBooking<F extends BookingFunction>(
    fn: F,
    args: BookingDatabase['public']['Functions'][F]['Args'],
): Promise<Record<string, unknown>> {
    const { data, error } = await bookingClient().rpc(fn, args as never);
    if (error) throw new Error(`booking rpc ${fn}: ${error.code ?? ''} ${error.message}`);
    return (data ?? {}) as unknown as Record<string, unknown>;
}
