import { NextRequest } from 'next/server';
import { z } from 'zod';
import { AuthorizationError, authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_READ_ROLES, MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { IdSchema, NO_STORE, badRequest } from '@/lib/money/api';
import { RECEIPTS_BUCKET } from '@/lib/expenses/rules';

export const dynamic = 'force-dynamic';

const AttachSchema = z.object({ receipt_path: z.string().trim().min(3).max(300) });

/** Enlace temporal (60 s) para ver el comprobante. La lectura del gasto y del archivo la filtra la RLS. */
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        const context = await requireAuthContext(MANAGEMENT_READ_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Gasto no encontrado.', 404);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.from('expenses').select('receipt_path')
            .eq('id', id.data).eq('business_id', context.businessId).eq('branch_id', context.branchId).maybeSingle();
        if (error) throw error;
        const path = (data as { receipt_path: string | null } | null)?.receipt_path;
        if (!path) throw new AuthorizationError('Ese gasto no tiene comprobante.', 404);
        const signed = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUrl(path, 60);
        if (signed.error || !signed.data) throw new AuthorizationError('No se pudo abrir el comprobante.', 404);
        return Response.json({ url: signed.data.signedUrl, expires_in: 60 }, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}

/** Adjunta el comprobante a un gasto ya registrado (una sola vez; no mueve dinero, sin PIN). Dueño y gerencia. */
export async function PATCH(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
    try {
        await requireAuthContext(MANAGEMENT_ROLES);
        const id = IdSchema.safeParse((await params).id);
        if (!id.success) throw new AuthorizationError('Gasto no encontrado.', 404);
        const parsed = AttachSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.rpc('set_expense_receipt', { p_expense_id: id.data, p_receipt_path: parsed.data.receipt_path });
        if (error) throw error;
        return Response.json(data, { headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
