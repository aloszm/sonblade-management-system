import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';
const CredentialsSchema = z.object({ email: z.string().email().max(254), password: z.string().min(1).max(256) });
const NO_CACHE = { 'Cache-Control': 'no-store, no-cache, must-revalidate', Pragma: 'no-cache' };

export async function POST(request: NextRequest) {
    const parsed = CredentialsSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) return NextResponse.json({ error: 'Correo o contraseña no válidos.' }, { status: 400, headers: NO_CACHE });
    const supabase = await createSupabaseServerClient();
    const { data, error } = await supabase.auth.signInWithPassword(parsed.data);
    if (error || !data.user) return NextResponse.json({ error: 'No se pudo iniciar sesión. Revisa tus credenciales.' }, { status: 401, headers: NO_CACHE });
    return NextResponse.json({ success: true }, { headers: NO_CACHE });
}

export async function DELETE() {
    const supabase = await createSupabaseServerClient();
    await supabase.auth.signOut();
    return NextResponse.json({ success: true }, { headers: NO_CACHE });
}

