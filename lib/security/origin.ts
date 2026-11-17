/**
 * ¿Es una escritura a /api/** que viene de otro sitio? Para métodos distintos de GET/HEAD/OPTIONS,
 * si el navegador manda `Origin` y su host no coincide con el host de la petición, se rechaza (403).
 * Sin `Origin` (curl, servidor a servidor, navegadores viejos) se deja pasar: la cookie es
 * SameSite=Lax y cada ruta valida la sesión y el puesto.
 */
const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export function isCrossOriginWrite(method: string, pathname: string, origin: string | null, host: string | null): boolean {
    if (SAFE_METHODS.has(method.toUpperCase())) return false;
    if (pathname !== '/api' && !pathname.startsWith('/api/')) return false;
    if (origin === null || origin === undefined) return false;
    if (!host) return true;
    try {
        if (origin === 'null') return true;
        return new URL(origin).host.toLowerCase() !== host.toLowerCase();
    } catch {
        return true;
    }
}
