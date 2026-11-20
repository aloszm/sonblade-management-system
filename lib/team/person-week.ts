// Semana de una persona del equipo: de dónde sale cada número de su tarjeta en Equipo.
// Funciones puras sobre filas ya leídas (sin red ni reloj). Solo AGRUPAN lo que la base ya generó:
// no calculan comisiones. Una sola lista de renglones alimenta la tarjeta y el desglose, así que los totales
// de la tarjeta y los del pie del desglose son siempre los mismos.
//
// Mismas reglas de asignación que lib/team/summary.ts y lib/admin/profit.ts:
// - Solo ventas cobradas ('paid'). Comisiones y propinas, solo 'generated'.
// - Servicio: lo hizo sale_items.employee_id. Producto: lo vendió sale_items.commission_employee_id.
// - Ventas = line_total (neto de descuento). Comisión: commission_entries.employee_id. Propina: sale_tips.employee_id.
// - El porcentaje es el que quedó guardado en cada comisión (percentage_snapshot); nunca se calcula dividiendo.
// - Dinero en centavos enteros.

export type LineKind = 'service' | 'product' | 'tip';

export type WeekSaleRow = { id: string; folio: string | null; status: string; paid_at: string | null };
export type WeekItemRow = {
    id: string; sale_id: string; item_type: 'service' | 'product'; item_name_snapshot: string;
    quantity: number | string; line_total: number | string; employee_id: string | null; commission_employee_id: string | null;
};
export type WeekCommissionRow = {
    sale_id: string; sale_item_id: string | null; employee_id: string | null; status: string;
    commission_amount: number | string; basis_amount: number | string | null; percentage_snapshot: number | string | null;
};
export type WeekTipRow = { sale_id: string; employee_id: string | null; status: string; amount: number | string };
export type WeekEmployeeRow = { id: string; display_name: string; is_barber: boolean; is_active: boolean };

export interface WeekData { sales: WeekSaleRow[]; items: WeekItemRow[]; commissions: WeekCommissionRow[]; tips: WeekTipRow[]; employees: WeekEmployeeRow[] }

const cents = (value: number | string | null | undefined): number => {
    const n = Math.round(Number(value ?? 0) * 100);
    return Number.isFinite(n) ? n : 0;
};
const num = (value: number | string | null | undefined): number => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? n : 0;
};

/** Un renglón del desglose: un servicio o producto de una venta (o una propina sin concepto propio). */
export interface PersonLine {
    key: string;
    saleId: string;
    folio: string | null;
    paidAt: string | null;
    kind: LineKind;
    concept: string;
    quantity: number;
    /** Lo cobrado por ese concepto (neto de descuento). */
    revenueCents: number;
    /** Base sobre la que la regla calculó la comisión; null si no hubo comisión. */
    baseCents: number | null;
    /** Porcentaje guardado en la comisión (50 = 50 %); null si no hubo comisión o hubo varios distintos. */
    percent: number | null;
    commissionCents: number;
    tipCents: number;
}

export interface KindSummary {
    count: number;
    revenueCents: number;
    commissionCents: number;
    /** Porcentaje único de todas las comisiones del tipo; null si no hay o si hubo varios (entonces no se muestra). */
    percent: number | null;
}
export interface PersonWeekSummary {
    employeeId: string;
    name: string;
    isBarber: boolean;
    services: KindSummary;
    products: KindSummary;
    tipsCents: number;
    /** Servicios + productos cobrados. */
    revenueCents: number;
    /** Comisión de servicios + de productos (sin propinas). */
    commissionCents: number;
    /** Lo que lleva ganado: comisiones + propinas. */
    earnedCents: number;
}

function uniquePercent(values: (number | null)[]): number | null {
    const present = values.filter((v): v is number => v !== null);
    if (present.length === 0) return null;
    return present.every((v) => v === present[0]) ? present[0] : null;
}

/** Renglones de la semana de una persona: más recientes primero. */
export function buildPersonLines(data: WeekData, employeeId: string): PersonLine[] {
    const sales = new Map(data.sales.filter((s) => s.status === 'paid').map((s) => [s.id, s]));
    const itemById = new Map(data.items.filter((i) => sales.has(i.sale_id)).map((i) => [i.id, i]));
    const mine = (i: WeekItemRow) => (i.item_type === 'service' ? i.employee_id : i.commission_employee_id) === employeeId;
    const entries = data.commissions.filter((c) => sales.has(c.sale_id) && c.status === 'generated' && c.employee_id === employeeId);

    const itemIds = new Set<string>();
    for (const i of itemById.values()) if (mine(i)) itemIds.add(i.id);
    for (const c of entries) if (c.sale_item_id && itemById.has(c.sale_item_id)) itemIds.add(c.sale_item_id);

    const lines: PersonLine[] = [];
    for (const id of itemIds) {
        const item = itemById.get(id)!;
        const sale = sales.get(item.sale_id)!;
        const own = entries.filter((c) => c.sale_item_id === id);
        lines.push({
            key: `item-${id}`, saleId: sale.id, folio: sale.folio, paidAt: sale.paid_at, kind: item.item_type,
            concept: item.item_name_snapshot, quantity: num(item.quantity),
            revenueCents: mine(item) ? cents(item.line_total) : 0,
            baseCents: own.length > 0 ? own.reduce((t, c) => t + cents(c.basis_amount ?? item.line_total), 0) : null,
            percent: uniquePercent(own.map((c) => (c.percentage_snapshot === null || c.percentage_snapshot === undefined ? null : num(c.percentage_snapshot)))),
            commissionCents: own.reduce((t, c) => t + cents(c.commission_amount), 0),
            tipCents: 0,
        });
    }
    // Comisiones sin concepto conocido (no debería pasar): se muestran para que el total siga cuadrando.
    for (const c of entries) {
        if (c.sale_item_id && itemById.has(c.sale_item_id)) continue;
        const sale = sales.get(c.sale_id)!;
        lines.push({
            key: `comm-${c.sale_id}-${c.sale_item_id ?? 'x'}`, saleId: sale.id, folio: sale.folio, paidAt: sale.paid_at, kind: 'service',
            concept: 'Comisión', quantity: 0, revenueCents: 0, baseCents: c.basis_amount === null ? null : cents(c.basis_amount),
            percent: c.percentage_snapshot === null ? null : num(c.percentage_snapshot), commissionCents: cents(c.commission_amount), tipCents: 0,
        });
    }
    // Propinas: van en el primer renglón de esa venta; si la persona no tiene renglón ahí, en uno propio.
    for (const t of data.tips) {
        if (t.status !== 'generated' || t.employee_id !== employeeId) continue;
        const sale = sales.get(t.sale_id);
        if (!sale) continue;
        const host = lines.find((l) => l.saleId === sale.id);
        if (host) host.tipCents += cents(t.amount);
        else {
            lines.push({
                key: `tip-${sale.id}`, saleId: sale.id, folio: sale.folio, paidAt: sale.paid_at, kind: 'tip', concept: 'Propina', quantity: 0,
                revenueCents: 0, baseCents: null, percent: null, commissionCents: 0, tipCents: cents(t.amount),
            });
        }
    }
    return lines.sort((a, b) => (b.paidAt ?? '').localeCompare(a.paidAt ?? '') || a.key.localeCompare(b.key));
}

export interface LineTotals {
    services: KindSummary; products: KindSummary; tipsCents: number; revenueCents: number; commissionCents: number; earnedCents: number;
}

/** Totales de una lista de renglones: es lo que muestran la tarjeta y el pie del desglose. */
export function summarizeLines(lines: PersonLine[]): LineTotals {
    const kind = (k: 'service' | 'product'): KindSummary => {
        const own = lines.filter((l) => l.kind === k);
        return {
            count: own.reduce((t, l) => t + l.quantity, 0),
            revenueCents: own.reduce((t, l) => t + l.revenueCents, 0),
            commissionCents: own.reduce((t, l) => t + l.commissionCents, 0),
            percent: uniquePercent(own.filter((l) => l.baseCents !== null).map((l) => l.percent)),
        };
    };
    const services = kind('service');
    const products = kind('product');
    const tipsCents = lines.reduce((t, l) => t + l.tipCents, 0);
    const commissionCents = services.commissionCents + products.commissionCents;
    return { services, products, tipsCents, revenueCents: services.revenueCents + products.revenueCents, commissionCents, earnedCents: commissionCents + tipsCents };
}

export function summarizePerson(data: WeekData, employee: { id: string; name: string; isBarber: boolean }): PersonWeekSummary {
    const totals = summarizeLines(buildPersonLines(data, employee.id));
    return { employeeId: employee.id, name: employee.name, isBarber: employee.isBarber, ...totals };
}

/** Una tarjeta por cada barbero activo y por cada persona con actividad en la semana. */
export function buildWeekPeople(data: WeekData): PersonWeekSummary[] {
    const active = new Set<string>();
    for (const e of data.employees) if (e.is_active && e.is_barber) active.add(e.id);
    const sales = new Set(data.sales.filter((s) => s.status === 'paid').map((s) => s.id));
    for (const i of data.items) {
        if (!sales.has(i.sale_id)) continue;
        const id = i.item_type === 'service' ? i.employee_id : i.commission_employee_id;
        if (id) active.add(id);
    }
    for (const c of data.commissions) if (c.employee_id && c.status === 'generated' && sales.has(c.sale_id)) active.add(c.employee_id);
    for (const t of data.tips) if (t.employee_id && t.status === 'generated' && sales.has(t.sale_id)) active.add(t.employee_id);
    const names = new Map(data.employees.map((e) => [e.id, e]));
    return [...active].map((id) => {
        const e = names.get(id);
        return summarizePerson(data, { id, name: e?.display_name ?? 'Sin nombre', isBarber: e?.is_barber ?? false });
    }).sort((a, b) => b.revenueCents - a.revenueCents || a.name.localeCompare(b.name, 'es'));
}

// --- Forma que viaja por la API (pesos, no centavos) ---------------------------------------------------

const pesos = (c: number) => c / 100;
export interface KindSummaryApi { count: number; revenue: number; commission: number; percent: number | null }
export interface PersonWeekApi {
    employeeId: string; name: string; isBarber: boolean; services: KindSummaryApi; products: KindSummaryApi;
    tips: number; revenue: number; commission: number; earned: number;
}
export interface PersonLineApi {
    key: string; saleId: string; folio: string | null; paidAt: string | null; kind: LineKind; concept: string; quantity: number;
    revenue: number; base: number | null; percent: number | null; commission: number; tip: number;
}
const kindApi = (k: KindSummary): KindSummaryApi => ({ count: k.count, revenue: pesos(k.revenueCents), commission: pesos(k.commissionCents), percent: k.percent });

export function personWeekApi(p: PersonWeekSummary): PersonWeekApi {
    return {
        employeeId: p.employeeId, name: p.name, isBarber: p.isBarber, services: kindApi(p.services), products: kindApi(p.products),
        tips: pesos(p.tipsCents), revenue: pesos(p.revenueCents), commission: pesos(p.commissionCents), earned: pesos(p.earnedCents),
    };
}
export function lineApi(l: PersonLine): PersonLineApi {
    return {
        key: l.key, saleId: l.saleId, folio: l.folio, paidAt: l.paidAt, kind: l.kind, concept: l.concept, quantity: l.quantity,
        revenue: pesos(l.revenueCents), base: l.baseCents === null ? null : pesos(l.baseCents), percent: l.percent, commission: pesos(l.commissionCents), tip: pesos(l.tipCents),
    };
}
