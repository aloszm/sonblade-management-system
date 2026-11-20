/**
 * Validador único del teléfono de la reserva en línea (ahí es obligatorio). No se usa en la ficha interna
 * de clientes, donde el teléfono es opcional y tiene su propia regla (`lib/clients/labels.ts`).
 *
 * Un teléfono de México válido tiene exactamente 10 dígitos, no empieza con 0 y no repite el mismo dígito
 * en todas las posiciones (0000000000, 1111111111, …). Acepta espacios, guiones, puntos, paréntesis y el
 * prefijo +52, 52 o 521.
 */
export function normalizeBookingPhone(raw: unknown): string | null {
    if (typeof raw !== 'string' || raw.length > 32) return null;
    if (/[^\d\s()+.-]/.test(raw)) return null;
    let digits = raw.replace(/\D/g, '');
    if (digits.length === 13 && digits.startsWith('521')) digits = digits.slice(3);
    else if (digits.length === 12 && digits.startsWith('52')) digits = digits.slice(2);
    if (!/^[1-9]\d{9}$/.test(digits)) return null;
    if (/^(\d)\1{9}$/.test(digits)) return null;
    return digits;
}
