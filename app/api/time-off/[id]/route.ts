import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FRONT_DESK_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const CancelSchema = z.object({ reason: z.string().trim().min(3, 'Escribe por qué se cancela la ausencia.').max(300) });

/** Cancela una ausencia (no se borra: queda quién, cuándo y por qué). */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireAuthContext([...FRONT_DESK_ROLES]);
        const id = z.string().uuid().safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Ausencia no encontrada.', 404);
        const parsed = CancelSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message }, { status: 400, headers: NO_STORE });
        const { data, error } = await (await createSupabaseServerClient()).rpc('cancel_time_off', {
            p_time_off_id: id.data, p_reason: parsed.data.reason,
        });
        if (error) throw error;
        return Response.json(data, { headers: NO_STORE });
    } catch (error) { return authErrorResponse(error); }
}
