// Cierre de caja guiado. Estas cuentas solo proponen y muestran; la base las vuelve a
// verificar (public.close_cash_session) y es la que manda.

/** Billetes y monedas en circulación en México, de mayor a menor. */
export const DENOMINATIONS: { value: number; kind: 'bill' | 'coin' }[] = [
    { value: 1000, kind: 'bill' }, { value: 500, kind: 'bill' }, { value: 200, kind: 'bill' },
    { value: 100, kind: 'bill' }, { value: 50, kind: 'bill' }, { value: 20, kind: 'bill' },
    { value: 10, kind: 'coin' }, { value: 5, kind: 'coin' }, { value: 2, kind: 'coin' },
    { value: 1, kind: 'coin' }, { value: 0.5, kind: 'coin' },
];

const cents = (value: number) => Math.round(value * 100);

/** Total de un conteo por denominación: { "500": 2, "0.5": 3 } -> 1001.5 */
export function breakdownTotal(counts: Record<string, number>): number {
    let total = 0;
    for (const [value, count] of Object.entries(counts)) total += cents(Number(value)) * (Number(count) || 0);
    return total / 100;
}

/** Quita las denominaciones en cero para guardar solo lo que se contó. */
export function compactBreakdown(counts: Record<string, number>): Record<string, number> {
    return Object.fromEntries(Object.entries(counts).filter(([, count]) => Number(count) > 0).map(([value, count]) => [value, Math.trunc(Number(count))]));
}

export interface CloseSplit { float: number; reserve: number; withdrawn: number }

/**
 * Reparto propuesto del efectivo contado. Cuando no alcanza, el orden es:
 * primero el fondo para mañana, después el apartado, y el retiro con lo que sobre.
 */
export function proposeSplit(counted: number, floatTarget: number, reserveTarget: number): CloseSplit {
    const total = cents(Math.max(counted, 0));
    const float = Math.min(total, cents(floatTarget));
    const reserve = Math.min(total - float, cents(reserveTarget));
    return { float: float / 100, reserve: reserve / 100, withdrawn: (total - float - reserve) / 100 };
}

/** Lo que se retira si se elige a mano el fondo y el apartado; null si no cuadra. */
export function withdrawnFor(counted: number, float: number, reserve: number): number | null {
    const rest = cents(counted) - cents(float) - cents(reserve);
    return float < 0 || reserve < 0 || rest < 0 ? null : rest / 100;
}
