import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FEEDBACK_WRITER_ROLES } from '@/lib/auth/roles';
import type { FeedbackCounters } from '@/lib/feedback/model';
import { NO_STORE } from '@/lib/money/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Contadores del menú: `unseen_updates` (mis comentarios con respuesta o cambio de estado sin ver) para todos;
 * `new_count` (comentarios en 'nuevo') solo para la cuenta principal; para los demás llega null.
 */
export async function GET() {
    try {
        const context = await requireAuthContext(FEEDBACK_WRITER_ROLES);
        const db = await createSupabaseServerClient();
        const { data, error } = await db.rpc('app_feedback_counters', { p_business_id: context.businessId });
        if (error) throw error;
        const raw = (data ?? {}) as Record<string, unknown>;
        const counters: FeedbackCounters = {
            unseen_updates: Number(raw.unseen_updates ?? 0),
            new_count: raw.new_count === null || raw.new_count === undefined ? null : Number(raw.new_count),
            is_owner: Boolean(raw.is_owner),
        };
        return Response.json(counters, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
