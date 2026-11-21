// Textos del resumen de caja: encabezados con fecha y el mensaje en texto plano para WhatsApp. Funciones puras.
// El texto NO lleva datos de clientes ni teléfonos: solo nombres de pila del equipo y montos.
import type { DayCash, DaySummary, PersonLine } from '@/lib/cash/day-summary';
import { formatMoney } from '@/lib/utils/money';

const at = (day: string) => new Date(`${day}T12:00:00Z`);
const clean = (s: string) => s.replace(/\./g, '').replace(/,/g, '');

/** "viernes 20 de noviembre de 2026" */
export function longDayLabel(day: string): string {
    return clean(at(day).toLocaleDateString('es-MX', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }))
        .replace(/ de (\d{4})$/, ' de $1');
}

/** "vie 20 nov 2026" */
export function shortDayLabel(day: string): string {
    const parts = new Intl.DateTimeFormat('es-MX', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).formatToParts(at(day));
    const get = (t: string) => (parts.find((p) => p.type === t)?.value ?? '').replace('.', '');
    return `${get('weekday')} ${get('day')} ${get('month')} ${get('year')}`;
}

export const summaryTitle = (day: string) => `Resumen de caja · ${longDayLabel(day)}`;

export function addDay(day: string, delta: number): string {
    const d = at(day);
    d.setUTCDate(d.getUTCDate() + delta);
    return d.toISOString().slice(0, 10);
}

export const money = (cents: number) => formatMoney(cents / 100);
const count = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function personLine(p: PersonLine): string {
    const parts: string[] = [];
    if (p.serviceCount) parts.push(`${count(p.serviceCount, 'servicio', 'servicios')} ${money(p.servicesCents)}`);
    if (p.productsCents) parts.push(`productos ${money(p.productsCents)}`);
    if (p.tipsCents) parts.push(`propinas ${money(p.tipsCents)}`);
    return `· ${p.firstName}: ${parts.join(' · ')} = ${money(p.totalCents)}`;
}

function cashLines(cash: DayCash): string[] {
    if (cash.sessions.length === 0) return ['Caja: sin caja abierta este día'];
    const one = (s: DayCash['sessions'][number], prefix: string) => {
        if (s.open) return `${prefix}abierta (esperado ${money(s.expectedCents)}); el resumen puede cambiar`;
        const bits = [`esperado ${money(s.expectedCents)}`, `contado ${money(s.countedCents ?? 0)}`, `diferencia ${money(s.differenceCents ?? 0)}`];
        if (s.reserveCents) bits.push(`apartado ${money(s.reserveCents)}`);
        return `${prefix}${bits.join(' · ')}`;
    };
    if (cash.sessions.length === 1) return [one(cash.sessions[0], 'Caja: ')];
    // Muchas cajas el mismo día (pruebas o cambios de turno): un solo renglón; el detalle está en la pantalla.
    if (cash.sessions.length > 3) {
        const bits = [`${cash.sessions.length} cajas`, `diferencia ${money(cash.differenceCents)}`];
        if (cash.reserveCents) bits.push(`apartado ${money(cash.reserveCents)}`);
        return [`Cajas: ${bits.join(' · ')}${cash.anyOpen ? ' · hay una abierta, el resumen puede cambiar' : ''}`];
    }
    return cash.sessions.map((s, i) => one(s, `Caja ${i + 1}: `));
}

/** Mensaje de WhatsApp (texto plano) con el resumen del día. */
export function buildWhatsAppText(day: string, summary: DaySummary, cash: DayCash): string {
    const t = summary.totals;
    if (summary.sales.paidCount === 0) {
        const lines = [`Resumen de caja · ${shortDayLabel(day)}`, 'No hubo cobros este día.'];
        if (summary.sales.voidedCount) lines.push(`Ventas anuladas: ${summary.sales.voidedCount} (${money(summary.sales.voidedCents)})`);
        lines.push(...cashLines(cash));
        return lines.join('\n');
    }
    const lines = [
        `Resumen de caja · ${shortDayLabel(day)}`,
        `Total cobrado: ${money(t.grandTotalCents)}`,
        `· Servicios: ${money(t.servicesCents)} (${t.serviceCount}${t.cutCount ? `, ${count(t.cutCount, 'corte', 'cortes')}` : ''})`,
        `· Productos: ${money(t.productsCents)} (${t.productUnits})`,
        `· Propinas: ${money(t.tipsCents)}`,
        summary.methods.map((m) => `${m.label}: ${money(m.totalCents)}`).join(' · '),
        'Por persona:',
        ...summary.people.map(personLine),
    ];
    if (summary.sales.voidedCount) lines.push(`Ventas anuladas: ${summary.sales.voidedCount} (${money(summary.sales.voidedCents)})`);
    lines.push(...cashLines(cash));
    return lines.join('\n');
}

/** Dirección de WhatsApp para elegir contacto o grupo y enviar el texto. */
export const whatsAppUrl = (text: string) => `https://wa.me/?text=${encodeURIComponent(text)}`;

/** Nombre de archivo sin extensión: Resumen-caja-2026-11-20 */
export const summaryFileName = (day: string) => `Resumen-caja-${day}`;
