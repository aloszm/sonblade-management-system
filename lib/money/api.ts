import { z } from 'zod';
import { REASON_MAX, REASON_MIN } from '@/lib/cash/reasons';

/**
 * Piezas comunes de las rutas de sobres y gastos (B5/B6). La regla vive en la base
 * (funciones security definer con PIN y RLS); aquí solo se valida la forma para contestar
 * pronto y en español.
 */
export const NO_STORE = { 'Cache-Control': 'no-store' } as const;

export const IdSchema = z.string().uuid();
export const DaySchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Usa una fecha AAAA-MM-DD.');
export const MonthSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Usa un mes AAAA-MM.');

/** Monto en pesos: mayor a 0, hasta 1,000,000, con máximo 2 decimales (igual que private.valid_cash_amount). */
export const AmountSchema = z.number({ message: 'Escribe un monto válido.' })
    .positive('El monto debe ser mayor a 0.')
    .max(1_000_000, 'El monto no puede pasar de 1,000,000.')
    .refine((n) => Math.abs(n * 100 - Math.round(n * 100)) < 1e-6, 'El monto lleva máximo 2 decimales.');

export const CommentSchema = z.string({ message: `Escribe un comentario (de ${REASON_MIN} a ${REASON_MAX} letras).` }).trim()
    .min(REASON_MIN, `Escribe un comentario (de ${REASON_MIN} a ${REASON_MAX} letras).`)
    .max(REASON_MAX, `El comentario es muy largo (máximo ${REASON_MAX} letras).`);

/** Clave para que un doble clic o un reintento no registre dos veces (la genera la pantalla, p. ej. crypto.randomUUID()). */
export const IdempotencyKeySchema = z.string().trim().min(8).max(120);

export const PinSchema = z.string().max(16).optional();

export function badRequest(error: z.ZodError) {
    return Response.json({ error: error.issues[0]?.message ?? 'Solicitud inválida.' }, { status: 400, headers: NO_STORE });
}

export function needsPin(message = 'Confirma con tu PIN.') {
    return Response.json({ error: message, needs_pin: true }, { status: 428, headers: NO_STORE });
}

export const num = (value: unknown) => Number(value ?? 0);
