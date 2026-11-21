import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { FEEDBACK_REVIEWER_ROLES } from '@/lib/auth/roles';
import { REPLY_MAX, REVIEW_STATUSES, toFeedbackItem, type FeedbackRow } from '@/lib/feedback/model';
import { IdSchema, NO_STORE, badRequest } from '@/lib/money/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Cambiar el estado de un comentario y/o responderlo: solo la cuenta principal (public.review_app_feedback lo
 * vuelve a decidir). `reply: ''` quita la respuesta. Cada cambio queda en el historial con quién y cuándo.
 */
const ReviewSchema = z.object({
    status: z.enum(REVIEW_STATUSES, { message: 'Elige un estado: visto, en proceso, hecho o descartado.' }).optional(),
    reply: z.string().trim().max(REPLY_MAX, `La respuesta es muy larga (máximo ${REPLY_MAX} caracteres).`).optional(),
}).strict().refine((v) => v.status !== undefined || v.reply !== undefined, { message: 'Indica el estado o la respuesta.' });

export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(FEEDBACK_REVIEWER_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Comentario no encontrado.', 404);
        const parsed = ReviewSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const db = await createSupabaseServerClient();
        const { data, error } = await db.rpc('review_app_feedback', {
            p_feedback_id: id.data,
            p_status: parsed.data.status,
            p_reply: parsed.data.reply,
        });
        if (error) throw error;
        const row = data as unknown as FeedbackRow & { changed?: boolean };
        return Response.json({ item: toFeedbackItem(row, context.userId), changed: Boolean(row.changed) }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
