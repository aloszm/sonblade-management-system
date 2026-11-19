// Reporte completo: periodos, formatos y el "modelo" del reporte. El modelo (portada, secciones,
// tablas, gráficas) se construye una sola vez a partir del jsonb de la base y de él salen la vista
// en pantalla, el PDF y el Excel, para que los tres digan exactamente lo mismo.
import { addDays } from '@/lib/settlements/week';
import { roleLabel } from '@/lib/auth/roles';
import type { Audience, AuditEntry, CashSessionReport, FullKpis, FullReport } from './full-report-types';

// ───────────────────────── Periodos ─────────────────────────

export type ReportPresetId = 'today' | 'week' | 'month' | 'last_month' | 'custom';
export const REPORT_PRESETS: { id: ReportPresetId; label: string }[] = [
    { id: 'today', label: 'Hoy' },
    { id: 'week', label: 'Semana del negocio' },
    { id: 'month', label: 'Este mes' },
    { id: 'last_month', label: 'Mes anterior' },
    { id: 'custom', label: 'Fechas' },
];
export const MAX_REPORT_DAYS = 400;

/** Último día del mes de una fecha 'YYYY-MM-DD'. */
function monthEnd(date: string): string {
    const first = `${date.slice(0, 8)}01`;
    const next = new Date(`${first}T00:00:00Z`);
    next.setUTCMonth(next.getUTCMonth() + 1);
    return addDays(next.toISOString().slice(0, 10), -1);
}

/**
 * Rango de días de cada atajo a partir de "hoy" en el reloj de la barbería. La semana del negocio va
 * de domingo a sábado; mientras no termina, el reporte llega hasta hoy.
 */
export function reportPresetRange(id: Exclude<ReportPresetId, 'custom'>, today: string): { from: string; to: string } {
    if (id === 'today') return { from: today, to: today };
    if (id === 'week') {
        const dow = new Date(`${today}T00:00:00Z`).getUTCDay();
        return { from: addDays(today, -dow), to: today };
    }
    if (id === 'month') return { from: `${today.slice(0, 8)}01`, to: today };
    const lastOfPrevious = addDays(`${today.slice(0, 8)}01`, -1);
    return { from: `${lastOfPrevious.slice(0, 8)}01`, to: monthEnd(lastOfPrevious) };
}

/** Mensaje de error si el rango no se puede pedir; null si es válido. */
export function validateRange(from: string, to: string): string | null {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return 'Elige las dos fechas.';
    if (to < from) return 'La fecha final no puede ser anterior a la inicial.';
    const days = (Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000;
    if (days > MAX_REPORT_DAYS) return `El periodo no puede pasar de ${MAX_REPORT_DAYS} días.`;
    return null;
}

// ───────────────────────── Formatos ─────────────────────────

export const AUDIENCE_LABELS: Record<Audience, string> = {
    interno: 'Interno',
    contador: 'Contador / externo',
};
export const AUDIENCE_NOTES: Record<Audience, string> = {
    interno: 'Incluye nombres de clientes. Solo para la cuenta principal y la gerencia.',
    contador: 'Sin nombres ni teléfonos de clientes: solo totales y movimientos del negocio.',
};
export const METHOD_LABELS: Record<string, string> = { cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia', other: 'Otro' };
export const APPOINTMENT_STATUS_LABELS: Record<string, string> = {
    scheduled: 'Programada', confirmed: 'Confirmada', checked_in: 'Ya llegó', in_progress: 'En servicio',
    completed: 'Completada', cancelled: 'Cancelada', no_show: 'No llegó',
};
export const STOCK_MOVEMENT_LABELS: Record<string, string> = {
    purchase: 'Compra', sale: 'Venta', adjustment: 'Ajuste', waste: 'Merma', return_in: 'Devolución (entra)', return_out: 'Devolución (sale)', initial: 'Inventario inicial',
};
export const CASH_MOVEMENT_LABELS: Record<string, string> = { expense: 'Gasto', withdrawal: 'Retiro', deposit: 'Entrada', adjustment: 'Ajuste', refund: 'Reembolso' };

export function money(n: number | null | undefined): string {
    const value = Number(n ?? 0);
    const sign = value < 0 ? '-' : '';
    return `${sign}$${Math.abs(value).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function plainNumber(n: number | null | undefined): string {
    return Number(n ?? 0).toLocaleString('es-MX', { maximumFractionDigits: 3 });
}

/** Partes de fecha y hora de un instante en la zona horaria del negocio. */
export function zonedParts(iso: string, timeZone: string) {
    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
        timeZone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
    return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour, minute: parts.minute, second: parts.second };
}

/** "15/11/2026 11:35" (o con segundos) en la zona horaria del negocio. */
export function formatDateTime(iso: string | null | undefined, timeZone: string, seconds = false): string {
    if (!iso) return '';
    const p = zonedParts(iso, timeZone);
    return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}${seconds ? `:${p.second}` : ''}`;
}

/** "15/11/2026" a partir de 'YYYY-MM-DD'. */
export function formatDay(day: string | null | undefined): string {
    if (!day) return '';
    const [y, m, d] = day.slice(0, 10).split('-');
    return `${d}/${m}/${y}`;
}

/** "1 al 15 de noviembre de 2026" para el título y la prosa. */
export function periodLabel(from: string, to: string): string {
    const fmt = (date: string, opts: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat('es-MX', { ...opts, timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`));
    if (from === to) return fmt(from, { day: 'numeric', month: 'long', year: 'numeric' });
    const sameMonth = from.slice(0, 7) === to.slice(0, 7);
    if (sameMonth) return `${fmt(from, { day: 'numeric' })} al ${fmt(to, { day: 'numeric', month: 'long', year: 'numeric' })}`;
    return `${fmt(from, { day: 'numeric', month: 'long' })} al ${fmt(to, { day: 'numeric', month: 'long', year: 'numeric' })}`;
}

/** Variación porcentual; null si antes no hubo nada con qué comparar. */
export function percentChange(current: number, previous: number): number | null {
    if (!previous) return null;
    return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

/** "+12.5%", "-3%", "Igual" o "Sin datos para comparar" (cuando antes fue cero: no se divide entre cero). */
export function changeText(current: number, previous: number): string {
    const d = percentChange(current, previous);
    if (d === null) return current === 0 ? 'Igual' : 'Sin datos para comparar';
    if (d === 0) return 'Igual';
    return `${d > 0 ? '+' : '-'}${Math.abs(d).toLocaleString('es-MX')}%`;
}

/** "47.8%" con un decimal como máximo. */
export function percentText(value: number | null | undefined): string {
    if (value === null || value === undefined) return '—';
    return `${Number(value).toLocaleString('es-MX', { maximumFractionDigits: 1 })}%`;
}

/** Pesos por cada $100 de ingresos, a dos decimales; null si no hubo ingresos. */
export function per100(value: number, revenue: number): number | null {
    if (!revenue) return null;
    return Math.round((value / revenue) * 10000) / 100;
}

/** Fecha corta para el eje de una gráfica: "15 nov". */
export function shortDay(day: string): string {
    return new Intl.DateTimeFormat('es-MX', { day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${day}T12:00:00Z`)).replace('.', '');
}

// ───────────────────────── Modelo del reporte ─────────────────────────

/** 'percent' y 'change' llevan el porcentaje como número (12.5 = 12.5 %); 'change' se escribe con signo. */
export type ColumnType = 'text' | 'money' | 'number' | 'percent' | 'change' | 'datetime' | 'datetime_s' | 'date';
/** Columnas que se alinean a la derecha. */
export const isNumericColumn = (c: Column) => c.type === 'money' || c.type === 'number' || c.type === 'percent' || c.type === 'change';
export type Cell = string | number | null;
export type Column = { header: string; type: ColumnType };
/** Énfasis de un renglón: 'subtotal' y 'result' van en negritas (result además resaltado); 'minor' va sangrado. */
export type RowStyle = 'normal' | 'minor' | 'subtotal' | 'result';
export type ReportTable = { kind: 'table'; title?: string; columns: Column[]; rows: Cell[][]; total?: Cell[]; empty: string; styles?: RowStyle[] };
/** compact: gráfica más baja en el PDF, para que la sección quepa en una hoja. */
export type ReportBars = { kind: 'bars'; title: string; format: 'money' | 'number'; items: { label: string; value: number }[]; color: 'accent' | 'text'; compact?: boolean };
export type ReportKpis = { kind: 'kpis'; items: { label: string; value: number; previous: number; format: 'money' | 'number'; invert?: boolean; note?: string }[] };
export type ReportText = { kind: 'text'; text: string; tone?: 'note' | 'body' | 'warning' };
export type Tone = 'good' | 'bad' | 'neutral';
/** Cifras grandes: una por idea, con una frase que dice qué significa. value null = no aplica (se muestra "—"). */
export type ReportHero = { kind: 'hero'; items: { label: string; value: number | null; format: 'money' | 'percent' | 'number'; caption: string; tone: Tone }[] };
export type StackColor = 'commission' | 'cost' | 'expense' | 'profit';
/** Barra apilada "de cada $100": cada segmento en pesos por cada $100 de ingresos. */
export type ReportStack = { kind: 'stack'; title: string; segments: { label: string; value: number; color: StackColor }[]; caption: string; empty: string | null };
export type ReportBlock = ReportTable | ReportBars | ReportKpis | ReportText | ReportHero | ReportStack;
export type ReportSection = { id: string; number: number; title: string; sheet: string; explain: string; blocks: ReportBlock[] };
export type ReportControl = { folio: string; sha256: string } | null;

export type ReportModel = {
    title: string;
    businessName: string;
    branchName: string;
    period: { from: string; to: string; days: number; label: string };
    audience: Audience;
    timezone: string;
    generatedAt: string;
    generatedBy: string;
    folio: string | null;
    code: string | null;
    sections: ReportSection[];
};

/** Texto de una celda tal como se ve en pantalla y en el PDF. */
export function formatCell(column: Column, value: Cell, timeZone: string): string {
    if (value === null || value === undefined || value === '') return '';
    // Las filas de totales llevan palabras ("Total") en columnas de importe o de fecha.
    if (typeof value === 'string' && column.type !== 'text' && !(column.type === 'date' || column.type.startsWith('datetime') ? /^\d{4}-\d{2}-\d{2}/.test(value) : !Number.isNaN(Number(value)))) return value;
    switch (column.type) {
        case 'money': return money(Number(value));
        case 'number': return plainNumber(Number(value));
        case 'percent': return percentText(Number(value));
        case 'change': {
            const n = Number(value);
            return n === 0 ? 'Igual' : `${n > 0 ? '+' : '-'}${percentText(Math.abs(n))}`;
        }
        case 'datetime': return formatDateTime(String(value), timeZone);
        case 'datetime_s': return formatDateTime(String(value), timeZone, true);
        case 'date': return formatDay(String(value));
        default: return String(value);
    }
}

/** Agrupa por semana (domingo a sábado) cuando hay demasiados días para una gráfica legible. */
export function chartSeries(daily: FullReport['sales']['daily'], pick: 'revenue' | 'cuts'): { label: string; value: number }[] {
    if (daily.length <= 45) return daily.map((d) => ({ label: shortDay(d.day), value: Number(d[pick]) }));
    const weeks = new Map<string, number>();
    for (const d of daily) {
        const dow = new Date(`${d.day}T00:00:00Z`).getUTCDay();
        const start = addDays(d.day, -dow);
        weeks.set(start, (weeks.get(start) ?? 0) + Number(d[pick]));
    }
    return Array.from(weeks, ([start, value]) => ({ label: `sem. ${shortDay(start)}`, value: Math.round(value * 100) / 100 }));
}

const sum = (values: number[]) => Math.round(values.reduce((a, b) => a + b, 0) * 100) / 100;

const ACTION_LABELS: Record<string, string> = {
    sale_reversed: 'Venta anulada',
    sale_confirmed: 'Venta con descuento',
    cash_opened: 'Caja abierta',
    cash_closed: 'Caja cerrada',
    cash_movement_recorded: 'Movimiento de caja',
    cash_settings_changed: 'Cambio del fondo y apartado de caja',
    commission_defaults_changed: 'Cambio de las comisiones generales',
    commission_settlement_paid: 'Pago de comisiones',
    inventory_adjusted: 'Ajuste de inventario',
    business_profile_updated: 'Cambio de datos del negocio',
    report_exported: 'Reporte emitido',
    product_created: 'Producto creado',
    'businesses.update': 'Cambio en el negocio',
    'branches.update': 'Cambio en la sucursal',
    'branches.insert': 'Sucursal creada',
    'services.update': 'Cambio en un servicio',
    'services.insert': 'Servicio creado',
    'products.update': 'Cambio en un producto',
    'products.insert': 'Producto creado',
    'employees.update': 'Cambio en una persona del equipo',
    'employees.insert': 'Persona del equipo agregada',
    'business_memberships.update': 'Cambio de puesto o acceso',
    'business_memberships.insert': 'Acceso nuevo',
    'commission_rules.insert': 'Nueva regla de comisión',
    'commission_rules.update': 'Cambio en una regla de comisión',
};

export function auditActionLabel(action: string): string {
    return ACTION_LABELS[action] ?? action.replace(/[._]/g, ' ');
}

const FIELD_LABELS: Record<string, string> = {
    name: 'nombre', price: 'precio', sale_price: 'precio de venta', cost_price: 'costo', is_active: 'activo', display_name: 'nombre',
    role: 'puesto', percentage: 'porcentaje', service_commission_pct: 'comisión de servicios (%)', product_commission_pct: 'comisión de productos (%)',
    cash_float_target: 'fondo de caja', daily_reserve_amount: 'apartado diario', daily_reserve_label: 'concepto del apartado', settings: 'configuración',
    timezone: 'zona horaria', phone: 'teléfono', address: 'dirección', duration_minutes: 'duración (min)', can_authorize_discounts: 'autoriza descuentos', is_barber: 'es barbero',
};

function scalar(value: unknown): string {
    if (value === null || value === undefined) return 'vacío';
    if (typeof value === 'boolean') return value ? 'sí' : 'no';
    if (typeof value === 'number') return plainNumber(value);
    if (typeof value === 'object') return JSON.stringify(value);
    return String(value);
}

/** Descripción corta, en español, de lo que cambió en una entrada de la bitácora. */
export function auditDetail(entry: AuditEntry): string {
    const d = entry.details ?? {};
    const after = (d.after ?? {}) as Record<string, unknown>;
    const before = (d.before ?? {}) as Record<string, unknown>;
    let text = '';
    const has = (v: unknown) => v !== null && v !== undefined && v !== '';
    const amount = (label: string, v: unknown) => (has(v) && !Number.isNaN(Number(v)) ? `${label} ${money(Number(v))}` : '');
    const join = (parts: string[], end = '.') => { const kept = parts.filter(Boolean); return kept.length ? `${kept.join(', ')}${end}` : ''; };
    switch (entry.action) {
        case 'cash_opened':
            text = join([amount('Fondo inicial', after.opening_cash), amount('esperado', after.opening_expected)]);
            break;
        case 'cash_closed':
            text = join([amount('Esperado', after.expected_cash), amount('contado', after.counted_cash), amount('diferencia', after.difference),
                amount('fondo dejado', after.float_left), amount('apartado', after.reserve_amount), amount('retiro', after.withdrawn_amount)]);
            break;
        case 'cash_movement_recorded':
            text = `${CASH_MOVEMENT_LABELS[String(after.type)] ?? String(after.type)} de ${money(Number(after.amount))} (${METHOD_LABELS[String(after.method)] ?? String(after.method)}).`;
            break;
        case 'commission_settlement_paid': {
            const payments = Array.isArray(after.payments) ? (after.payments as { amount: number; method: string }[]) : [];
            text = join([amount('Pagado', after.paid_amount),
                payments.length ? `(${payments.map((p) => `${METHOD_LABELS[p.method] ?? p.method} ${money(p.amount)}`).join(', ')})` : '',
                Number(after.tips) ? amount('propinas', after.tips) : '', Number(after.deductions) ? amount('descuentos', after.deductions) : '',
                has(after.period_start) && has(after.period_end) ? `semana del ${formatDay(String(after.period_start))} al ${formatDay(String(after.period_end))}` : '']);
            break;
        }
        case 'inventory_adjusted':
            text = join([has(after.quantity_delta) ? `Ajuste de ${plainNumber(Number(after.quantity_delta))}` : '', has(after.quantity_after) ? `quedaron ${plainNumber(Number(after.quantity_after))}` : '', has(after.notes) ? String(after.notes) : '']);
            break;
        case 'sale_reversed':
            text = amount('Se devolvieron', after.refunded_amount) ? `${amount('Se devolvieron', after.refunded_amount)}.` : 'Venta anulada.';
            break;
        case 'sale_confirmed':
            text = `Descuento autorizado: ${scalar(after.discount_reason)}.`;
            break;
        case 'report_exported':
            text = `Folio ${scalar(after.folio)} (${scalar(after.audience)}).`;
            break;
        default: {
            if (d.changes) {
                text = Object.entries(d.changes).map(([key, c]) => `${FIELD_LABELS[key] ?? key}: ${scalar(c.from)} -> ${scalar(c.to)}`).join('; ');
            } else if (Object.keys(before).length || Object.keys(after).length) {
                const fmt = (o: Record<string, unknown>) => Object.entries(o).map(([k, v]) => `${FIELD_LABELS[k] ?? k} ${scalar(v)}`).join(', ');
                text = [Object.keys(before).length ? `Antes: ${fmt(before)}` : '', Object.keys(after).length ? `Después: ${fmt(after)}` : ''].filter(Boolean).join(' · ');
            }
        }
    }
    return text.length > 400 ? `${text.slice(0, 397)}...` : text;
}

/** Párrafo de resumen en palabras, generado con las cifras del reporte. */
export function executiveParagraph(report: FullReport): string {
    const { kpis: k, previous: p } = report.summary;
    const { from, to, days } = report.cover.period;
    const period = days === 1 ? `El ${periodLabel(from, to)}` : `Del ${periodLabel(from, to)} (${days} días)`;
    const parts: string[] = [];
    if (k.tickets === 0) {
        parts.push(`${period} no se registraron ventas cobradas.`);
    } else {
        parts.push(`${period} el negocio cobró ${money(k.revenue)} en ${k.tickets} ${k.tickets === 1 ? 'venta' : 'ventas'} (${k.cuts} ${k.cuts === 1 ? 'servicio' : 'servicios'} y ${k.products} ${k.products === 1 ? 'producto' : 'productos'}), con un ticket promedio de ${money(k.avg_ticket)}.`);
    }
    const change = percentChange(k.revenue, p.revenue);
    if (change === null) parts.push('El periodo anterior de la misma duración no tuvo ventas con qué comparar.');
    else if (change === 0) parts.push('Los ingresos fueron iguales a los del periodo anterior de la misma duración.');
    else parts.push(`Los ingresos ${change > 0 ? 'subieron' : 'bajaron'} ${Math.abs(change).toLocaleString('es-MX')}% frente al periodo anterior de la misma duración (${money(p.revenue)}).`);
    const f = report.financial?.current;
    if (f) {
        parts.push(`De eso se fueron ${money(f.commissions.total)} en comisiones, ${money(f.product_cost.total)} en el costo de los productos vendidos y ${money(f.expenses.total)} en gastos.`);
        const word = f.profit >= 0 ? 'utilidad neta' : 'pérdida';
        parts.push(`La ${word} fue de ${money(Math.abs(f.profit))}${f.profit > 0 && f.revenue.total > 0 ? `: de cada $100 que entraron le quedaron ${money(per100(f.profit, f.revenue.total))} al negocio` : ''}.`);
        parts.push(`Las propinas fueron ${money(f.tips.total)}; son de los barberos, así que no cuentan como ingreso ni se restan de la utilidad.`);
        if (f.product_cost.units_without_cost > 0) parts.push(`Ojo: ${plainNumber(f.product_cost.units_without_cost)} ${f.product_cost.units_without_cost === 1 ? 'producto vendido no tiene' : 'productos vendidos no tienen'} costo registrado, así que la utilidad real es menor.`);
    } else {
        parts.push(`Se generaron ${money(k.commissions)} en comisiones y se registraron ${money(k.expenses)} en gastos; las propinas fueron ${money(k.tips)} y no cuentan como ingreso del negocio.`);
        const profitWord = k.net >= 0 ? 'utilidad' : 'pérdida';
        parts.push(`La ${profitWord} (ingresos menos comisiones y gastos) fue de ${money(Math.abs(k.net))}; todavía no descuenta el costo de los productos.`);
    }
    const extras: string[] = [];
    if (k.discounts_count > 0) extras.push(`se otorgaron ${k.discounts_count} ${k.discounts_count === 1 ? 'descuento' : 'descuentos'} por ${money(k.discounts_total)}`);
    if (k.reversals_count > 0) extras.push(`se anularon ${k.reversals_count} ${k.reversals_count === 1 ? 'venta' : 'ventas'} por ${money(k.reversals_total)}`);
    parts.push(extras.length ? `En el periodo ${extras.join(' y ')}.` : 'En el periodo no hubo descuentos ni ventas anuladas.');
    return parts.join(' ');
}

const T = {
    text: (header: string): Column => ({ header, type: 'text' }),
    money: (header: string): Column => ({ header, type: 'money' }),
    num: (header: string): Column => ({ header, type: 'number' }),
    dt: (header: string): Column => ({ header, type: 'datetime' }),
    dts: (header: string): Column => ({ header, type: 'datetime_s' }),
    day: (header: string): Column => ({ header, type: 'date' }),
    pct: (header: string): Column => ({ header, type: 'percent' }),
    chg: (header: string): Column => ({ header, type: 'change' }),
};

function kpiItems(k: FullKpis, p: FullKpis, financial?: FullReport['financial']): ReportKpis['items'] {
    if (financial) {
        // Con el resultado financiero, comisiones, gastos, propinas y utilidad salen de él para que el
        // resumen diga exactamente lo mismo que la sección "Resultado del periodo".
        const c = financial.current, q = financial.previous;
        return [
            { label: 'Ingresos', value: k.revenue, previous: p.revenue, format: 'money' },
            { label: 'Utilidad neta', value: c.profit, previous: q.profit, format: 'money', note: 'Ingresos − comisiones − costo de producto − gastos.' },
            { label: 'Cortes y servicios', value: k.cuts, previous: p.cuts, format: 'number' },
            { label: 'Ventas', value: k.tickets, previous: p.tickets, format: 'number' },
            { label: 'Ticket promedio', value: k.avg_ticket, previous: p.avg_ticket, format: 'money' },
            { label: 'Comisiones', value: c.commissions.total, previous: q.commissions.total, format: 'money', invert: true },
            { label: 'Costo de producto', value: c.product_cost.total, previous: q.product_cost.total, format: 'money', invert: true },
            { label: 'Gastos', value: c.expenses.total, previous: q.expenses.total, format: 'money', invert: true },
            { label: 'Propinas', value: c.tips.total, previous: q.tips.total, format: 'money', note: 'Son de los barberos: no son ingreso del negocio.' },
            { label: 'Descuentos', value: k.discounts_total, previous: p.discounts_total, format: 'money', invert: true },
            { label: 'Ventas anuladas', value: k.reversals_total, previous: p.reversals_total, format: 'money', invert: true },
        ];
    }
    return [
        { label: 'Ingresos', value: k.revenue, previous: p.revenue, format: 'money' },
        { label: 'Cortes y servicios', value: k.cuts, previous: p.cuts, format: 'number' },
        { label: 'Ventas', value: k.tickets, previous: p.tickets, format: 'number' },
        { label: 'Ticket promedio', value: k.avg_ticket, previous: p.avg_ticket, format: 'money' },
        { label: 'Propinas', value: k.tips, previous: p.tips, format: 'money', note: 'No son ingreso del negocio.' },
        { label: 'Comisiones', value: k.commissions, previous: p.commissions, format: 'money', invert: true },
        { label: 'Gastos', value: k.expenses, previous: p.expenses, format: 'money', invert: true },
        { label: 'Utilidad', value: k.net, previous: p.net, format: 'money', note: 'Ingresos − comisiones − gastos. Aún no descuenta el costo de los productos.' },
        { label: 'Descuentos', value: k.discounts_total, previous: p.discounts_total, format: 'money', invert: true },
        { label: 'Ventas anuladas', value: k.reversals_total, previous: p.reversals_total, format: 'money', invert: true },
    ];
}

type AddSection = (id: string, title: string, sheet: string, explain: string, blocks: ReportBlock[]) => void;
type Financial = NonNullable<FullReport['financial']>;

const METHODS = ['cash', 'card', 'transfer', 'other'] as const;
/** Redondea a centavos y nunca deja "-0". */
const round2 = (n: number) => Math.round(n * 100) / 100 || 0;
const neg = (n: number) => round2(-n);

/** Una línea del estado de resultados: este periodo, el anterior, la diferencia, el cambio y "de cada $100". */
function statementRow(label: string, current: number, previous: number, revenue: number, sign: 1 | -1): Cell[] {
    // Lo que se resta se muestra en negativo; el cambio en % es del monto (así "+20%" en gastos = gastaron más).
    const cur = round2(sign * current), prev = round2(sign * previous);
    const change = percentChange(Math.abs(current), Math.abs(previous));
    return [label, cur, prev, round2(cur - prev), change ?? (current === 0 ? 0 : 'Sin datos para comparar'), per100(cur, revenue)];
}

/** Resultado del periodo, propinas, lo que deja cada persona y balance de efectivo. */
function addFinancialSections(report: FullReport, fin: Financial, add: AddSection) {
    const c = fin.current, p = fin.previous;
    const revenue = c.revenue.total;
    const prevLabel = `${formatDay(report.cover.period.previous_from)} al ${formatDay(report.cover.period.previous_to)}`;
    const missing = c.product_cost.missing;
    const people = (c.by_person ?? []);

    // ── Resultado del periodo ──
    const profitDiff = round2(c.profit - p.profit);
    const previousEmpty = p.revenue.total === 0 && p.profit === 0;
    const pct = percentChange(c.profit, p.profit);
    const comparedCaption = pct === null
        ? (previousEmpty ? `El periodo anterior (${prevLabel}) no tuvo movimientos con qué comparar.` : `Frente a ${money(p.profit)} del periodo anterior (${prevLabel}).`)
        : `${pct > 0 ? 'Más' : pct < 0 ? 'Menos' : 'Igual'} que el periodo anterior (${prevLabel}, ${money(p.profit)})${pct ? `: ${changeText(c.profit, p.profit)}` : ''}.`;
    const hero: ReportHero = {
        kind: 'hero', items: [
            {
                label: c.profit >= 0 ? 'Utilidad neta' : 'Pérdida del periodo', value: c.profit, format: 'money', tone: c.profit > 0 ? 'good' : c.profit < 0 ? 'bad' : 'neutral',
                caption: revenue === 0 && c.profit === 0 ? 'No hubo ingresos ni gastos en el periodo.' : 'Lo que le quedó al negocio después de pagar comisiones, mercancía y gastos.',
            },
            {
                label: 'Margen', value: c.margin_pct, format: 'percent', tone: c.margin_pct === null ? 'neutral' : c.margin_pct > 0 ? 'good' : c.margin_pct < 0 ? 'bad' : 'neutral',
                caption: c.margin_pct === null || !revenue ? 'Sin ingresos en el periodo: no hay margen que calcular.' : `De cada $100 que entraron, ${c.profit >= 0 ? `${money(per100(c.profit, revenue))} fueron ganancia` : `se perdieron ${money(Math.abs(per100(c.profit, revenue) ?? 0))}`}.`,
            },
            {
                label: 'Contra el periodo anterior', value: profitDiff, format: 'money', tone: previousEmpty || profitDiff === 0 ? 'neutral' : profitDiff > 0 ? 'good' : 'bad',
                caption: comparedCaption,
            },
        ],
    };

    const categories = [...new Set([...c.expenses.by_category.map((x) => x.category), ...p.expenses.by_category.map((x) => x.category)])];
    const catTotal = (period: typeof c, category: string) => period.expenses.by_category.find((x) => x.category === category)?.total ?? 0;
    const rows: Cell[][] = [];
    const styles: RowStyle[] = [];
    const push = (row: Cell[], style: RowStyle) => { rows.push(row); styles.push(style); };
    push(statementRow('Ingresos por servicios', c.revenue.services, p.revenue.services, revenue, 1), 'minor');
    push(statementRow('Ingresos por productos', c.revenue.products, p.revenue.products, revenue, 1), 'minor');
    push(statementRow('Total de ingresos', c.revenue.total, p.revenue.total, revenue, 1), 'subtotal');
    push(statementRow('Menos comisiones por servicios', c.commissions.services, p.commissions.services, revenue, -1), 'minor');
    push(statementRow('Menos comisiones por productos', c.commissions.products, p.commissions.products, revenue, -1), 'minor');
    push(statementRow('Menos costo de los productos vendidos', c.product_cost.total, p.product_cost.total, revenue, -1), 'minor');
    const beforeExp = (x: typeof c) => x.revenue.total - x.commissions.total - x.product_cost.total;
    push(statementRow('Queda antes de gastos', beforeExp(c), beforeExp(p), revenue, 1), 'subtotal');
    if (categories.length === 0) push(statementRow('Menos gastos', 0, 0, revenue, -1), 'minor');
    for (const category of categories) push(statementRow(`Menos gastos: ${category}`, catTotal(c, category), catTotal(p, category), revenue, -1), 'minor');
    push(statementRow(c.profit >= 0 ? 'Utilidad neta' : 'Pérdida neta', c.profit, p.profit, revenue, 1), 'result');

    const stackSegments: ReportStack['segments'] = [
        { label: 'Comisiones', value: per100(c.commissions.total, revenue) ?? 0, color: 'commission' },
        { label: 'Costo de producto', value: per100(c.product_cost.total, revenue) ?? 0, color: 'cost' },
        { label: 'Gastos', value: per100(c.expenses.total, revenue) ?? 0, color: 'expense' },
    ];
    if (c.profit > 0) stackSegments.push({ label: 'Utilidad', value: per100(c.profit, revenue) ?? 0, color: 'profit' });
    const outFor100 = round2(stackSegments.filter((s) => s.color !== 'profit').reduce((a, s) => a + s.value, 0));

    const resultBlocks: ReportBlock[] = [hero];
    if (missing.length > 0) {
        resultBlocks.push({
            kind: 'text', tone: 'warning',
            text: `Atención: ${plainNumber(c.product_cost.units_without_cost)} ${c.product_cost.units_without_cost === 1 ? 'unidad vendida no tiene' : 'unidades vendidas no tienen'} costo registrado (${missing.map((m) => `${m.name}: ${plainNumber(m.units)}`).join(', ')}). Su costo no se restó, así que la utilidad real es menor que la que aparece aquí. Registra el costo en Productos.`,
        });
    }
    resultBlocks.push(
        {
            kind: 'table', title: 'Estado de resultados', styles, rows, empty: '',
            columns: [T.text('Concepto'), T.money('Este periodo'), T.money('Periodo anterior'), T.money('Diferencia'), T.chg('Cambio'), T.money('De cada $100')],
        },
        {
            kind: 'stack', title: 'De cada $100 que entraron, a dónde se fueron', segments: stackSegments,
            empty: revenue === 0 ? 'Sin ingresos en el periodo: no hay nada que repartir.' : null,
            caption: revenue === 0 ? '' : c.profit > 0
                ? `De cada $100 cobrados, ${money(outFor100)} se fueron en comisiones, mercancía y gastos, y ${money(per100(c.profit, revenue))} le quedaron al negocio.`
                : `De cada $100 cobrados se fueron ${money(outFor100)} en comisiones, mercancía y gastos: el negocio perdió ${money(Math.abs(per100(c.profit, revenue) ?? 0))} por cada $100.`,
        },
        {
            kind: 'text', tone: 'note',
            text: `Ingresos: lo cobrado ya con descuentos, sin ventas anuladas${c.counts.voided_excluded ? ` (${c.counts.voided_excluded} ${c.counts.voided_excluded === 1 ? 'excluida' : 'excluidas'})` : ''}. Costo de producto: ${c.product_cost.source === 'sale' ? 'el costo que tenía cada producto al momento de venderse' : 'el costo que hoy tiene cada producto en el catálogo'}. Gastos: por la fecha del gasto. Las propinas van aparte porque son de los barberos. Lo que se resta va en negativo; en "Cambio", un + en esos renglones quiere decir que ese costo creció.`,
        },
    );
    add('resultado', 'Resultado del periodo', 'Resultado',
        'Cuánto entró, cuánto se fue en comisiones, mercancía y gastos, y cuánto le quedó al negocio.', resultBlocks);

    // ── Propinas ──
    const withTips = people.filter((b) => b.tips > 0);
    const tipMethods = METHODS.filter((m) => c.tips.by_method[m] > 0);
    add('propinas', 'Propinas', 'Propinas',
        'Las propinas son del barbero: el negocio las cobra y se las entrega completas en su recibo semanal, así que no suman a los ingresos ni se restan de la utilidad. Si una venta se anula, su propina también.', [
            {
                kind: 'hero', items: [
                    { label: 'Propinas del periodo', value: c.tips.total, format: 'money', tone: 'neutral', caption: `${c.tips.count} ${c.tips.count === 1 ? 'propina' : 'propinas'}. Son del barbero; no forman parte de la utilidad.` },
                    { label: 'Contra el periodo anterior', value: round2(c.tips.total - p.tips.total), format: 'money', tone: 'neutral', caption: p.tips.total ? `Antes: ${money(p.tips.total)} (${changeText(c.tips.total, p.tips.total)}).` : 'El periodo anterior no tuvo propinas con qué comparar.' },
                ],
            },
            { kind: 'bars', title: 'Propinas por persona', format: 'money', color: 'accent', compact: true, items: withTips.map((b) => ({ label: b.name, value: b.tips })) },
            { kind: 'bars', title: 'Propinas por forma de pago', format: 'money', color: 'text', compact: true, items: METHODS.map((m) => ({ label: METHOD_LABELS[m], value: c.tips.by_method[m] })) },
            {
                kind: 'table', title: 'Por persona', empty: 'No hubo propinas en el periodo.',
                columns: [T.text('Persona'), T.money('Propinas'), T.num('Cuántas'), T.pct('% del total')],
                rows: withTips.map((b) => [b.name, b.tips, b.tip_count, per100(b.tips, c.tips.total)]),
                total: withTips.length ? ['Total', c.tips.total, c.tips.count, 100] : undefined,
            },
            {
                kind: 'table', title: 'Por forma de pago', empty: 'No hubo propinas en el periodo.',
                columns: [T.text('Forma de pago'), T.money('Propinas'), T.pct('% del total')],
                rows: tipMethods.map((m) => [METHOD_LABELS[m], c.tips.by_method[m], per100(c.tips.by_method[m], c.tips.total)]),
                total: tipMethods.length ? ['Total', c.tips.total, 100] : undefined,
            },
        ]);

    // ── Lo que deja cada persona ──
    const sold = people.filter((b) => b.revenue > 0 || b.commission > 0 || b.tips > 0);
    const sumOf = (pick: (b: typeof people[number]) => number) => round2(sold.reduce((a, b) => a + pick(b), 0));
    const contributions = sumOf((b) => b.contribution);
    const commissionDiffers = sold.some((b) => round2(b.commission) !== round2(b.sales_commissions));
    const personBlocks: ReportBlock[] = [
        { kind: 'bars', title: 'Lo que deja al negocio cada persona', format: 'money', color: 'text', compact: true, items: sold.filter((b) => b.revenue > 0).map((b) => ({ label: b.name, value: b.contribution })) },
        { kind: 'bars', title: 'Lo que ganó cada persona (comisión + propinas)', format: 'money', color: 'accent', compact: true, items: sold.map((b) => ({ label: b.name, value: round2(b.commission + b.tips) })) },
        {
            kind: 'table', title: 'Por persona', empty: 'Nadie vendió en el periodo.',
            columns: [T.text('Persona'), T.money('Servicios'), T.money('Productos'), T.money('Total vendido'), T.money('Comisión ganada'), T.money('Propinas'), T.money('Costo de producto'), T.money('Deja al negocio')],
            rows: sold.map((b) => [b.name, b.services, b.products, b.revenue, b.commission, b.tips, b.product_cost, b.contribution]),
            total: sold.length ? ['Total', sumOf((b) => b.services), sumOf((b) => b.products), sumOf((b) => b.revenue), sumOf((b) => b.commission), sumOf((b) => b.tips), sumOf((b) => b.product_cost), contributions] : undefined,
        },
        {
            kind: 'text', tone: 'body',
            text: sold.length
                ? `Entre todos dejaron ${money(contributions)}; menos ${money(c.expenses.total)} de gastos, queda la ${c.profit >= 0 ? 'utilidad neta' : 'pérdida'} de ${money(Math.abs(c.profit))}.`
                : 'Sin ventas en el periodo.',
        },
        {
            kind: 'text', tone: 'note',
            text: `"Deja al negocio" = lo que vendió esa persona − las comisiones de esas ventas − el costo de los productos que vendió; todavía no resta gastos. Recepción gana 20 % de los productos que vende. Las propinas son de cada persona y no cuentan en lo que deja.${commissionDiffers ? ' En algún renglón la comisión fue para alguien distinto de quien registró la venta, por eso "Comisión ganada" no siempre cuadra fila por fila.' : ''}`,
        },
    ];
    add('personas', 'Lo que deja cada persona', 'Por persona',
        'Cuánto vendió cada quien, cuánto ganó en comisiones y propinas, y cuánto le dejó al negocio.', personBlocks);

    // ── Balance de efectivo ──
    const pay = report.sales.payments;
    const settlements = report.payouts.settlements;
    const payouts: Record<(typeof METHODS)[number], number> = {
        cash: round2(settlements.reduce((a, s) => a + s.cash, 0)), card: 0,
        transfer: round2(settlements.reduce((a, s) => a + s.transfer, 0)), other: round2(settlements.reduce((a, s) => a + s.other, 0)),
    };
    const flow = METHODS.map((m) => {
        const left = round2(pay[m] + c.tips.by_method[m] - c.expenses.by_method[m] - payouts[m]);
        return { m, sales: pay[m], tips: c.tips.by_method[m], expenses: c.expenses.by_method[m], payouts: payouts[m], left };
    });
    const tot = (pick: (f: typeof flow[number]) => number) => round2(flow.reduce((a, f) => a + pick(f), 0));
    const inTotal = round2(tot((f) => f.sales) + tot((f) => f.tips));
    const outTotal = round2(tot((f) => f.expenses) + tot((f) => f.payouts));
    const leftTotal = tot((f) => f.left);
    const salesIn = tot((f) => f.sales);
    const payoutTotal = tot((f) => f.payouts);
    const recon: Cell[][] = [
        [c.profit >= 0 ? 'Utilidad neta (sección "Resultado del periodo")' : 'Pérdida neta (sección "Resultado del periodo")', c.profit],
        ['Más comisiones ganadas en el periodo (se restaron en la utilidad, pero se pagan en el recibo)', c.commissions.total],
        ['Más propinas cobradas (son de los barberos; se pagan en el recibo)', c.tips.total],
        ['Menos pagos al equipo hechos en el periodo', neg(payoutTotal)],
        ['Más costo de los productos vendidos (la mercancía se pagó cuando se compró)', c.product_cost.total],
    ];
    const reconStyles: RowStyle[] = ['subtotal', 'minor', 'minor', 'minor', 'minor'];
    const gap = round2(salesIn - revenue);
    if (gap !== 0) { recon.push(['Diferencia entre lo cobrado y lo vendido en el periodo', gap]); reconStyles.push('minor'); }
    recon.push(['Igual a lo que quedó en el periodo', leftTotal]);
    reconStyles.push('result');

    const sessions = report.cash.sessions;
    const sumS = (pick: (s: CashSessionReport) => number | null) => round2(sessions.reduce((a, s) => a + Number(pick(s) ?? 0), 0));
    const moved: Cell[][] = [
        ['Retiros de efectivo durante el turno (al banco, a la caja fuerte o a la gerencia)', sumS((s) => s.withdrawals)],
        ['Efectivo retirado al cerrar la caja', sumS((s) => s.withdrawn_amount)],
        [`Efectivo apartado al cerrar${report.cash.reserve_label ? ` (${report.cash.reserve_label})` : ''}`, sumS((s) => s.reserve_amount)],
        ['Entradas de efectivo que no son ventas', sumS((s) => s.deposits)],
        ['Faltantes (-) o sobrantes (+) al contar la caja', sumS((s) => s.difference)],
    ];

    add('balance', 'Balance de efectivo', 'Balance',
        'Qué dinero entró, qué salió y qué quedó en el periodo, por forma de pago. Es un balance de entradas y salidas: no incluye bienes, deudas ni el dinero que ya había antes del periodo.', [
            {
                kind: 'hero', items: [
                    { label: 'Entró', value: inTotal, format: 'money', tone: 'neutral', caption: `Cobros de ventas (${money(salesIn)}) más propinas (${money(c.tips.total)}).` },
                    { label: 'Salió', value: outTotal, format: 'money', tone: 'neutral', caption: `Gastos (${money(c.expenses.total)}) y pagos al equipo (${money(payoutTotal)}).` },
                    { label: 'Quedó', value: leftTotal, format: 'money', tone: leftTotal > 0 ? 'good' : leftTotal < 0 ? 'bad' : 'neutral', caption: 'Lo que entró menos lo que salió. Incluye comisiones y propinas que todavía no se pagan.' },
                ],
            },
            {
                kind: 'table', title: 'Entradas y salidas por forma de pago', empty: '',
                columns: [T.text('Forma de pago'), T.money('Cobros de ventas'), T.money('Propinas cobradas'), T.money('Gastos pagados'), T.money('Pagos al equipo'), T.money('Quedó')],
                rows: flow.filter((f) => f.m !== 'other' || f.sales || f.tips || f.expenses || f.payouts).map((f) => [METHOD_LABELS[f.m], f.sales, f.tips, neg(f.expenses), neg(f.payouts), f.left]),
                total: ['Total', salesIn, tot((f) => f.tips), neg(tot((f) => f.expenses)), neg(payoutTotal), leftTotal],
            },
            {
                kind: 'table', title: 'Cómo cuadra con la utilidad', empty: '', styles: reconStyles,
                columns: [T.text('Concepto'), T.money('Monto')], rows: recon,
            },
            {
                kind: 'table', title: 'Efectivo que cambió de lugar (no es gasto)', empty: '',
                columns: [T.text('Concepto'), T.money('Monto')], rows: moved,
            },
            {
                kind: 'text', tone: 'note',
                text: 'Tarjeta y transferencia llegan a la cuenta del banco; el efectivo, a la caja. "Pagos al equipo" son los recibos pagados en el periodo y pueden incluir semanas anteriores. Las compras de mercancía solo aparecen como salida si se registraron como gasto. Los retiros y apartados mueven el efectivo de lugar, no son gasto: el detalle turno por turno está en la sección "Caja".',
            },
        ]);
}

/** Arma el modelo completo del reporte. `control` trae el folio y el código una vez emitido. */
export function buildReportModel(report: FullReport, control: ReportControl = null): ReportModel {
    const tz = report.cover.timezone;
    const internal = report.audience === 'interno';
    const { from, to, days } = report.cover.period;
    const k = report.summary.kpis;
    const folio = control?.folio ?? report.cover.folio ?? null;
    const code = control?.sha256 ?? null;
    const sections: ReportSection[] = [];
    const add = (id: string, title: string, sheet: string, explain: string, blocks: ReportBlock[]) =>
        sections.push({ id, number: sections.length + 1, title, sheet, explain, blocks });

    // 1. Portada y control
    add('portada', 'Portada y control', 'Portada',
        'Quién generó este reporte, cuándo y con qué folio y código se puede comprobar que es auténtico.', [
            {
                kind: 'table', columns: [T.text('Dato'), T.text('Valor')], empty: '',
                rows: [
                    ['Negocio', report.cover.business.name],
                    ['Sucursal', report.cover.branch.name],
                    ['Periodo', `${periodLabel(from, to)} (${formatDay(from)} al ${formatDay(to)}, ${days} ${days === 1 ? 'día' : 'días'})`],
                    ['Audiencia', `${AUDIENCE_LABELS[report.audience]}. ${AUDIENCE_NOTES[report.audience]}`],
                    ['Generado por', `${report.cover.generated_by.name}${report.cover.generated_by.role ? ` (${roleLabel(report.cover.generated_by.role)})` : ''}`],
                    ['Fecha y hora de generación', `${formatDateTime(report.cover.generated_at, tz, true)} (${tz})`],
                    ['Folio', folio ?? 'Se asigna al descargar el archivo'],
                    ['Código de verificación', code ?? 'Se asigna al descargar el archivo'],
                ],
            },
            { kind: 'text', tone: 'note', text: 'Para comprobar este reporte, entra a Reportes > Verificar, escribe el folio y el código (basta con los primeros 16 caracteres). El sistema confirma el periodo, la audiencia y quién lo generó.' },
            { kind: 'text', tone: 'note', text: 'Todas las fechas y horas están en la zona horaria del negocio. Los registros son de solo agregar: nada se borra, las ventas se anulan y los cambios quedan en la bitácora.' },
        ]);

    // 2. Resumen ejecutivo
    add('resumen', 'Resumen ejecutivo', 'Resumen',
        'Las cifras principales del periodo comparadas con el periodo anterior de la misma duración.', [
            { kind: 'text', tone: 'body', text: executiveParagraph(report) },
            { kind: 'kpis', items: kpiItems(k, report.summary.previous, report.financial) },
            {
                kind: 'text', tone: 'note', text: report.financial
                    ? `Comparado con ${formatDay(report.cover.period.previous_from)} al ${formatDay(report.cover.period.previous_to)}. El desglose de la utilidad está en la sección siguiente; no incluye gastos fijos que no se hayan registrado.`
                    : `Comparado con ${formatDay(report.cover.period.previous_from)} al ${formatDay(report.cover.period.previous_to)}. La utilidad = ingresos − comisiones − gastos; todavía no incluye el costo de los productos ni gastos fijos que no se hayan registrado.`,
            },
        ]);

    // 3 a 6. Resultado financiero (solo en reportes que ya lo traen).
    if (report.financial) addFinancialSections(report, report.financial, add);

    // 3. Ventas
    const pay = report.sales.payments;
    const payTotal = pay.cash + pay.card + pay.transfer + pay.other;
    add('ventas', 'Ventas', 'Ventas',
        'Cuánto se vendió, cómo pagaron, quién lo vendió y qué se vendió; con cada descuento y cada venta anulada.', [
            { kind: 'bars', title: report.cover.period.days > 45 ? 'Ingresos por semana' : 'Ingresos por día', format: 'money', color: 'text', items: chartSeries(report.sales.daily, 'revenue') },
            { kind: 'bars', title: report.cover.period.days > 45 ? 'Cortes por semana' : 'Cortes por día', format: 'number', color: 'accent', items: chartSeries(report.sales.daily, 'cuts') },
            {
                kind: 'table', title: 'Ventas por día', columns: [T.day('Día'), T.num('Ventas'), T.num('Cortes'), T.money('Ingresos')], empty: 'Sin ventas en el periodo.',
                rows: report.sales.daily.map((d) => [d.day, d.tickets, d.cuts, d.revenue]),
                total: ['Total', sum(report.sales.daily.map((d) => d.tickets)), sum(report.sales.daily.map((d) => d.cuts)), sum(report.sales.daily.map((d) => d.revenue))],
            },
            { kind: 'bars', title: 'Cómo pagaron', format: 'money', color: 'accent', items: (['cash', 'card', 'transfer', 'other'] as const).map((m) => ({ label: METHOD_LABELS[m], value: pay[m] })) },
            {
                kind: 'table', title: 'Por forma de pago', columns: [T.text('Forma de pago'), T.money('Monto'), T.text('% del total')], empty: 'Sin pagos en el periodo.',
                rows: payTotal === 0 ? [] : (['cash', 'card', 'transfer', 'other'] as const).filter((m) => pay[m] > 0).map((m) => [METHOD_LABELS[m], pay[m], `${Math.round((pay[m] / payTotal) * 1000) / 10}%`]),
                total: payTotal === 0 ? undefined : ['Total', payTotal, '100%'],
            },
            {
                kind: 'table', title: 'Por persona', empty: 'Sin ventas en el periodo.',
                columns: [T.text('Persona'), T.num('Cortes'), T.num('Productos'), T.num('Ventas'), T.money('Ingresos')],
                rows: report.sales.by_person.filter((b) => b.cuts > 0 || b.products > 0 || b.revenue > 0).map((b) => [b.name, b.cuts, b.products, b.tickets, b.revenue]),
            },
            {
                kind: 'table', title: 'Por servicio y producto', empty: 'Sin ventas en el periodo.',
                columns: [T.text('Concepto'), T.text('Tipo'), T.num('Cantidad'), T.money('Ingresos')],
                rows: report.sales.by_item.map((s) => [s.name, s.type === 'service' ? 'Servicio' : 'Producto', s.count, s.revenue]),
                total: report.sales.by_item.length ? ['Total', '', sum(report.sales.by_item.map((s) => s.count)), sum(report.sales.by_item.map((s) => s.revenue))] : undefined,
            },
            {
                kind: 'table', title: 'Descuentos', empty: 'No se otorgaron descuentos en el periodo.',
                columns: [T.dt('Fecha y hora'), T.text('Venta'), T.money('Subtotal'), T.money('Descuento'), T.money('Total cobrado'), T.text('Motivo'), T.text('Autorizó'), T.text('Cobró'), T.text('Estado')],
                rows: report.sales.discounts.map((d) => [d.at, d.sale, d.subtotal, d.discount, d.total, d.reason, d.authorized_by, d.sold_by, d.status === 'paid' ? 'Vigente' : 'Anulada']),
                total: report.sales.discounts.length ? ['Total', '', '', sum(report.sales.discounts.map((d) => d.discount)), '', '', '', '', ''] : undefined,
            },
            {
                kind: 'table', title: 'Ventas anuladas', empty: 'No se anuló ninguna venta en el periodo.',
                columns: [T.dt('Anulada el'), T.text('Venta'), T.dt('Vendida el'), T.money('Monto'), T.text('Motivo'), T.text('Anuló'), T.text('Cobró')],
                rows: report.sales.reversals.map((r) => [r.at, r.sale, r.sold_at, r.amount, r.reason, r.reversed_by, r.sold_by]),
                total: report.sales.reversals.length ? ['Total', '', '', sum(report.sales.reversals.map((r) => r.amount)), '', '', ''] : undefined,
            },
        ]);

    // 4. Caja turno por turno
    const sessions = report.cash.sessions;
    const label = (s: CashSessionReport, i: number) => `T${i + 1} · ${formatDateTime(s.opened_at, tz)}`;
    const breakdownRows: Cell[][] = [];
    sessions.forEach((s, i) => {
        if (!s.counted_breakdown) return;
        Object.entries(s.counted_breakdown).map(([v, c]) => [Number(v), Number(c)] as const).sort((a, b) => b[0] - a[0])
            .forEach(([value, count]) => breakdownRows.push([label(s, i), money(value), count, Math.round(value * count * 100) / 100]));
    });
    const manualRows: Cell[][] = [];
    sessions.forEach((s, i) => s.movements.forEach((m) => manualRows.push([label(s, i), m.at, CASH_MOVEMENT_LABELS[m.type] ?? m.type, m.description, METHOD_LABELS[m.method] ?? m.method, m.amount, m.by])));
    add('caja', 'Caja turno por turno', 'Caja',
        'Cada turno de caja: quién abrió y con cuánto, lo que entró y salió, el conteo del cierre y a dónde fue el efectivo.', [
            {
                kind: 'table', title: 'Apertura y movimientos del turno', empty: 'No hubo turnos de caja en el periodo.',
                columns: [T.text('Turno'), T.text('Abrió'), T.money('Fondo inicial'), T.money('Ventas cobradas'), T.money('Gastos'), T.money('Retiros'), T.money('Pago de comisiones'), T.money('Entradas'), T.money('Reembolsos')],
                rows: sessions.map((s, i) => [label(s, i), s.opened_by, s.opening_cash, s.sales, s.expenses, s.withdrawals, s.commission_payouts, s.deposits, s.refunds]),
            },
            {
                kind: 'table', title: 'Cierre y reparto del efectivo', empty: 'No hubo turnos de caja en el periodo.',
                columns: [T.text('Turno'), T.money('Esperado'), T.money('Contado'), T.money('Diferencia'), T.money('Fondo dejado'), T.money('Apartado'), T.text('Apartado para'), T.money('Retiro'), T.text('Cerró'), T.dt('Cierre')],
                rows: sessions.map((s, i) => [label(s, i), s.expected_cash, s.counted_cash, s.difference, s.float_left, s.reserve_amount, s.reserve_amount === null ? null : s.reserve_label, s.withdrawn_amount, s.status === 'open' ? 'Sigue abierta' : s.closed_by, s.closed_at]),
            },
            {
                kind: 'table', title: 'Conteo por billetes y monedas', empty: 'Ningún cierre del periodo guardó el conteo por billetes y monedas.',
                columns: [T.text('Turno'), T.text('Denominación'), T.num('Cantidad'), T.money('Importe')], rows: breakdownRows,
            },
            {
                kind: 'table', title: 'Gastos, retiros y entradas de efectivo', empty: 'No hubo gastos, retiros ni entradas de efectivo.',
                columns: [T.text('Turno'), T.dt('Fecha y hora'), T.text('Tipo'), T.text('Concepto'), T.text('Método'), T.money('Monto'), T.text('Quién')], rows: manualRows,
            },
            { kind: 'text', tone: 'note', text: '"Ventas cobradas" suma lo cobrado en todas las formas de pago. Un retiro mueve el dinero de lugar (banco, caja fuerte, gerencia) y no es gasto; el pago de comisiones en efectivo también sale de la caja como retiro.' },
        ]);

    // 5. Gastos
    const posted = report.expenses.filter((x) => x.status === 'posted');
    add('gastos', 'Gastos', 'Gastos',
        'Todo lo que el negocio pagó en el periodo, con quién lo registró. Los gastos bajan la utilidad.', [
            {
                kind: 'table', empty: 'No se registraron gastos en el periodo.',
                columns: [T.dt('Fecha y hora'), T.text('Categoría'), T.text('Concepto'), T.money('Monto'), T.text('Método'), T.text('Estado'), T.text('Quién')],
                rows: report.expenses.map((x) => [x.at, x.category, x.concept, x.amount, METHOD_LABELS[x.method] ?? x.method, x.status === 'posted' ? 'Registrado' : 'Cancelado', x.by]),
                total: report.expenses.length ? ['Total registrado', '', '', sum(posted.map((x) => x.amount)), '', '', ''] : undefined,
            },
        ]);

    // 6. Comisiones, propinas y pagos
    add('comisiones', 'Comisiones, propinas y pagos', 'Comisiones',
        'Lo que ganó cada persona en comisiones y propinas, los recibos de pago emitidos y los ajustes.', [
            {
                kind: 'table', title: 'Por persona', empty: 'Sin comisiones ni propinas en el periodo.',
                columns: [T.text('Persona'), T.money('Ingresos generados'), T.money('Comisión'), T.money('Propinas')],
                rows: report.sales.by_person.filter((b) => b.commission > 0 || b.tips > 0 || b.revenue > 0).map((b) => [b.name, b.revenue, b.commission, b.tips]),
                total: report.sales.by_person.length ? ['Total', sum(report.sales.by_person.map((b) => b.revenue)), sum(report.sales.by_person.map((b) => b.commission)), sum(report.sales.by_person.map((b) => b.tips))] : undefined,
            },
            {
                kind: 'table', title: 'Recibos de pago emitidos en el periodo', empty: 'No se emitieron recibos de pago en el periodo.',
                columns: [T.text('Recibo'), T.text('Persona'), T.day('Semana del'), T.day('al'), T.money('Total'), T.money('Efectivo'), T.money('Transferencia'), T.dt('Pagado el'), T.text('Pagó')],
                rows: report.payouts.settlements.map((s) => [s.receipt, s.employee, s.period_start, s.period_end, s.total, s.cash, s.transfer + s.other, s.paid_at, s.paid_by]),
                total: report.payouts.settlements.length ? ['Total', '', '', '', sum(report.payouts.settlements.map((s) => s.total)), sum(report.payouts.settlements.map((s) => s.cash)), sum(report.payouts.settlements.map((s) => s.transfer + s.other)), '', ''] : undefined,
            },
            {
                kind: 'table', title: 'Ajustes de comisión', empty: 'No hubo ajustes de comisión en el periodo.',
                columns: [T.dt('Fecha y hora'), T.text('Persona'), T.money('Monto'), T.money('Pendiente'), T.text('Motivo'), T.text('Estado'), T.text('Registró'), T.text('Revisó')],
                rows: report.payouts.adjustments.map((a) => [a.at, a.employee, a.amount, a.remaining, a.reason, a.status, a.created_by, a.reviewed_by]),
            },
        ]);

    // 7. Inventario
    const stock = report.inventory.stock;
    const stockValue = sum(stock.map((s) => s.value));
    add('inventario', 'Inventario', 'Inventario',
        'Lo que hay hoy en existencias y cuánto vale a costo, los productos que se están acabando y cada movimiento del periodo.', [
            { kind: 'text', tone: 'body', text: `Valor de las existencias actuales a costo: ${money(stockValue)} (${stock.length} ${stock.length === 1 ? 'producto' : 'productos'} con control de existencias). Las existencias son las de hoy, no las del último día del periodo.` },
            {
                kind: 'table', title: 'Existencias actuales', empty: 'No hay productos con control de existencias.',
                columns: [T.text('Producto'), T.text('Clave'), T.num('Existencias'), T.num('Mínimo'), T.money('Costo unitario'), T.money('Valor'), T.text('Estado')],
                rows: stock.map((s) => [s.product, s.sku, s.quantity, s.minimum, s.unit_cost, s.value, s.low ? 'Bajo' : 'Suficiente']),
                total: stock.length ? ['Valor total', '', '', '', '', stockValue, ''] : undefined,
            },
            {
                kind: 'table', title: 'Productos bajos', empty: 'Ningún producto está en su mínimo o por debajo.',
                columns: [T.text('Producto'), T.num('Existencias'), T.num('Mínimo')],
                rows: stock.filter((s) => s.low).map((s) => [s.product, s.quantity, s.minimum]),
            },
            {
                kind: 'table', title: 'Movimientos del periodo', empty: 'No hubo movimientos de inventario en el periodo.',
                columns: [T.dt('Fecha y hora'), T.text('Producto'), T.text('Tipo'), T.num('Cantidad'), T.money('Costo unitario'), T.text('Quién'), T.text('Nota')],
                rows: report.inventory.movements.map((m) => [m.at, m.product, STOCK_MOVEMENT_LABELS[m.type] ?? m.type, m.quantity, m.unit_cost, m.by, m.note]),
            },
        ]);

    // 8. Agenda
    const agendaClient = internal ? [T.text('Cliente'), T.text('Teléfono')] : [];
    add('agenda', 'Agenda', 'Agenda',
        'Cuántas citas hubo y cómo terminaron; las canceladas con su motivo y las personas que no llegaron.', [
            {
                kind: 'table', title: 'Citas por estado', empty: 'No hubo citas en el periodo.',
                columns: [T.text('Estado'), T.num('Citas')],
                rows: report.agenda.by_status.map((s) => [APPOINTMENT_STATUS_LABELS[s.status] ?? s.status, s.count]),
                total: report.agenda.by_status.length ? ['Total', sum(report.agenda.by_status.map((s) => s.count))] : undefined,
            },
            {
                kind: 'table', title: 'Citas canceladas', empty: 'No se canceló ninguna cita en el periodo.',
                columns: [T.dt('Fecha de la cita'), T.text('Barbero'), T.text('Motivo'), ...agendaClient],
                rows: report.agenda.cancelled.map((a) => [a.at, a.barber, a.reason ?? 'Sin motivo registrado', ...(internal ? [a.client ?? '', a.phone ?? ''] : [])]),
            },
            {
                kind: 'table', title: 'No llegaron', empty: 'Nadie faltó a su cita en el periodo.',
                columns: [T.dt('Fecha de la cita'), T.text('Barbero'), ...agendaClient],
                rows: report.agenda.no_show.map((a) => [a.at, a.barber, ...(internal ? [a.client ?? '', a.phone ?? ''] : [])]),
            },
        ]);

    // 9. Bitácora
    add('bitacora', 'Bitácora de cambios sensibles', 'Bitácora',
        'Lo delicado que pasó en el periodo (anulaciones, descuentos, cambios de comisión o de caja, cierres y pagos), con quién y cuándo.', [
            {
                kind: 'table', empty: 'No hubo cambios sensibles en el periodo.',
                columns: [T.dts('Fecha y hora'), T.text('Quién'), T.text('Puesto'), T.text('Qué pasó'), T.text('Detalle'), T.text('Motivo')],
                rows: report.audit.map((a) => [a.at, a.actor, a.role ? roleLabel(a.role) : '', auditActionLabel(a.action), auditDetail(a), a.reason]),
            },
        ]);

    // 10. Anexo
    add('anexo', 'Anexo: registro línea por línea', 'Anexo',
        'Cada servicio y producto cobrado, con su hora exacta, para poder revisar cualquier cifra hasta su origen.', [
            {
                kind: 'table', empty: 'No hubo servicios ni productos cobrados en el periodo.',
                columns: [T.dts('Fecha y hora'), T.text('Venta'), T.text('Tipo'), T.text('Concepto'), T.num('Cant.'), T.money('Precio'), T.money('Descuento'), T.money('Importe'), T.text('Persona'), T.text('Pago'), ...(internal ? [T.text('Cliente')] : [])],
                rows: report.annex.map((l) => [
                    l.at, l.sale, l.type === 'service' ? 'Servicio' : 'Producto', l.item, l.quantity, l.unit_price, l.discount, l.amount, l.employee,
                    (l.methods ?? '').split(',').filter(Boolean).map((m) => METHOD_LABELS[m] ?? m).join(' + '),
                    ...(internal ? [l.client ?? ''] : []),
                ]),
                total: report.annex.length ? ['Total', '', '', '', sum(report.annex.map((l) => l.quantity)), '', sum(report.annex.map((l) => l.discount)), sum(report.annex.map((l) => l.amount)), '', '', ...(internal ? [''] : [])] : undefined,
            },
        ]);

    return {
        title: `Reporte del negocio · ${periodLabel(from, to)}`,
        businessName: report.cover.business.name,
        branchName: report.cover.branch.name,
        period: { from, to, days, label: periodLabel(from, to) },
        audience: report.audience,
        timezone: tz,
        generatedAt: report.cover.generated_at,
        generatedBy: report.cover.generated_by.name,
        folio,
        code,
        sections,
    };
}

/** Nombre de archivo: "reporte-REP-000001-contador-2026-11-01_2026-11-15". */
export function reportFileName(model: ReportModel): string {
    return `reporte-${model.folio ?? 'borrador'}-${model.audience}-${model.period.from}_${model.period.to}`;
}

/** Texto de cada celda para una tabla completa (para pantalla y PDF). */
export function tableTexts(table: ReportTable, timeZone: string): { head: string[]; body: string[][]; total: string[] | null } {
    return {
        head: table.columns.map((c) => c.header),
        body: table.rows.map((row) => row.map((cell, i) => formatCell(table.columns[i], cell, timeZone))),
        total: table.total ? table.total.map((cell, i) => formatCell(table.columns[i], cell, timeZone)) : null,
    };
}
