import type { ProfitReport } from '@/lib/admin/profit';
import { formatMoney } from '@/lib/utils/money';

/**
 * Pasos de la cascada "Del ingreso a la utilidad" de Finanzas: Ingresos − Comisiones − Sueldos − (Bonos) −
 * Costo de productos − Gastos = Utilidad neta. Solo toma las cifras que ya calculó la API (`computeProfit`):
 * cada paso es un total del reporte y la utilidad es `profit` tal cual, sin recalcularla. Los saldos de las
 * barras (`start`/`end`) son restas para dibujar; el último paso termina exactamente en la utilidad de la API.
 * «Bonos» solo aparece si es mayor que cero.
 */
export type WaterfallKey = 'rev' | 'com' | 'wage' | 'bonus' | 'cost' | 'exp' | 'net';
export interface WaterfallRow {
    key: WaterfallKey; label: string; hint: string; amount: number; sign: '' | '−' | '='; start: number; end: number; tone: string;
}

const money = (n: number) => formatMoney(n, { cents: true });
const units = (n: number) => `${n} pieza${n === 1 ? '' : 's'}`;

export function waterfallRows(data: ProfitReport): WaterfallRow[] {
    const revenue = data.revenue.total;
    const outflows: { key: WaterfallKey; label: string; hint: string; amount: number; tone: string }[] = [
        { key: 'com', label: 'Comisiones', hint: `Servicios ${money(data.commissions.services)} · productos ${money(data.commissions.products)}.`, amount: data.commissions.total, tone: 'bg-bos-accent' },
        { key: 'wage', label: 'Sueldos', hint: `Sueldo por día de recepción: ${data.wages.days} día${data.wages.days === 1 ? '' : 's'} trabajado${data.wages.days === 1 ? '' : 's'}.`, amount: data.wages.total, tone: 'bg-bos-text' },
        ...(data.bonuses.total > 0 ? [{ key: 'bonus' as const, label: 'Bonos', hint: `${data.bonuses.count} bono${data.bonuses.count === 1 ? '' : 's'} por metas.`, amount: data.bonuses.total, tone: 'bg-bos-muted' }] : []),
        { key: 'cost', label: 'Costo de productos vendidos', hint: `${units(data.counts.productUnits)} vendidas, a su costo registrado.`, amount: data.productCost.total, tone: 'bg-bos-control' },
        { key: 'exp', label: 'Gastos', hint: 'Gastos registrados en caja (Gastos).', amount: data.expenses.total, tone: 'bg-bos-danger' },
    ];
    const rows: WaterfallRow[] = [
        { key: 'rev', label: 'Ingresos', hint: `Servicios ${money(data.revenue.services)} · productos ${money(data.revenue.products)}. Ya sin descuentos (${money(data.revenue.discounts)}).`, amount: revenue, sign: '', start: 0, end: revenue, tone: 'bg-bos-text' },
    ];
    let balance = revenue;
    outflows.forEach((o, i) => {
        const before = balance;
        balance = before - o.amount;
        // El último paso termina en la utilidad que entregó la API, no en una resta propia.
        const after = i === outflows.length - 1 ? data.profit : balance;
        rows.push({ ...o, sign: '−', start: after, end: before });
    });
    rows.push({ key: 'net', label: 'Utilidad neta', hint: 'Lo que le queda al negocio.', amount: data.profit, sign: '=', start: 0, end: Math.max(data.profit, 0), tone: data.profit < 0 ? 'bg-bos-danger' : 'bg-bos-success' });
    return rows;
}
