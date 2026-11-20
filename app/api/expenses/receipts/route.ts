import { NextRequest } from 'next/server';
import { z } from 'zod';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { MANAGEMENT_ROLES } from '@/lib/auth/roles';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { NO_STORE, badRequest } from '@/lib/money/api';
import { RECEIPTS_BUCKET, RECEIPT_MAX_BYTES, RECEIPT_TYPES } from '@/lib/expenses/rules';

export const dynamic = 'force-dynamic';

const UploadSchema = z.object({
    content_type: z.string().refine((t) => t in RECEIPT_TYPES, 'El comprobante debe ser una foto (JPG, PNG, WEBP, HEIC) o un PDF.'),
    size: z.number().int().positive('El archivo está vacío.').max(RECEIPT_MAX_BYTES, 'El comprobante no puede pasar de 5 MB.'),
});

/**
 * Pide un enlace firmado para SUBIR un comprobante (dueño y gerencia). El navegador sube el archivo directo a
 * Storage con `supabase.storage.from('expense-receipts').uploadToSignedUrl(path, token, file)` y después manda
 * `path` como `receipt_path` en POST /api/expenses o PATCH /api/expenses/[id]/receipt.
 * La ruta la decide el servidor: <negocio>/<sucursal>/<AAAA-MM>/<uuid>.<ext>. El enlace se crea con la sesión de la
 * persona, así que la política de Storage (subir: dueño y gerencia de esa sucursal) también se aplica; el bucket
 * limita tamaño (5 MB) y tipo (imágenes y PDF).
 */
export async function POST(request: NextRequest) {
    try {
        const context = await requireAuthContext(MANAGEMENT_ROLES);
        const parsed = UploadSchema.safeParse(await request.json().catch(() => null));
        if (!parsed.success) return badRequest(parsed.error);
        const month = new Date().toISOString().slice(0, 7);
        const path = `${context.businessId}/${context.branchId}/${month}/${crypto.randomUUID()}.${RECEIPT_TYPES[parsed.data.content_type]}`;
        const supabase = await createSupabaseServerClient();
        const { data, error } = await supabase.storage.from(RECEIPTS_BUCKET).createSignedUploadUrl(path);
        if (error || !data) {
            console.error('[api] comprobante: no se pudo firmar la subida', error?.message);
            return Response.json({ error: 'No se pudo preparar la subida del comprobante.' }, { status: 503, headers: NO_STORE });
        }
        return Response.json({ bucket: RECEIPTS_BUCKET, path: data.path, token: data.token, signed_url: data.signedUrl }, { status: 201, headers: NO_STORE });
    } catch (error) {
        return authErrorResponse(error);
    }
}
