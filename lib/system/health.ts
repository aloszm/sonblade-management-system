import { adminKeyConfigured, createSupabaseAdminClient } from '@/lib/supabase/admin';

/**
 * Comprobaciones de salud del servidor. Nunca devuelven llaves, la dirección del proyecto
 * ni el texto de error del proveedor: solo un código y una causa escrita para personas.
 */
export type AdminKeyState =
    | { configured: false; works: false; code: 'missing'; cause: string }
    | { configured: true; works: true; code: 'ok'; cause?: undefined }
    | { configured: true; works: false; code: 'invalid' | 'unreachable'; cause: string };

const PROBE_TIMEOUT_MS = 4000;
const MISSING: AdminKeyState = { configured: false, works: false, code: 'missing', cause: 'Falta configurar SUPABASE_SECRET_KEY en el servidor.' };
const UNREACHABLE: AdminKeyState = { configured: true, works: false, code: 'unreachable', cause: 'No se pudo consultar la base de datos.' };

export function publicConfigPresent(): boolean {
    return Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
        (process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY),
    );
}

/** Consulta mínima (una fila de businesses) con la llave secreta: prueba que es del mismo proyecto que la URL. */
export async function checkAdminKey(): Promise<AdminKeyState> {
    if (!adminKeyConfigured()) return MISSING;
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
        const admin = createSupabaseAdminClient();
        if (!admin) return MISSING;
        const probe = Promise.resolve(admin.from('businesses').select('id').limit(1));
        const timeout = new Promise<'timeout'>((resolve) => { timer = setTimeout(() => resolve('timeout'), PROBE_TIMEOUT_MS); });
        const result = await Promise.race([probe, timeout]);
        if (result === 'timeout') {
            return { configured: true, works: false, code: 'unreachable', cause: 'La base de datos no respondió a tiempo.' };
        }
        if (!result.error) return { configured: true, works: true, code: 'ok' };
        // Una llave de otro proyecto (o revocada) vuelve como 401/403; cualquier otra cosa es un fallo de la base o de la red.
        if (result.status === 401 || result.status === 403) {
            return {
                configured: true, works: false, code: 'invalid',
                cause: 'La llave secreta del servidor no es válida para esta base de datos (puede ser de otro proyecto).',
            };
        }
        return UNREACHABLE;
    } catch {
        return UNREACHABLE;
    } finally {
        if (timer) clearTimeout(timer);
    }
}
