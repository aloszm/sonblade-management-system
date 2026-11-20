/**
 * Nombres de las formas de pago, en un solo lugar (Panel, Ventas, Caja, Finanzas, recibos, tickets y reportes).
 * Solo cambia cómo se nombran: los valores guardados (`cash`, `card`, `transfer`…) no se tocan.
 * "Tarjeta" y "Transferencia" son formas distintas: la primera es el cobro con terminal; la segunda, un depósito a la cuenta.
 */
export const PAYMENT_METHOD_LABELS: Record<string, string> = {
    cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro', mixed: 'Mixto',
};

/** Versión corta para etiquetas muy pequeñas (celdas de una tabla angosta). */
export const PAYMENT_METHOD_SHORT_LABELS: Record<string, string> = {
    cash: 'Efect.', card: 'Tarj.', transfer: 'Transf.', other: 'Otro', mixed: 'Mixto',
};

export function paymentMethodLabel(method: string | null | undefined, short = false): string {
    if (!method) return '';
    return (short ? PAYMENT_METHOD_SHORT_LABELS : PAYMENT_METHOD_LABELS)[method] ?? method;
}
