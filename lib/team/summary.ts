// "Barberos hoy": qué lleva cada persona del equipo en el día, la semana o el mes. Funciones puras sobre filas ya
// leídas de la base (el cliente del usuario, con RLS); no tocan la red.
//
// Mismas reglas de asignación que lib/admin/profit.ts:
// - Solo ventas cobradas ('paid'); una venta anulada no aporta nada. Comisiones y propinas, solo 'generated'.
// - Servicio: lo hizo sale_items.employee_id. Producto: lo vendió sale_items.commission_employee_id.
// - Ventas generadas = line_total (ya neto de descuento). Comisión: commission_entries.employee_id. Propina: sale_tips.employee_id.
// - Dinero en centavos enteros.

import { periodWindow, type TimeWindow } from '@/lib/barber/my-week';
import { businessDayRange } from '@/lib/business/timezone';
import { localClock } from '@/lib/settlements/week';

export type TeamPeriod = 'today' | 'week' | 'month';
export const TEAM_PERIODS: TeamPeriod[] = ['today', 'week', 'month'];
export const TEAM_PERIOD_LABELS: Record<TeamPeriod, string> = { today: 'Hoy', week: 'Esta semana', month: 'Este mes' };

export interface TeamWindow extends TimeWindow { period: TeamPeriod; startDay: string; endDay: string }

/** Límites del periodo en la hora de la barbería. La semana es el periodo de pago (lib/payroll/pay-period.ts: de jueves a miércoles). */
export function teamWindow(period: TeamPeriod, now: Date, timeZone: string): TeamWindow {
    if (period === 'today') {
        const day = localClock(now, timeZone).date;
        const range = businessDayRange(day, day, timeZone);
        return { period, start: range.from, end: range.to, startDay: day, endDay: day };
    }
    const w = periodWindow(period, now, timeZone);
    return { period, start: w.start, end: w.end, startDay: w.startDay, endDay: w.endDay };
}

export type SaleRow = { id: string; status: string };
export type ItemRow = {
    id: string; sale_id: string; item_type: 'service' | 'product'; item_name_snapshot: string;
    quantity: number | string; line_total: number | string; employee_id: string | null; commission_employee_id: string | null;
};
export type CommissionRow = { sale_id: string; sale_item_id: string | null; commission_amount: number | string; status: string; employee_id: string | null };
export type TipRow = { sale_id: string; amount: number | string; status: string; employee_id: string | null };
export type EmployeeRow = { id: string; display_name: string; is_barber: boolean; is_active: boolean };

const cents = (value: number | string | null | undefined): number => {
    const n = Math.round(Number(value ?? 0) * 100);
    return Number.isFinite(n) ? n : 0;
};
const units = (value: number | string): number => {
    const n = Number(value);
    return Number.isFinite(n) ? n : 0;
};

export interface CountByName { name: string; count: number }
export interface TeamPerson {
    /** null = ventas sin persona asignada. */
    employeeId: string | null;
    name: string;
    isBarber: boolean;
    services: { count: number; byType: CountByName[] };
    products: { units: number; revenueCents: number; byItem: CountByName[] };
    earned: { serviceCommissionCents: number; productCommissionCents: number; tipsCents: number; totalCents: number };
    /** Ventas que generó: servicios + productos, netas de descuento. */
    generatedCents: number;
    serviceRevenueCents: number;
}
export interface TeamSummary {
    people: TeamPerson[];
    totals: {
        sales: number; serviceCount: number; productUnits: number; productRevenueCents: number; generatedCents: number;
        commissionCents: number; tipsCents: number;
    };
}

export interface TeamSummaryInput { sales: SaleRow[]; items: ItemRow[]; commissions: CommissionRow[]; tips: TipRow[]; employees: EmployeeRow[] }

const NONE = '\u0000sin-asignar';

const sortCounts = (map: Map<string, number>): CountByName[] =>
    [...map.entries()].map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, 'es'));

export function buildTeamSummary({ sales, items, commissions, tips, employees }: TeamSummaryInput): TeamSummary {
    const paid = new Set(sales.filter((s) => s.status === 'paid').map((s) => s.id));
    const names = new Map(employees.map((e) => [e.id, e]));
    type Acc = {
        serviceTypes: Map<string, number>; productItems: Map<string, number>; serviceRevenue: number; productRevenue: number;
        serviceCommission: number; productCommission: number; tips: number; serviceCount: number; productUnits: number;
    };
    const accs = new Map<string, Acc>();
    const acc = (id: string | null | undefined): Acc => {
        const key = id || NONE;
        let a = accs.get(key);
        if (!a) {
            a = { serviceTypes: new Map(), productItems: new Map(), serviceRevenue: 0, productRevenue: 0, serviceCommission: 0, productCommission: 0, tips: 0, serviceCount: 0, productUnits: 0 };
            accs.set(key, a);
        }
        return a;
    };
    const typeOfItem = new Map<string, 'service' | 'product'>();

    for (const i of items) {
        if (!paid.has(i.sale_id)) continue;
        typeOfItem.set(i.id, i.item_type);
        const qty = units(i.quantity);
        if (i.item_type === 'service') {
            const a = acc(i.employee_id);
            a.serviceCount += qty;
            a.serviceRevenue += cents(i.line_total);
            a.serviceTypes.set(i.item_name_snapshot, (a.serviceTypes.get(i.item_name_snapshot) ?? 0) + qty);
        } else {
            const a = acc(i.commission_employee_id);
            a.productUnits += qty;
            a.productRevenue += cents(i.line_total);
            a.productItems.set(i.item_name_snapshot, (a.productItems.get(i.item_name_snapshot) ?? 0) + qty);
        }
    }
    for (const c of commissions) {
        if (!paid.has(c.sale_id) || c.status !== 'generated') continue;
        const a = acc(c.employee_id);
        if (c.sale_item_id && typeOfItem.get(c.sale_item_id) === 'product') a.productCommission += cents(c.commission_amount);
        else a.serviceCommission += cents(c.commission_amount);
    }
    for (const t of tips) {
        if (!paid.has(t.sale_id) || t.status !== 'generated') continue;
        acc(t.employee_id).tips += cents(t.amount);
    }
    // Todo barbero activo aparece aunque no lleve nada: recepción necesita ver también el cero.
    for (const e of employees) if (e.is_active && e.is_barber) acc(e.id);

    const people: TeamPerson[] = [...accs.entries()].map(([key, a]) => {
        const emp = key === NONE ? undefined : names.get(key);
        return {
            employeeId: key === NONE ? null : key,
            name: key === NONE ? 'Sin asignar' : emp?.display_name ?? 'Sin nombre',
            isBarber: emp?.is_barber ?? false,
            services: { count: a.serviceCount, byType: sortCounts(a.serviceTypes) },
            products: { units: a.productUnits, revenueCents: a.productRevenue, byItem: sortCounts(a.productItems) },
            earned: {
                serviceCommissionCents: a.serviceCommission, productCommissionCents: a.productCommission, tipsCents: a.tips,
                totalCents: a.serviceCommission + a.productCommission + a.tips,
            },
            generatedCents: a.serviceRevenue + a.productRevenue,
            serviceRevenueCents: a.serviceRevenue,
        };
    }).sort((a, b) => Number(b.isBarber) - Number(a.isBarber) || b.generatedCents - a.generatedCents || a.name.localeCompare(b.name, 'es'));

    const sum = (pick: (p: TeamPerson) => number) => people.reduce((t, p) => t + pick(p), 0);
    return {
        people,
        totals: {
            sales: paid.size,
            serviceCount: sum((p) => p.services.count),
            productUnits: sum((p) => p.products.units),
            productRevenueCents: sum((p) => p.products.revenueCents),
            generatedCents: sum((p) => p.generatedCents),
            commissionCents: sum((p) => p.earned.serviceCommissionCents + p.earned.productCommissionCents),
            tipsCents: sum((p) => p.earned.tipsCents),
        },
    };
}

/** Cifras de ranking de cada persona con actividad o barbero activo (para el respaldo del ranking sin la función nueva). */
export function toRankingPeople(summary: TeamSummary) {
    return summary.people.filter((p) => p.employeeId !== null).map((p) => ({
        id: p.employeeId as string, name: p.name, isBarber: p.isBarber, services: p.services.count, productUnits: p.products.units,
        serviceRevenueCents: p.serviceRevenueCents, productRevenueCents: p.products.revenueCents,
    }));
}
