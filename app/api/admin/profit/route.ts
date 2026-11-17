import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { isValidDay, MAX_RANGE_DAYS, rangeDays } from '@/lib/admin/profit';
import { loadProfitReport } from '@/lib/admin/profit-data';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const Day = (message: string) => z.string({ error: message }).refine(isValidDay, message);
const QuerySchema = z.object({
    from: Day('Fecha inicial no válida.'),
    to: Day('Fecha final no válida.'),
}).refine((q) => q.from <= q.to, { message: 'La fecha inicial debe ser anterior o igual a la final.' })
    .refine((q) => rangeDays(q.from, q.to) <= MAX_RANGE_DAYS, { message: `El periodo no puede pasar de ${MAX_RANGE_DAYS} días.` });

/** Utilidad real del periodo (solo lectura). Solo dueño y gerencia; RLS vuelve a limitar a su sucursal. */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const params = request.nextUrl.searchParams;
        const parsed = QuerySchema.safeParse({ from: params.get('from') ?? undefined, to: params.get('to') ?? undefined });
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
        const supabase = await createSupabaseServerClient();
        const report = await loadProfitReport(supabase as unknown as SupabaseClient,
            { businessId: context.businessId, branchId: context.branchId }, parsed.data);
        return Response.json(report, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
