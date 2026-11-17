import { z } from 'zod';
import { CATEGORY_LABELS, SERVICE_CATEGORIES, categoryOf } from '@/lib/services/categories';

/**
 * Reservas en línea: validación y formato (funciones puras, sin acceso a la base).
 * Las reglas numéricas viven en businesses.settings.booking y la base las vuelve a validar;
 * estas constantes son los valores por omisión documentados en docs/implementation/RESERVAS.md.
 */
export const BOOKING_LEAD_MINUTES = 60;
export const BOOKING_MAX_DAYS_AHEAD = 30;
export const BOOKING_CANCEL_HOURS = 2;
export const BOOKING_MAX_ACTIVE_PER_PHONE = 2;
/** Límite de intentos (fijos en la base, private.booking_rules). */
export const BOOKING_ATTEMPTS_PER_HOUR = 5;
export const BOOKING_LOOKUPS_PER_MINUTE = 20;
/** Máximo de días por consulta del calendario. */
export const BOOKING_MAX_RANGE_DAYS = 31;
export const PRIVACY_URL = '/privacidad';

/** Negocio que atiende la página pública (un solo negocio por despliegue). */
export function bookingBusinessSlug(): string {
    return process.env.BOOKING_BUSINESS_SLUG?.trim() || 'gallo-420';
}

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/** "AAAA-MM-DD" que existe en el calendario. */
export function isDateKey(value: unknown): value is string {
    if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
    const [y, m, d] = value.split('-').map(Number);
    const date = new Date(Date.UTC(y, m - 1, d));
    return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
}

/** Días entre dos fechas "AAAA-MM-DD" (to − from). */
export function daysBetween(from: string, to: string): number {
    return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

/** Fecha dentro de la ventana [min, max] (ambas "AAAA-MM-DD"). */
export function isWithinWindow(date: string, min: string, max: string): boolean {
    return isDateKey(date) && date >= min && date <= max;
}

/**
 * Teléfono de México a 10 dígitos. Acepta espacios, guiones, paréntesis y el prefijo +52 / 52 / 521.
 * Devuelve null si no quedan exactamente 10 dígitos (que no empiecen con 0).
 */
export function normalizePhone(raw: unknown): string | null {
    if (typeof raw !== 'string' || raw.length > 32) return null;
    if (/[^\d\s()+.-]/.test(raw)) return null;
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
    else if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
    return /^[1-9]\d{9}$/.test(digits) ? digits : null;
}

/** Nombre recortado y con espacios simples; null si no mide 2–80 o trae HTML / caracteres de control. */
export function cleanName(raw: unknown): string | null {
    if (typeof raw !== 'string') return null;
    if (/[<>\u0000-\u001f\u007f]/.test(raw)) return null;
    const name = raw.replace(/\s+/g, ' ').trim();
    if (name.length < 2 || name.length > 80) return null;
    if (!/\p{L}/u.test(name)) return null;
    return name;
}

/** "13:30" → "1:30 p. m."; "09:00" → "9:00 a. m."; "12:00" → "12:00 p. m.". */
export function slotLabel(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    const h12 = h % 12 === 0 ? 12 : h % 12;
    return `${h12}:${String(m).padStart(2, '0')} ${h < 12 ? 'a. m.' : 'p. m.'}`;
}

const uuid = z.string().uuid('El dato no es válido.');
const dateKey = z.string().refine(isDateKey, 'La fecha no es válida.');
const optionalUuid = z.preprocess((v) => (v === '' || v === null ? undefined : v), uuid.optional());

export const AvailabilityQuery = z.object({
    date: dateKey,
    service_id: uuid,
    barber_id: optionalUuid,
});

export const DaysQuery = z.object({
    service_id: uuid,
    barber_id: optionalUuid,
    from: dateKey,
    to: dateKey,
}).refine((q) => daysBetween(q.from, q.to) >= 0 && daysBetween(q.from, q.to) < BOOKING_MAX_RANGE_DAYS, {
    message: `Consulta de 1 a ${BOOKING_MAX_RANGE_DAYS} días.`, path: ['to'],
});

export const BookingBody = z.object({
    service_id: uuid,
    barber_id: z.union([uuid, z.null()]).optional().transform((v) => v ?? null),
    date: dateKey,
    time: z.string().regex(/^([01]\d|2[0-3]):(00|30)$/, 'La hora no es válida.'),
    name: z.string().transform((v, ctx) => {
        const name = cleanName(v);
        if (!name) ctx.addIssue({ code: 'custom', message: 'Escribe tu nombre (de 2 a 80 letras, sin símbolos < >).' });
        return name ?? '';
    }),
    phone: z.string().transform((v, ctx) => {
        const phone = normalizePhone(v);
        if (!phone) ctx.addIssue({ code: 'custom', message: 'Escribe un teléfono de 10 dígitos.' });
        return phone ?? '';
    }),
    accept_privacy: z.literal(true, 'Acepta el aviso de privacidad para reservar.'),
    website: z.string().max(500).optional(),
});
export type BookingInput = z.infer<typeof BookingBody>;

/** Primer error de zod como respuesta { error, field }. */
export function firstIssue(error: z.ZodError): { error: string; field?: string } {
    const issue = error.issues[0];
    const field = typeof issue?.path[0] === 'string' ? issue.path[0] : undefined;
    const message = issue?.message && /[.!?]$/.test(issue.message) ? issue.message : 'Los datos no son válidos.';
    return field ? { error: message, field } : { error: message };
}

export const TOKEN_RE = /^[0-9a-f]{64}$/;

/** IP del solicitante según Vercel (primer valor de x-forwarded-for). Solo se usa para la huella con sal en la base. */
export function clientAddress(headers: Headers): string {
    const forwarded = headers.get('x-forwarded-for')?.split(',')[0]?.trim();
    const ip = forwarded || headers.get('x-real-ip')?.trim() || '';
    return ip.slice(0, 64) || 'unknown';
}

/** Códigos de rechazo de la base → respuesta HTTP del contrato. */
export function bookingErrorResponse(code: string, retryAfter?: number): { status: number; body: Record<string, unknown>; retryAfter?: number } {
    switch (code) {
        case 'disabled': return { status: 403, body: { error: 'Las reservas en línea no están disponibles por ahora.', code } };
        case 'rate_limited': return { status: 429, body: { error: 'Demasiados intentos. Espera un momento y vuelve a intentarlo.' }, retryAfter: retryAfter ?? 60 };
        case 'date_out_of_range': return { status: 400, body: { error: `Elige una fecha entre hoy y los próximos ${BOOKING_MAX_DAYS_AHEAD} días.`, field: 'date' } };
        case 'bad_range': return { status: 400, body: { error: `Consulta de 1 a ${BOOKING_MAX_RANGE_DAYS} días.`, field: 'to' } };
        case 'service_not_found': return { status: 400, body: { error: 'Ese servicio no está disponible en línea.', field: 'service_id' } };
        case 'barber_not_found': return { status: 400, body: { error: 'Ese barbero no está disponible en línea.', field: 'barber_id' } };
        case 'invalid_phone': return { status: 400, body: { error: 'Escribe un teléfono de 10 dígitos.', field: 'phone' } };
        case 'invalid_name': return { status: 400, body: { error: 'Escribe tu nombre (de 2 a 80 letras, sin símbolos < >).', field: 'name' } };
        case 'privacy_required': return { status: 400, body: { error: 'Acepta el aviso de privacidad para reservar.', field: 'accept_privacy' } };
        case 'invalid_time': return { status: 400, body: { error: 'La hora no es válida.', field: 'time' } };
        case 'slot_taken': return { status: 409, body: { error: 'Esa hora ya no está disponible.', code } };
        case 'too_many_active': return { status: 409, body: { error: `Ya tienes ${BOOKING_MAX_ACTIVE_PER_PHONE} reservas próximas con ese teléfono. Cancela una o llámanos.`, code } };
        case 'too_late': return { status: 409, body: { error: `Ya no se puede cancelar en línea: faltan menos de ${BOOKING_CANCEL_HOURS} horas. Llámanos, por favor.`, code } };
        case 'not_cancellable': return { status: 409, body: { error: 'Esta reserva ya no se puede cancelar.', code } };
        case 'not_found': return { status: 404, body: { error: 'No encontramos esa reserva.' } };
        default: return { status: 500, body: { error: 'No pudimos completar la solicitud. Intenta de nuevo.' } };
    }
}

export interface PublicService {
    id: string; name: string; category: string; category_label: string; price: number;
    variable_price: boolean; duration_minutes: number; description: string | null;
}

/** Servicios en el orden del cartel: categoría (orden del catálogo) y luego sort_order (ya viene de la base). */
export function orderServices(services: Array<Omit<PublicService, 'category_label' | 'price'> & { price: number | string }>): PublicService[] {
    const rank = (c: string) => SERVICE_CATEGORIES.indexOf(categoryOf(c));
    return services
        .map((s, index) => ({ s, index }))
        .sort((a, b) => rank(a.s.category) - rank(b.s.category) || a.index - b.index)
        .map(({ s }) => ({ ...s, price: Number(s.price), category_label: CATEGORY_LABELS[categoryOf(s.category)] }));
}

export interface BookingView {
    date: string; time: string; label: string; duration_minutes: number;
    service: { name: string; price: number; variable_price: boolean };
    barber: { name: string };
    customer_name: string;
    status: 'scheduled' | 'cancelled' | 'completed' | 'no_show';
    cancel_until: string;
    can_cancel: boolean;
}

type RawBooking = Omit<BookingView, 'label' | 'cancel_until' | 'service'> & {
    cancel_until: string; service: { name: string; price: number | string; variable_price: boolean };
};

/** Reserva de la base → forma del contrato (agrega la etiqueta y normaliza el precio y la fecha ISO). */
export function toBookingView(raw: RawBooking): BookingView {
    return {
        date: raw.date,
        time: raw.time,
        label: slotLabel(raw.time),
        duration_minutes: raw.duration_minutes,
        service: { name: raw.service.name, price: Number(raw.service.price), variable_price: raw.service.variable_price },
        barber: { name: raw.barber?.name ?? '' },
        customer_name: raw.customer_name,
        status: raw.status,
        cancel_until: new Date(raw.cancel_until).toISOString(),
        can_cancel: Boolean(raw.can_cancel),
    };
}
