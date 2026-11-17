import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const QuerySchema = z.object({
    from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha inicial no válida.'),
    to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Fecha final no válida.'),
    audience: z.enum(['interno', 'contador'], { error: 'Elige para quién es el reporte.' }),
});

/**
 * Vista previa del reporte completo (sin folio, no queda registrada). La arma la base con
 * public.business_full_report, que con audiencia "contador" ya omite nombres y teléfonos de
 * clientes. Solo dueño y gerencia; la base lo vuelve a validar.
 */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const params = request.nextUrl.searchParams;
        const parsed = QuerySchema.safeParse({ from: params.get('from'), to: params.get('to'), audience: params.get('audience') });
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('business_full_report', {
            p_branch_id: context.branchId, p_from: parsed.data.from, p_to: parsed.data.to, p_audience: parsed.data.audience,
        });
        if (error) throw error;
        return Response.json(data, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
