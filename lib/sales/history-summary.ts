/**
 * Resumen de la pantalla Ventas. Las ventas anuladas siguen en la lista (tachadas), pero NO cuentan como ventas:
 * así el número coincide con Panel, Finanzas y Reportes, que solo cuentan las cobradas (auditoría del 21 nov 2026:
 * Ventas decía 118 y las demás pantallas 116, porque el encabezado y la tarjeta contaban también las 2 anuladas).
 */
export type HistorySale = { status?: string | null; total: number | string };

export interface SalesHistorySummary {
    /** Ventas cobradas (no anuladas). */
    paidCount: number;
    /** Ventas anuladas que aparecen en la lista. */
    reversedCount: number;
    /** Suma de las cobradas. */
    total: number;
    /** total / paidCount, o null si no hay ventas cobradas. */
    averageTicket: number | null;
}

const isReversed = (sale: HistorySale) => sale.status === 'refunded';

export function summarizeSalesHistory(sales: HistorySale[]): SalesHistorySummary {
    const paid = sales.filter((s) => !isReversed(s));
    const total = Math.round(paid.reduce((sum, s) => sum + Number(s.total), 0) * 100) / 100;
    return {
        paidCount: paid.length,
        reversedCount: sales.length - paid.length,
        total,
        averageTicket: paid.length > 0 ? total / paid.length : null,
    };
}

/** «116 ventas cobradas» · «1 venta cobrada». */
export function paidSalesText(count: number): string {
    return count === 1 ? '1 venta cobrada' : `${count} ventas cobradas`;
}

/** «2 anuladas» · «1 anulada» · '' si no hay. Va aparte del número de ventas. */
export function reversedSalesText(count: number): string {
    if (count <= 0) return '';
    return count === 1 ? '1 anulada' : `${count} anuladas`;
}
