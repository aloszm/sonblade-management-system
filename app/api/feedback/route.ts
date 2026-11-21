import { NextRequest } from 'next/server';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { loadMemberNames } from '@/lib/auth/member-names';
import { FEEDBACK_REVIEWER_ROLES, FEEDBACK_WRITER_ROLES } from '@/lib/auth/roles';
import {
    BODY_MAX, BODY_MIN, FEEDBACK_COLUMNS, FEEDBACK_DEVICES, FEEDBACK_KINDS, FEEDBACK_STATUSES, SCREEN_PATH_RE,
    summarize, toFeedbackItem, type FeedbackRow,
} from '@/lib/feedback/model';
import { NO_STORE, badRequest } from '@/lib/money/api';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/**
 * Comentarios y sugerencias. La regla vive en la base (RLS de public.app_feedback y funciones de la migración
 * 20261120160000_app_feedback); aquí se valida la forma y se contesta pronto:
 *  - GET ?scope=mine (todos los puestos): lo que escribió la persona.
 *  - GET ?scope=all&status=&kind= (solo la cuenta principal): todo el negocio, con nombre de pila y resumen.
 *  - POST: escribir un comentario (todos los puestos, incluida consulta: FEEDBACK_WRITER_ROLES).
 */
const ListSchema = z.object({
    scope: z.enum(['mine', 'all']).default('mine'),
    status: z.enum([...FEEDBACK_STATUSES, 'retirado'], { message: 'Ese estado no existe.' }).optional(),
    kind: z.enum(FEEDBACK_KINDS, { message: 'Ese tipo no existe.' }).optional(),
});

const CreateSchema = z.object({
    kind: z.enum(FEEDBACK_KINDS, { message: 'Elige el tipo de comentario.' }),
    body: z.string({ message: `Escribe tu comentario (de ${BODY_MIN} a ${BODY_MAX} caracteres).` }).trim()
        .min(BODY_MIN, `Escribe un poco más (mínimo ${BODY_MIN} caracteres).`)
        .max(BODY_MAX, `El comentario es muy largo (máximo ${BODY_MAX.toLocaleString('es-MX')} caracteres).`),
    screen_path: z.string().regex(SCREEN_PATH_RE, 'La pantalla de origen no es válida.').nullish(),
    device: z.enum(FEEDBACK_DEVICES).nullish(),
}).strict();

const LIST_LIMIT = 500;

export async function GET(request: NextRequest) {
    try {
        const params = Object.fromEntries(request.nextUrl.searchParams.entries());
        const parsed = ListSchema.safeParse({ scope: params.scope || undefined, status: params.status || undefined, kind: params.kind || undefined });
        if (!parsed.success) return badRequest(parsed.error);
        const { scope, status, kind } = parsed.data;
        const context = await requireAuthContext(scope === 'all' ? FEEDBACK_REVIEWER_ROLES : FEEDBACK_WRITER_ROLES);
        const db = await createSupabaseServerClient();

        let query = db.from('app_feedback').select(FEEDBACK_COLUMNS).eq('business_id', context.businessId);
        if (scope === 'mine') query = query.eq('author_user_id', context.userId);
        const { data, error } = await query.order('created_at', { ascending: false }).limit(LIST_LIMIT);
        if (error) throw error;
        const rows = (data ?? []) as FeedbackRow[];

        if (scope === 'mine') {
            const items = rows.map((row) => toFeedbackItem(row, context.userId));
            return Response.json({ items }, { headers: NO_STORE });
        }

        const names = await loadMemberNames(db as unknown as SupabaseClient, context.businessId, rows.map((r) => r.author_user_id));
        const all = rows.map((row) => toFeedbackItem(row, context.userId, names));
        const items = all.filter((item) => (kind ? item.kind === kind : true)
            && (status === 'retirado' ? item.retracted : status ? item.status === status && !item.retracted : true));
        return Response.json({ items, summary: summarize(all), total: all.length }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(FEEDBACK_WRITER_ROLES);
        const parsed = CreateSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const input = parsed.data;
        const db = await createSupabaseServerClient();
        const { data, error } = await db.rpc('create_app_feedback', {
            p_business_id: context.businessId,
            p_kind: input.kind,
            p_body: input.body,
            p_screen_path: input.screen_path ?? undefined,
            p_device: input.device ?? undefined,
        });
        if (error) throw error;
        if (!data) throw new AuthorizationError('No se pudo guardar el comentario.', 500);
        return Response.json({ item: toFeedbackItem(data as unknown as FeedbackRow, context.userId) }, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
