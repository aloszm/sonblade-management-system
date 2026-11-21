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

// ── Motivo de la diferencia al cerrar (decisión del dueño, 21 nov 2026)
// Si lo contado no es igual a lo que debe haber, el cierre pide escribir por qué. La base lo exige con el mismo mensaje
// (close_cash_session, migración 20261121110000) y decide la diferencia con su propia cuenta; aquí solo se avisa antes.

/** Sugerencias de un toque: rellenan el texto y se pueden editar. «Otro» deja el campo vacío para escribir. */
export const DIFFERENCE_SUGGESTIONS = ['Cambio mal dado', 'Gasto sin registrar', 'Propina entregada en efectivo sin registrar', 'Error al contar'] as const;
export const DIFFERENCE_OTHER = 'Otro';

/** Hay sobrante o faltante (al centavo). */
export function differenceNeedsReason(difference: number): boolean {
    return cents(difference) !== 0;
}

/** «Faltan $30.00» / «Sobran $50.00» / «Cuadra». */
export function differenceText(difference: number): string {
    if (!differenceNeedsReason(difference)) return 'Cuadra';
    return `${difference > 0 ? 'Sobran' : 'Faltan'} ${formatMoney(Math.abs(difference))}`;
}

/**
 * El mensaje cuando falta el motivo: el mismo texto en la pantalla, en la ruta y en close_cash_session
 * (formatMoney y private.money_text escriben igual: «$30», «$30.50», «$1,500»).
 */
export function differenceReasonMessage(difference: number): string {
    return `Hay una diferencia de ${formatMoney(Math.abs(difference))} (${difference < 0 ? 'faltante' : 'sobrante'}): escribe el motivo para cerrar (de ${REASON_MIN} a ${REASON_MAX} letras).`;
}

/** null si se puede cerrar (cuadra, o el motivo sirve); si no, el mensaje. */
export function differenceReasonProblem(difference: number, text: string | null | undefined): string | null {
    if (!differenceNeedsReason(difference)) return null;
    return reasonProblem(text) ? differenceReasonMessage(difference) : null;
}

/** ¿Este error es la base (o la ruta) pidiendo el motivo de la diferencia? */
export function isDifferenceReasonError(message: string | null | undefined): boolean {
    return /escribe el motivo para cerrar/.test(message ?? '');
}

/** Aviso para una pantalla abierta antes de publicar esta versión: no tiene dónde escribir el motivo. */
export const RELOAD_FOR_REASON = 'Si no ves dónde escribirlo, recarga la página.';
