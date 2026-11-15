import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';

export const dynamic = 'force-dynamic';

/** Datos del recibo de pago. Dueño/administrador y el propio barbero; lo valida la base. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireAuthContext();
        const id = z.string().uuid().safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Recibo no encontrado.', 404);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('get_settlement_receipt', { p_settlement_id: id.data } as never);
        if (error) throw error;
        if (!data) throw new AuthorizationError('Recibo no encontrado.', 404);
        return Response.json(data, { headers: { 'Cache-Control': 'no-store' } });
    } catch (error) {
        return authErrorResponse(error);
    }
}
