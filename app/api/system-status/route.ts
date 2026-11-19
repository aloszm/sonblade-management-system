import { appMode } from '@/lib/app-mode';
import { authErrorResponse, requireAuthContext } from '@/lib/auth/context';
import { createSupabaseServerClient } from '@/lib/supabase/server';
import { checkAdminKey } from '@/lib/system/health';
import { latestBundledMigration } from '@/lib/system/migrations';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/** Estado del sistema para el dueño. No incluye llaves ni direcciones: solo qué funciona y qué versión corre. */
export async function GET() {
    try {
        const context = await requireAuthContext(['owner']);
        const [key, business] = await Promise.all([
            checkAdminKey(),
            (await createSupabaseServerClient()).from('businesses').select('settings').eq('id', context.businessId).maybeSingle(),
        ]);
        const settings = business.data?.settings as { booking?: { enabled?: unknown } } | null | undefined;
        const commit = process.env.VERCEL_GIT_COMMIT_SHA ?? null;
        return Response.json({
            mode: appMode(),
            commit: commit ? commit.slice(0, 7) : null,
            environment: process.env.VERCEL_ENV ?? process.env.NODE_ENV ?? null,
            lastMigration: latestBundledMigration(),
            adminKey: { configured: key.configured, works: key.works, cause: key.cause ?? null },
            // null = no se pudo leer el ajuste (no se afirma que esté apagado).
            onlineBookingEnabled: business.error || !business.data ? null : settings?.booking?.enabled === true,
        }, { headers: NO_STORE });
    } catch (error) { return authErrorResponse(error); }
}
