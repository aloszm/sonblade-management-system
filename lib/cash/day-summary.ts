// Resumen de caja de UN día: funciones puras sobre filas ya leídas con el cliente del usuario (RLS). No tocan la red.
//
// Definiciones (las mismas de «Barberos hoy» y del glosario §6):
// - DÍA = el día del negocio en su zona horaria, medido por sales.paid_at. Una venta cobrada el jueves y anulada el
//   viernes cuenta como anulada en el JUEVES (el día en que se cobró).
// - Solo cuentan las ventas cobradas ('paid'). Las anuladas (refunded, partially_refunded, cancelled) se muestran aparte.
// - Servicios = sale_items de tipo servicio (line_total, ya neto de descuento); piezas = cantidad de productos.
// - Ingreso de la barbería = servicios + productos. Las propinas (sale_tips 'generated') son del equipo, no ingreso.
// - Total cobrado = ingreso + propinas.
// - Por forma de pago: pagos confirmados (payments) de ventas cobradas para lo vendido, y sale_tips.method para las
//   propinas. Un pago dividido reparte cada parte a su método.
// - Por persona: el servicio a quien lo hizo (employee_id); el producto a quien lo VENDIÓ (commission_employee_id);
//   la propina a quien la recibió. Lo que no tenga persona va en «Sin asignar».
// - Cortes: servicios cuya categoría real es «cortes» (services.category).
// Dinero en centavos enteros; se convierte a pesos solo al mostrar.

import {
    buildCashFlows, buildDayFlowTotal, type BuildCashFlowOptions, type CashFlow, type DayFlowTotal, type OtherExpenses,
} from '@/lib/cash/cash-flow';
import type { CashMovementRow, CashSessionRow } from '@/lib/cash/session-view';
import { PAYMENT_METHOD_LABELS } from '@/lib/utils/payment';

export type DaySale = { id: string; folio: string | null; status: string; total_amount: number | string; paid_at: string | null };
export type DayItem = {
    sale_id: string; item_type: 'service' | 'product'; item_name_snapshot: string; service_id: string | null;
    quantity: number | string; line_total: number | string; employee_id: string | null; commission_employee_id: string | null;
};
export type DayPayment = { sale_id: string; method: string; amount: number | string; status: string };
export type DayTip = { sale_id: string; employee_id: string | null; amount: number | string; method: string | null; status: string };
export type DayEmployee = { id: string; display_name: string };

export interface DaySummaryInput {
    date: string;
    sales: DaySale[];
    items: DayItem[];
    payments: DayPayment[];
    tips: DayTip[];
    employees: DayEmployee[];
    /** Ids de servicio cuya categoría es «cortes». */
    cutServiceIds: ReadonlyArray<string>;
}

const cents = (v: number | string | null | undefined): number => {
    const n = Math.round(Number(v ?? 0) * 100);
    return Number.isFinite(n) ? n : 0;
};
const units = (v: number | string): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : 0;
};

const VOIDED = new Set(['refunded', 'partially_refunded', 'cancelled']);
const NONE = '\u0000sin-asignar';
export const UNASSIGNED_NAME = 'Sin asignar';

export interface MethodLine { method: string; label: string; salesCents: number; tipsCents: number; totalCents: number; payments: number }
export interface PersonLine {
    employeeId: string | null; name: string; firstName: string;
    serviceCount: number; cutCount: number; servicesCents: number; productUnits: number; productsCents: number; tipsCents: number; totalCents: number;
}
export interface SaleLine {
    folio: string; paidAt: string | null; servedBy: string; concept: string; amountCents: number; tipCents: number; method: string; methodLabel: string;
}
export interface DaySummary {
    date: string;
    sales: { paidCount: number; voidedCount: number; voidedCents: number };
    totals: {
        servicesCents: number; serviceCount: number; cutCount: number; productsCents: number; productUnits: number;
        tipsCents: number; businessIncomeCents: number; grandTotalCents: number;
    };
    methods: MethodLine[];
    people: PersonLine[];
    saleLines: SaleLine[];
    /** Comprobaciones: cada reparto debe sumar el total. Si alguna falla, la pantalla lo avisa. */
    check: { methodsDiffCents: number; peopleDiffCents: number; ok: boolean };
}

const METHOD_ORDER = ['cash', 'card', 'transfer', 'other'];
const ALWAYS_SHOWN = ['cash', 'card', 'transfer'];

export const firstName = (full: string): string => full.trim().split(/\s+/)[0] ?? full;

export function buildDaySummary(input: DaySummaryInput): DaySummary {
    const paidIds = new Set(input.sales.filter((s) => s.status === 'paid').map((s) => s.id));
    const voided = input.sales.filter((s) => VOIDED.has(s.status));
    const cuts = new Set(input.cutServiceIds);
    const names = new Map(input.employees.map((e) => [e.id, e.display_name]));

    type Acc = { serviceCount: number; cutCount: number; servicesCents: number; productUnits: number; productsCents: number; tipsCents: number };
    const people = new Map<string, Acc>();
    const acc = (id: string | null | undefined): Acc => {
        const key = id || NONE;
        let a = people.get(key);
        if (!a) { a = { serviceCount: 0, cutCount: 0, servicesCents: 0, productUnits: 0, productsCents: 0, tipsCents: 0 }; people.set(key, a); }
        return a;
    };

    let servicesCents = 0, serviceCount = 0, cutCount = 0, productsCents = 0, productUnits = 0, tipsCents = 0;
    for (const i of input.items) {
        if (!paidIds.has(i.sale_id)) continue;
        const qty = units(i.quantity);
        const line = cents(i.line_total);
        if (i.item_type === 'service') {
            const a = acc(i.employee_id);
            const isCut = Boolean(i.service_id && cuts.has(i.service_id));
            a.serviceCount += qty; a.servicesCents += line; if (isCut) a.cutCount += qty;
            servicesCents += line; serviceCount += qty; if (isCut) cutCount += qty;
        } else {
            const a = acc(i.commission_employee_id);
            a.productUnits += qty; a.productsCents += line;
            productsCents += line; productUnits += qty;
        }
    }

    const byMethod = new Map<string, { salesCents: number; tipsCents: number; payments: number }>();
    for (const m of ALWAYS_SHOWN) byMethod.set(m, { salesCents: 0, tipsCents: 0, payments: 0 });
    const method = (key: string) => {
        let m = byMethod.get(key);
        if (!m) { m = { salesCents: 0, tipsCents: 0, payments: 0 }; byMethod.set(key, m); }
        return m;
    };
    for (const p of input.payments) {
        if (!paidIds.has(p.sale_id) || p.status !== 'confirmed') continue;
        const m = method(p.method || 'other');
        m.salesCents += cents(p.amount); m.payments += 1;
    }
    const tipByMethod = new Map<string, number>(); // por venta, para la lista de ventas
    for (const t of input.tips) {
        if (!paidIds.has(t.sale_id) || t.status !== 'generated') continue;
        const c = cents(t.amount);
        acc(t.employee_id).tipsCents += c;
        tipsCents += c;
        method(t.method || 'other').tipsCents += c;
        tipByMethod.set(t.sale_id, (tipByMethod.get(t.sale_id) ?? 0) + c);
    }

    const methods: MethodLine[] = [...byMethod.entries()]
        .filter(([key, v]) => ALWAYS_SHOWN.includes(key) || v.salesCents !== 0 || v.tipsCents !== 0)
        .map(([key, v]) => ({
            method: key, label: PAYMENT_METHOD_LABELS[key] ?? key, salesCents: v.salesCents, tipsCents: v.tipsCents,
            totalCents: v.salesCents + v.tipsCents, payments: v.payments,
        }))
        .sort((a, b) => (METHOD_ORDER.indexOf(a.method) === -1 ? 99 : METHOD_ORDER.indexOf(a.method)) - (METHOD_ORDER.indexOf(b.method) === -1 ? 99 : METHOD_ORDER.indexOf(b.method)));

    const personLines: PersonLine[] = [...people.entries()].map(([key, a]) => {
        const name = key === NONE ? UNASSIGNED_NAME : names.get(key) ?? 'Sin nombre';
        return {
            employeeId: key === NONE ? null : key, name, firstName: key === NONE ? UNASSIGNED_NAME : firstName(name),
            ...a, totalCents: a.servicesCents + a.productsCents + a.tipsCents,
        };
    }).sort((a, b) => Number(a.employeeId === null) - Number(b.employeeId === null) || b.totalCents - a.totalCents || a.name.localeCompare(b.name, 'es'));

    // Lista de ventas del día: sin cliente, solo folio, hora, quién atendió, concepto, importe, propina y método.
    const itemsBySale = new Map<string, DayItem[]>();
    for (const i of input.items) {
        if (!paidIds.has(i.sale_id)) continue;
        const list = itemsBySale.get(i.sale_id) ?? [];
        list.push(i); itemsBySale.set(i.sale_id, list);
    }
    const payBySale = new Map<string, DayPayment[]>();
    for (const p of input.payments) {
        if (!paidIds.has(p.sale_id) || p.status !== 'confirmed') continue;
        const list = payBySale.get(p.sale_id) ?? [];
        list.push(p); payBySale.set(p.sale_id, list);
    }
    const saleLines: SaleLine[] = input.sales.filter((s) => paidIds.has(s.id))
        .sort((a, b) => (a.paid_at ?? '').localeCompare(b.paid_at ?? '') || (a.folio ?? '').localeCompare(b.folio ?? ''))
        .map((s) => {
            const its = itemsBySale.get(s.id) ?? [];
            const who = new Set(its.map((i) => (i.item_type === 'service' ? i.employee_id : i.commission_employee_id) ?? NONE));
            const servedBy = [...who].map((id) => (id === NONE ? UNASSIGNED_NAME : firstName(names.get(id) ?? 'Sin nombre'))).join(' y ') || UNASSIGNED_NAME;
            const concept = its.map((i) => (units(i.quantity) > 1 ? `${i.item_name_snapshot} ×${units(i.quantity)}` : i.item_name_snapshot)).join(', ');
            const pays = payBySale.get(s.id) ?? [];
            const keys = [...new Set(pays.map((p) => p.method))];
            const methodKey = keys.length > 1 ? 'mixed' : keys[0] ?? '';
            const label = keys.length > 1
                ? keys.map((k) => `${PAYMENT_METHOD_LABELS[k] ?? k} ${(pays.filter((p) => p.method === k).reduce((t, p) => t + cents(p.amount), 0) / 100).toLocaleString('es-MX')}`).join(' + ')
                : PAYMENT_METHOD_LABELS[methodKey] ?? methodKey;
            return {
                folio: s.folio ?? '', paidAt: s.paid_at, servedBy, concept, amountCents: its.reduce((t, i) => t + cents(i.line_total), 0),
                tipCents: tipByMethod.get(s.id) ?? 0, method: methodKey, methodLabel: label,
            };
        });

    const businessIncomeCents = servicesCents + productsCents;
    const grandTotalCents = businessIncomeCents + tipsCents;
    const methodsTotal = methods.reduce((t, m) => t + m.totalCents, 0);
    const peopleTotal = personLines.reduce((t, p) => t + p.totalCents, 0);
    const methodsDiffCents = methodsTotal - grandTotalCents;
    const peopleDiffCents = peopleTotal - grandTotalCents;

    return {
        date: input.date,
        sales: { paidCount: paidIds.size, voidedCount: voided.length, voidedCents: voided.reduce((t, s) => t + cents(s.total_amount), 0) },
        totals: { servicesCents, serviceCount, cutCount, productsCents, productUnits, tipsCents, businessIncomeCents, grandTotalCents },
        methods, people: personLines, saleLines,
        check: { methodsDiffCents, peopleDiffCents, ok: methodsDiffCents === 0 && peopleDiffCents === 0 },
    };
}

// ───────────────────────── Caja del día

export interface DayCash {
    /** «El camino del efectivo» de cada caja abierta ese día, de la más temprana a la más tardía. */
    sessions: CashFlow[];
    anyOpen: boolean;
    /** Entradas y salidas de todas las cajas juntas (el esperado y el contado no se suman: cada caja arrastra su fondo). */
    total: DayFlowTotal;
    /** Diferencia y apartado sumados de las cajas cerradas. */
    differenceCents: number; reserveCents: number;
    /** Gastos del día pagados del sobre o del banco (no salen de la caja); null = este puesto no los ve. */
    otherExpenses: OtherExpenses | null;
}

/**
 * Arma la caja del día con la MISMA lógica de la pantalla de Caja: cada caja pasa por buildCashFlow, que reutiliza
 * buildSessionView (esperado = inicial + entradas de efectivo − salidas de efectivo) y reparte esos movimientos por renglón.
 */
export function buildDayCash(
    sessions: CashSessionRow[], movements: CashMovementRow[], names: ReadonlyMap<string, string>,
    options: BuildCashFlowOptions & { otherExpenses?: OtherExpenses | null } = {},
): DayCash {
    const flows = buildCashFlows(sessions, movements, names, options);
    return dayCashFromFlows(flows, options.otherExpenses ?? null);
}

export function dayCashFromFlows(flows: CashFlow[], otherExpenses: OtherExpenses | null = null): DayCash {
    const total = buildDayFlowTotal(flows);
    return { sessions: flows, anyOpen: total.anyOpen, total, differenceCents: total.differenceCents, reserveCents: total.reserveCents, otherExpenses };
}

export interface DaySummaryPayload {
    date: string;
    timezone: string;
    businessName: string;
    /** Día de hoy en la zona de la barbería (para rotular «Hoy» / «Ayer» y limitar el selector). */
    today: string;
    /** Primer día que este puesto puede ver (recepción: ayer); null = cualquiera. */
    minDay: string | null;
    summary: DaySummary;
    cash: DayCash;
}
