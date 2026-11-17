import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const QuerySchema = z.object({
    role: z.enum(['admin', 'recepcion', 'barbero', 'system']).optional().catch(undefined),
    action: z.string().trim().max(80).optional().catch(undefined),
    from: z.string().trim().max(40).optional().catch(undefined),
    to: z.string().trim().max(40).optional().catch(undefined),
    limit: z.coerce.number().int().min(1).max(500).catch(100),
});

const toIso = (value: string | undefined, endOfDay: boolean) => {
    if (!value) return null;
    const date = new Date(/^\d{4}-\d{2}-\d{2}$/.test(value) ? `${value}T${endOfDay ? '23:59:59.999' : '00:00:00'}` : value);
    return Number.isNaN(date.getTime()) ? null : date.toISOString();
};

/** Registro de quién hizo qué. Solo dueño y administrador; la base valida el permiso. */
export async function GET(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const query = QuerySchema.parse(Object.fromEntries(request.nextUrl.searchParams));
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('list_audit_log', {
            p_branch_id: context.branchId,
            p_role: query.role ?? null,
            p_action: query.action && query.action !== 'all' ? query.action : null,
            p_from: toIso(query.from, false),
            p_to: toIso(query.to, true),
            p_limit: query.limit,
        } as never);
        if (error) throw error;
        return Response.json(data ?? [], { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
