/**
 * Entradas de mercancía (decisión del dueño, 19 nov 2026): recepción y caja pueden SUMAR existencias
 * cuando llega mercancía, con comentario obligatorio y su propio PIN. No restan ni cambian mínimos,
 * costos o precios. La base aplica la misma regla en public.receive_inventory_stock
 * (migración 20261119193000_receive_inventory_stock); aquí está para avisar antes de enviar.
 */
/** Tope por operación para frenar errores de dedo (p. ej. 1000 en lugar de 10). */
export const RECEIVE_MAX = 500;
export const RECEIVE_COMMENT_MIN = 3;
export const RECEIVE_COMMENT_MAX = 300;

/** null si la cantidad sirve; si no, el mensaje para la persona. */
export function receiveQuantityProblem(quantity: number): string | null {
    if (!Number.isInteger(quantity) || quantity < 1) return 'Escribe cuántas piezas llegaron (al menos 1).';
    if (quantity > RECEIVE_MAX) return `Una entrada no puede pasar de ${RECEIVE_MAX} piezas. Si llegó más, regístrala en varias partes.`;
    return null;
}

/** null si el comentario sirve; si no, el mensaje para la persona. */
export function receiveCommentProblem(comment: string | null | undefined): string | null {
    const length = (comment ?? '').trim().length;
    if (length < RECEIVE_COMMENT_MIN || length > RECEIVE_COMMENT_MAX) {
        return `Escribe un comentario de la entrada (de ${RECEIVE_COMMENT_MIN} a ${RECEIVE_COMMENT_MAX} letras).`;
    }
    return null;
}
