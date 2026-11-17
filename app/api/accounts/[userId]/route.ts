import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

export const dynamic = 'force-dynamic';
const Schema = z.object({ active: z.boolean() });

/**
 * Activar o desactivar el acceso de alguien. Funciona SIN la llave de servidor: la base marca
 * la membresía como inactiva (con permisos y bitácora) y el middleware ya no deja usar la app.
 * Si la llave está configurada, además se bloquea la cuenta en Supabase Auth.
 */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ userId: string }> }) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const { userId } = await params;
        const parsed = Schema.safeParse(await request.json().catch(() => null));
        if (!parsed.success || !z.string().uuid().safeParse(userId).success) return NextResponse.json({ error: 'Los datos no son válidos.' }, { status: 400 });
        const supabase = await createSupabaseServerClient();
        const { error } = await supabase.rpc('set_account_active', { p_business_id: context.businessId, p_user_id: userId, p_active: parsed.data.active });
        if (error) throw error;
        const admin = createSupabaseAdminClient();
        if (admin) await admin.auth.admin.updateUserById(userId, { ban_duration: parsed.data.active ? 'none' : '876000h' }).catch(() => undefined);
        return NextResponse.json({ success: true }, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) { return authErrorResponse(error); }
}
