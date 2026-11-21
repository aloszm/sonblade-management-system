import { NextRequest } from 'next/server';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FEEDBACK_WRITER_ROLES } from '@/lib/auth/roles';
import { toFeedbackItem, type FeedbackRow } from '@/lib/feedback/model';
import { IdSchema, NO_STORE } from '@/lib/money/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Retirar MI comentario mientras siga en 'nuevo'. Queda marcado como retirado, no se borra (public.retract_app_feedback). */
export async function POST(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(FEEDBACK_WRITER_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Comentario no encontrado.', 404);
        const db = await createSupabaseServerClient();
        const { data, error } = await db.rpc('retract_app_feedback', { p_feedback_id: id.data });
        if (error) throw error;
        return Response.json({ item: toFeedbackItem(data as unknown as FeedbackRow, context.userId) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
