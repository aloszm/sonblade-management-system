import { appMode } from '@/lib/app-mode';
import { checkAdminKey, publicConfigPresent } from '@/lib/system/health';

export const dynamic = 'force-dynamic';

const NO_STORE = { 'Cache-Control': 'no-store' };

/**
 * Salud del servidor, pública a propósito (la visita un reloj de GitHub todos los días; ver
 * .github/workflows/keepalive-backup.yml). Hace una sola consulta mínima y no revela llaves,
 * el proyecto ni mensajes del proveedor; solo si cada pieza funciona y, si no, una causa legible.
 */
export async function GET() {
    if (!publicConfigPresent()) {
        return Response.json({
            ok: false, mode: appMode(), publicConfig: false, adminKeyConfigured: false, adminKeyWorks: false,
            cause: 'Falta la configuración pública de Supabase (dirección y llave publicable).',
        }, { status: 503, headers: NO_STORE });
    }
    const key = await checkAdminKey();
    return Response.json({
        ok: key.works,
        mode: appMode(),
        publicConfig: true,
        adminKeyConfigured: key.configured,
        adminKeyWorks: key.works,
        ...(key.works ? {} : { cause: key.cause }),
    }, { status: key.works ? 200 : 503, headers: NO_STORE });
}
