/**
 * Formato único del dinero en pantalla (pesos mexicanos, es-MX).
 *
 * Regla simple:
 *  - `{ cents: true }`  -> siempre con centavos: "$150.00". Para tablas, listas y reportes de dinero.
 *  - por omisión        -> sin centavos si el valor es entero ("$150") y con centavos si no ("$150.50").
 *                          Para tarjetas de resumen, botones y totales compactos.
 * Los valores se reciben en pesos (no en centavos). No se usa en PDF/Excel ni en el ticket impreso,
 * que tienen su propio formato.
 */
const withCents = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' });
const whole = new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function formatMoney(value: number | string | null | undefined, options: { cents?: boolean } = {}): string {
    const n = Number(value ?? 0);
    const safe = Number.isFinite(n) ? n : 0;
    // Redondeo a centavos para decidir si "es entero" (evita 149.99999999 -> "$150.00" vs "$150").
    const rounded = Math.round(safe * 100) / 100;
    if (options.cents || !Number.isInteger(rounded)) return withCents.format(rounded);
    return whole.format(rounded);
}
