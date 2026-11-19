/**
 * Mensajes de error para la persona usuaria: siempre en español, sin texto técnico
 * ("Failed to fetch", "TypeError…") ni el `message` crudo del servidor.
 */

export const MSG_OFFLINE = 'Parece que no hay conexión a internet. Revisa tu red e inténtalo de nuevo.';
export const MSG_SERVER = 'Hubo un problema en el servidor. Inténtalo de nuevo en un momento.';
export const MSG_GENERIC = 'Algo salió mal. Inténtalo de nuevo.';
export const MSG_SESSION = 'Tu sesión terminó. Vuelve a entrar para continuar.';
export const MSG_FORBIDDEN = 'No tienes permiso para hacer esto.';

/** Error de una respuesta HTTP no exitosa; conserva el estado y, si lo hay, un mensaje ya legible. */
export class HttpError extends Error {
    constructor(public readonly status: number, public readonly serverMessage?: string) {
        super(`HTTP ${status}`);
        this.name = 'HttpError';
    }
}

/** ¿El fallo es de red (sin conexión, servidor inalcanzable) y no una respuesta del servidor? */
export function isOfflineError(err: unknown): boolean {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
    if (err instanceof HttpError) return false;
    if (err instanceof TypeError) return true; // fetch() rechaza con TypeError cuando no hay red.
    const msg = err instanceof Error ? err.message : '';
    return /failed to fetch|networkerror|network request failed|load failed/i.test(msg);
}

/** Texto con letras españolas y sin apariencia de mensaje técnico en inglés. */
function looksUserFacing(text: string): boolean {
    const t = text.trim();
    if (t.length < 3 || t.length > 200) return false;
    if (/failed|error:|exception|undefined|null|typeerror|syntaxerror|unexpected token|econn|enotfound|fetch|\bat \w+\.|<\/?\w+>/i.test(t)) return false;
    return /[áéíóúñ¿¡]|\b(el|la|los|las|de|del|al|en|no|que|por|para|con|se|un|una|tu|ya|es|hay|pudo|ha|y)\b/i.test(t);
}

/**
 * Convierte cualquier fallo en un mensaje claro en español.
 * - Sin red → "no hay conexión".
 * - HTTP 401/403/5xx → mensaje fijo; 4xx con texto del servidor en español → ese texto.
 * - Cualquier otra cosa → `fallback` (por omisión, un mensaje genérico). Nunca devuelve `err.message` sin filtrar.
 */
export function toUserMessage(err: unknown, fallback: string = MSG_GENERIC): string {
    if (isOfflineError(err)) return MSG_OFFLINE;
    if (err instanceof HttpError) {
        if (err.status === 401) return MSG_SESSION;
        if (err.status === 403) return MSG_FORBIDDEN;
        if (err.status >= 500) return MSG_SERVER;
        if (err.serverMessage && looksUserFacing(err.serverMessage)) return err.serverMessage;
        return fallback;
    }
    if (err instanceof Error && looksUserFacing(err.message)) return err.message;
    return fallback;
}

/** Para pantallas que muestran el ícono de "sin conexión" en vez del genérico. */
export const isOffline = isOfflineError;

/**
 * Lee una respuesta JSON y lanza `HttpError` si no fue exitosa (con el campo `error` del cuerpo, si existe).
 * No cambia la llamada a la API: solo uniforma cómo se interpreta su resultado.
 */
export async function readJson<T>(res: Response): Promise<T> {
    if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: unknown } | null;
        throw new HttpError(res.status, typeof body?.error === 'string' ? body.error : undefined);
    }
    return res.json() as Promise<T>;
}
