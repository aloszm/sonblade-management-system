import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const BodySchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inicial no válida.'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha final no válida.'),
    audience: z.enum(['interno', 'contador'], { error: 'Elige para quién es el reporte.' }),
});

/**
 * Emite un reporte: la base lo arma, le asigna el siguiente folio (REP-000001), calcula el código de
 * verificación (SHA-256 del contenido exacto), guarda una copia que nadie puede cambiar y lo anota en
 * la bitácora. Devuelve folio, código y contenido para generar el PDF o el Excel con ellos.
 * Cada llamada emite un folio nuevo. Solo dueño y gerencia.
 */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
        const parsed = BodySchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('register_report_export', {
            p_branch_id: context.branchId, p_from: parsed.data.from, p_to: parsed.data.to, p_audience: parsed.data.audience,
        });
        if (error) throw error;
        return Response.json(data, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
