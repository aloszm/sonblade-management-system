import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };
const UpdateSchema = z.object({
    name: z.string().trim().min(2).max(120).optional(),
    phone: z.string().trim().max(32).nullable().optional(),
    status: z.enum(['active', 'inactive']).optional(),
    // Permiso para autorizar descuentos en caja (además de dueño, administración y recepción).
    can_authorize_discounts: z.boolean().optional(),
}).refine((value) => Object.keys(value).length > 0, 'No hay cambios que guardar.');

/** Edita un barbero. Los PIN de la versión 1 ya no existen: se entra con correo y contraseña. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(['owner', 'admin']);
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
        if (parsed.data.can_authorize_discounts !== undefined) update.can_authorize_discounts = parsed.data.can_authorize_discounts;

        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.from('employees').update(update as never)
            .eq('business_id', context.businessId).eq('id', id.data)
            .select('id, display_name, phone, is_active, can_authorize_discounts').maybeSingle();
        if (error) throw error;
        if (!data) return Response.json({ error: 'Barbero no encontrado.' }, { status: 404, headers: NO_STORE });
        const row = data as unknown as { id: string; display_name: string; phone: string | null; is_active: boolean; can_authorize_discounts: boolean };
        return Response.json({ id: row.id, name: row.display_name, phone: row.phone, status: row.is_active ? 'active' : 'inactive', canAuthorizeDiscounts: row.can_authorize_discounts }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
