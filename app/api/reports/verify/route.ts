import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const BodySchema = z.object({
    folio: z.string().trim().min(1, 'Escribe el folio.').max(32),
    code: z.string().trim().min(1, 'Escribe el código de verificación.').max(64),
});

/**
 * Comprueba un reporte emitido: folio y código (completo o los primeros 16 caracteres).
 * Si coinciden responde con el periodo, la audiencia y quién lo generó; si no, solo "no coincide".
 * Solo dueño y gerencia, y solo reportes de su negocio.
 */
export async function POST(request: NextRequest) {
    try {
        await requireAuthContext(['owner', 'admin']);
        const parsed = BodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('verify_report_export', { p_folio: parsed.data.folio, p_code: parsed.data.code });
        if (error) throw error;
        return Response.json(data, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
