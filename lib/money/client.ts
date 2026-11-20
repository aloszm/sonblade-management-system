import { HttpError, toUserMessage } from '@/lib/utils/errors';

/** Pide datos de una API de dinero (sin caché) y lanza `HttpError` si falla. */
export async function getJson<T>(url: string): Promise<T> {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) {
        const body = await res.json().catch(() => null) as { error?: unknown } | null;
        throw new HttpError(res.status, typeof body?.error === 'string' ? body.error : undefined);
    }
    return res.json() as Promise<T>;
}

/**
 * Envía un cambio a la API. Si falla lanza un `Error` con el mensaje ya en español para mostrarlo tal cual
 * (la ventana del PIN lo enseña). 428 = falta el PIN; 400 `pin_error` = PIN incorrecto; 409 = regla del negocio
 * (p. ej. el sobre no alcanza). Devuelve el estado para distinguir 201 de 200 (reintento).
 */
export async function sendJson<T>(url: string, method: 'POST' | 'PATCH' | 'PUT', body: unknown, fallback = 'No se pudo completar. Inténtalo de nuevo.'): Promise<{ status: number; data: T }> {
    let res: Response;
    try {
        res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
    } catch (e) {
        throw new Error(toUserMessage(e, fallback));
    }
    const data = await res.json().catch(() => null) as (T & { error?: unknown; needs_pin?: boolean }) | null;
    if (!res.ok) {
        if (res.status === 428 || data?.needs_pin) throw new Error('Escribe tu PIN para confirmar.');
        throw new Error(toUserMessage(new HttpError(res.status, typeof data?.error === 'string' ? data.error : undefined), fallback));
    }
    return { status: res.status, data: data as T };
}

/** Clave nueva para que un reintento no registre dos veces. Se genera al abrir el formulario, no en cada clic. */
export function newIdempotencyKey(): string {
    return crypto.randomUUID();
}

/** "1,250.50" o "1250.5" → 1250.5; vacío o inválido → NaN. */
export function parseAmount(text: string): number {
    const t = text.replace(/[$,\s]/g, '');
    if (t === '') return NaN;
    const n = Number(t);
    return Number.isFinite(n) ? n : NaN;
}

/** El monto lleva máximo 2 decimales. */
export function hasValidCents(n: number): boolean {
    return Math.abs(n * 100 - Math.round(n * 100)) < 1e-6;
}
