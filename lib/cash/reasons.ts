import { formatMoney } from '@/lib/utils/money';

/**
 * Motivos obligatorios de la caja (pedido del dueño): se puede cerrar con menos del fondo
 * recomendado o abrir con un monto distinto del que se dejó, pero escribiendo por qué.
 * La base aplica la misma regla (open_cash_session / close_cash_session); aquí está para avisar
 * en pantalla antes de enviar. El mismo largo (5 a 300) vale para el comentario de las
 * confirmaciones con PIN.
 */
export const REASON_MIN = 5;
export const REASON_MAX = 300;

/** null si el texto sirve; si no, el mensaje para la persona. */
export function reasonProblem(text: string | null | undefined, what = 'el motivo'): string | null {
    const length = (text ?? '').trim().length;
    if (length < REASON_MIN || length > REASON_MAX) return `Escribe ${what} (de ${REASON_MIN} a ${REASON_MAX} letras).`;
    return null;
}

const cents = (n: number) => Math.round(n * 100);

/** Con cuánto se espera abrir: lo que dejó el último cierre o, si no hay, el fondo recomendado. */
export function openingReference(lastFloatLeft: number | null | undefined, floatTarget: number): number {
    return lastFloatLeft ?? floatTarget;
}

/** Abrir con un monto distinto del esperado pide motivo. */
export function openingNeedsReason(openingCash: number, lastFloatLeft: number | null | undefined, floatTarget: number): boolean {
    return cents(openingCash) !== cents(openingReference(lastFloatLeft, floatTarget));
}

/** Texto del aviso al abrir con un monto distinto. */
export function openingWarning(openingCash: number, lastFloatLeft: number | null | undefined, floatTarget: number): string {
    return lastFloatLeft !== null && lastFloatLeft !== undefined
        ? `Ayer se dejaron ${formatMoney(lastFloatLeft)}; estás abriendo con ${formatMoney(openingCash)}.`
        : `El fondo recomendado es ${formatMoney(floatTarget)}; estás abriendo con ${formatMoney(openingCash)}.`;
}

/** Dejar menos del fondo recomendado para mañana pide motivo. */
export function closingNeedsReason(floatLeft: number, floatTarget: number): boolean {
    return cents(floatLeft) < cents(floatTarget);
}

/** Texto del aviso al cerrar dejando menos del fondo recomendado. */
export function closingWarning(floatLeft: number, floatTarget: number): string {
    return `Se recomienda dejar ${formatMoney(floatTarget)} para mañana; vas a dejar ${formatMoney(floatLeft)}.`;
}
