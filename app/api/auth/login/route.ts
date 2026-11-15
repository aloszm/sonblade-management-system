import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const CredentialsSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) });
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' };

export async function POST(request: NextRequest) {
    const parsed = CredentialsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Correo o contraseña no válidos.' }, { status: 400, headers: NO_CACHE });
    const unavailable = () => NextResponse.json({ error: 'No pudimos conectar con el servidor. Intenta de nuevo en un momento.' }, { status: 503, headers: NO_CACHE });
    try {
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) {
            const status = (error as { status?: number }).status;
            if (status === 429 || (error as { code?: string }).code === 'over_request_rate_limit') {
                return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.' }, { status: 429, headers: NO_CACHE });
            }
            // Falla de red hacia el servicio de acceso (status 0 o sin número) o error del servicio (5xx): no es culpa de la contraseña.
            if (error.name === 'AuthRetryableFetchError' || status === undefined || status === 0 || status >= 500) return unavailable();
            return NextResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 401, headers: NO_CACHE });
        }
        if (!data.user) return NextResponse.json({ error: 'Correo o contraseña incorrectos.' }, { status: 401, headers: NO_CACHE });
        return NextResponse.json({ success: true }, { headers: NO_CACHE });
    } catch {
        return unavailable();
    }
}

export async function DELETE() {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return NextResponse.json({ success: true }, { headers: NO_CACHE });
}

