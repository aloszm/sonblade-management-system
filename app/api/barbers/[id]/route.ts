import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_ROLES, DISPLAY_TITLE_MAX, DISPLAY_TITLE_MIN, PRIMARY_ACCOUNT_LABEL, isPrimaryAccount } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const UpdateSchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    // Permiso para autorizar descuentos en caja (además de dueño, administración y recepción).
    can_authorize_discounts: z.boolean().optional(),
    // Título visible (p. ej. "Gerente Barbera"). Vacío o null lo quita. Solo texto: no cambia permisos.
    display_title: z.string().trim()
        .refine((v) => v === '' || (v.length >= DISPLAY_TITLE_MIN && v.length <= DISPLAY_TITLE_MAX), `El título visible debe tener entre ${DISPLAY_TITLE_MIN} y ${DISPLAY_TITLE_MAX} letras.`)
        .refine((v) => !/[\u0000-\u001f\u007f]/.test(v), 'El título visible debe ir en una sola línea.')
        .nullable().optional(),
}).refine((value) => Object.keys(value).length > 0, 'No hay cambios que guardar.');

/** Edita un barbero. Los PIN de la versión 1 ya no existen: se entra con correo y contraseña. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const id = z.string().uuid().safeParse((await params).id);
        if (!id.success) return Response.json({ error: 'Barbero no encontrado.' }, { status: 404, headers: NO_STORE });
        const body = await request.json().catch(() => null);
        if (body && typeof body === 'object' && 'pin' in body) {
            return Response.json({ error: 'Los PIN ya no existen: cada persona entra con su correo y contraseña.' }, { status: 400, headers: NO_STORE });
        }
        const parsed = UpdateSchema.safeParse(body);
        if (!parsed.success) return Response.json({ error: parsed.error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });

        const update: Record<string, unknown> = {};
        if (parsed.data.name !== undefined) update.display_name = parsed.data.name;
        if (parsed.data.phone !== undefined) update.phone = parsed.data.phone || null;
        if (parsed.data.status !== undefined) update.is_active = parsed.data.status === 'active';

        const supabase = await createSupabaseServerClient();
        const current = await supabase.from('employees').select('id, can_authorize_discounts, display_title')
            .eq('business_id', context.businessId).eq('id', id.data).maybeSingle();
        if (current.error) throw current.error;
        if (!current.data) return Response.json({ error: 'Barbero no encontrado.' }, { status: 404, headers: NO_STORE });
        // El permiso de autorizar descuentos ya no se escribe directo: lo cambia la base con sus reglas
        // (gerencia solo con barberos y recepción, nunca consigo misma). Solo se llama si cambia.
        const wanted = parsed.data.can_authorize_discounts;
        if (wanted !== undefined && wanted !== current.data.can_authorize_discounts) {
            const { error: permissionError } = await supabase.rpc('set_employee_discount_permission', { p_employee_id: id.data, p_allowed: wanted });
            if (permissionError) throw permissionError;
        }
        // Título visible: solo la cuenta principal. La base lo vuelve a exigir (set_employee_display_title);
        // gerencia no tiene permiso de escribir la columna directo. Solo se llama si cambia.
        if (parsed.data.display_title !== undefined) {
            const wantedTitle = parsed.data.display_title || null;
            if (wantedTitle !== (current.data.display_title ?? null)) {
                if (!isPrimaryAccount(context.role)) throw new AuthorizationError(`Solo la ${PRIMARY_ACCOUNT_LABEL} puede cambiar el título visible.`);
                const { error: titleError } = await supabase.rpc('set_employee_display_title', { p_employee_id: id.data, p_title: wantedTitle ?? '' });
                if (titleError) throw titleError;
            }
        }
        const query = Object.keys(update).length > 0
            ? supabase.from('employees').update(update as never).eq('business_id', context.businessId).eq('id', id.data)
            : supabase.from('employees').select('id').eq('business_id', context.businessId).eq('id', id.data);
        const { data, error } = await query.select('id, display_name, display_title, phone, is_active, can_authorize_discounts').maybeSingle();
        if (error) throw error;
        if (!data) return Response.json({ error: 'Barbero no encontrado.' }, { status: 404, headers: NO_STORE });
        const row = data as unknown as { id: string; display_name: string; display_title: string | null; phone: string | null; is_active: boolean; can_authorize_discounts: boolean };
        return Response.json({ id: row.id, name: row.display_name, phone: row.phone, status: row.is_active ? 'active' : 'inactive', canAuthorizeDiscounts: row.can_authorize_discounts, displayTitle: row.display_title ?? null }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
