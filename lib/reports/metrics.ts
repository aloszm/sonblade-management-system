// Métricas del panel: tipos de lo que entrega public.business_metrics y cálculos de presentación.
import { addDays } from '@/lib/settlements/week';
import { PAYMENT_METHOD_LABELS } from '@/lib/utils/payment';

export type Kpis = {
    revenue: number; cuts: number; products: number; tickets: number; clients: number;
    tips: number; commissions: number; expenses: number; avg_ticket: number; net: number;
    /**
     * B4 (20261119210000): costo de producto vendido y qué es `net`.
     * 'profit' = utilidad (ventas − comisiones − costo de producto − gastos por incurred_at), igual que Finanzas.
     * 'contribution' = con filtro por persona: aporte (sus ventas − comisiones de esas ventas − costo de sus productos),
     * sin gastos generales. Rotularlo "Aporte", no "Utilidad". Faltan si la base es anterior.
     */
    product_cost?: number;
    net_kind?: 'profit' | 'contribution';
    units_without_cost?: number | null;
};
export type Metrics = {
    range: { from: string; to: string; days: number; timezone: string; previous_from: string; previous_to: string };
    kpis: Kpis;
    previous: Kpis;
    new_clients: number;
    daily: { day: string; revenue: number; cuts: number }[];
    hourly: { hour: number; revenue: number; cuts: number }[];
    weekday: { dow: number; revenue: number; cuts: number }[];
    barbers: { id: string; name: string; is_barber: boolean; cuts: number; revenue: number; tickets: number; tips: number; commission: number; avg_ticket: number }[];
    services: { name: string; type: 'service' | 'product'; count: number; revenue: number }[];
    payments: { cash: number; card: number; transfer: number; other: number };
    activity: { at: string; sale_id: string; type: 'service' | 'product'; item: string; quantity: number; amount: number; employee: string | null; client: string | null; methods: string | null }[];
};

export type PresetId = 'today' | 'week' | 'month' | 'last30' | 'custom';
export const PRESETS: { id: PresetId; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Semana' },
    { id: 'month', label: 'Mes' },
    { id: 'last30', label: '30 días' },
    { id: 'custom', label: 'Fechas' },
];

/**
 * Rango de días para cada atajo, a partir de "hoy" en el reloj de la barbería.
 * La semana es la del negocio: de domingo a hoy.
 */
export function presetRange(id: Exclude<PresetId, 'custom'>, today: string): { from: string; to: string } {
    if (id === 'today') return { from: today, to: today };
    if (id === 'week') {
        const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
        return { from: addDays(today, -dow), to: today };
    }
    if (id === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
    return { from: addDays(today, -29), to: today };
}

/** Variación contra el periodo anterior. null si antes no hubo nada con qué comparar. */
export function delta(current: number, previous: number): number | null {
    if (!previous) return null;
    return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/**
 * Si la comparación con el periodo anterior es confiable: ese periodo debe tener
 * al menos el 10 % de lo actual (si no, el porcentaje sale absurdo, p. ej. +1250 %).
 */
export function comparable(current: number, previous: number): boolean {
    if (!previous || previous < 0) return false;
    return Math.abs(previous) >= Math.abs(current) * 0.1;
}

/** La hora con más cortes; null si no hubo cortes. */
export function busiestHour(hourly: Metrics['hourly']): number | null {
    let best: Metrics['hourly'][number] | null = null;
    for (const h of hourly) if (h.cuts > 0 && (!best || h.cuts > best.cuts)) best = h;
    return best ? best.hour : null;
}

export const WEEKDAYS = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
export const METHOD_LABELS = PAYMENT_METHOD_LABELS;

/** Renglones del registro para descargar en CSV, con fecha y hora exactas en la zona del negocio. */
export function activityRows(activity: Metrics['activity'], timeZone: string): (string | number)[][] {
    const fmt = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
    return activity.map((a) => {
        const parts = Object.fromEntries(fmt.formatToParts(new Date(a.at)).map((p) => [p.type, p.value]));
        return [
            `${parts.year}-${parts.month}-${parts.day}`, `${parts.hour}:${parts.minute}:${parts.second}`,
            a.employee ?? '', a.type === 'service' ? 'Servicio' : 'Producto', a.item, a.quantity, a.amount,
            (a.methods ?? '').split(',').filter(Boolean).map((m) => METHOD_LABELS[m] ?? m).join(' + '), a.client ?? '',
        ];
    });
}
