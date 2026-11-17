import { NextResponse } from 'next/server';
import { bookingErrorResponse } from './rules';

export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export function json(body: unknown, status = 200, extra: Record<string, string> = {}): NextResponse {
    return NextResponse.json(body, { status, headers: { ...NO_STORE, ...extra } });
}

/** Respuesta para un rechazo { error: "<código>" } que devuelve la base. */
export function dbErrorResponse(result: Record<string, unknown>): NextResponse {
    const mapped = bookingErrorResponse(String(result.error), typeof result.retry_after === 'number' ? result.retry_after : undefined);
    return json(mapped.body, mapped.status, mapped.retryAfter ? { 'Retry-After': String(mapped.retryAfter) } : {});
}

export function serverError(error: unknown): NextResponse {
    console.error('[reservas]', error instanceof Error ? error.message : error);
    return json({ error: 'No pudimos completar la solicitud. Intenta de nuevo.' }, 500);
}
