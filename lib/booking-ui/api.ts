import { mapApiError, OFFLINE_ERROR, type BookingError } from './errors';
import type {
    Availability, BookingConfig, BookingDetail, BookingSummary, CreateBookingBody, DayAvailability,
} from './types';

export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: BookingError };

async function call<T>(url: string, init?: RequestInit): Promise<ApiResult<T>> {
    let res: Response;
    try {
        res = await fetch(url, { ...init, headers: { Accept: 'application/json', ...(init?.body ? { 'Content-Type': 'application/json' } : {}) } });
    } catch {
        return { ok: false, error: OFFLINE_ERROR };
    }
    let body: unknown = null;
    try { body = await res.json(); } catch { /* cuerpo vacío o no JSON */ }
    if (!res.ok) {
        return { ok: false, error: mapApiError(res.status, body as { error?: string; code?: string; field?: string } | null, res.headers?.get?.('Retry-After')) };
    }
    return { ok: true, data: body as T };
}

const qs = (p: Record<string, string | null | undefined>) =>
    Object.entries(p).filter(([, v]) => v).map(([k, v]) => `${k}=${encodeURIComponent(v as string)}`).join('&');

const BASE = '/api/public/booking';

export const bookingApi = {
    config: () => call<BookingConfig>(`${BASE}/config`),
    availability: (date: string, serviceId: string, barberId: string | null) =>
        call<Availability>(`${BASE}/availability?${qs({ date, service_id: serviceId, barber_id: barberId })}`),
    days: (serviceId: string, barberId: string | null, from: string, to: string) =>
        call<{ days: DayAvailability[] }>(`${BASE}/days?${qs({ service_id: serviceId, barber_id: barberId, from, to })}`),
    create: (body: CreateBookingBody) =>
        call<{ token: string; booking: BookingSummary }>(BASE, { method: 'POST', body: JSON.stringify(body) }),
    get: (token: string) => call<{ booking: BookingDetail }>(`${BASE}/${encodeURIComponent(token)}`),
    cancel: (token: string) => call<{ booking: BookingDetail }>(`${BASE}/${encodeURIComponent(token)}`, { method: 'DELETE' }),
};
