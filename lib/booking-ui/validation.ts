import { normalizeBookingPhone } from '@/lib/booking/phone';

export type FieldResult<T> = { ok: true; value: T } | { ok: false; error: string };

/** Nombre: sin espacios de sobra, de 2 a 80 caracteres y con al menos una letra. */
export function validateName(raw: string): FieldResult<string> {
    const value = raw.replace(/\s+/g, ' ').trim();
    if (!value) return { ok: false, error: 'Escribe tu nombre.' };
    if (value.length < 2) return { ok: false, error: 'Escribe tu nombre completo.' };
    if (value.length > 80) return { ok: false, error: 'El nombre es muy largo; usa máximo 80 letras.' };
    if (!/\p{L}/u.test(value)) return { ok: false, error: 'El nombre debe tener letras.' };
    return { ok: true, value };
}

/** Teléfono de 10 dígitos. Acepta espacios, guiones, paréntesis y el prefijo +52 o 52. */
export function validatePhone(raw: string): FieldResult<string> {
    if (!raw.replace(/\D/g, '')) return { ok: false, error: 'Escribe tu teléfono de 10 dígitos.' };
    const digits = normalizeBookingPhone(raw);
    if (!digits) {
        const count = raw.replace(/\D/g, '').replace(/^(521|52)(?=\d{10}$)/, '').length;
        return { ok: false, error: count === 10 ? 'Ese teléfono no parece real. Escribe tu número de 10 dígitos, con lada.' : 'El teléfono debe tener 10 dígitos, con lada.' };
    }
    return { ok: true, value: digits };
}
