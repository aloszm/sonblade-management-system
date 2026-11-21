import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FEEDBACK_WRITER_ROLES } from '@/lib/auth/roles';
import { NO_STORE } from '@/lib/money/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Marca como vistos los avisos de MIS comentarios (respuestas o cambios de estado). Lo llama "Mis comentarios" al abrirse. */
export async function POST() {
    try {
        const context = await requireAuthContext(FEEDBACK_WRITER_ROLES);
        const db = await createSupabaseServerClient();
        const { data, error } = await db.rpc('mark_app_feedback_seen', { p_business_id: context.businessId });
        if (error) throw error;
        return Response.json({ marked: Number(data ?? 0) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
