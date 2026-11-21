// «El camino del efectivo»: cuenta el efectivo de UNA caja como una resta que cualquiera entiende.
//
//   fondo con que se abrió + entradas de efectivo − salidas de efectivo = efectivo que debe haber
//   y lo contado al cerrar = fondo que se deja + apartado al sobre + retiro
//
// Funciones puras sobre las filas ya leídas (sesión y movimientos). NO recalculan el cierre con otra fórmula: el esperado
// sale de buildSessionView (la misma cuenta de la pantalla de Caja y de la base, RB-12) y los renglones solo REPARTEN esos
// mismos movimientos de efectivo por tipo. Si algo no suma, se avisa en `check`; nunca se cuadra a la fuerza.
//
// Qué existe en la base (cash_movements.movement_type) y cómo se agrupa. Solo cuenta method = 'cash':
//   sale_payment  entrada  con sale_id                      -> «Cobros en efectivo»
//   deposit       entrada  con sale_id                      -> «Propinas cobradas en efectivo»
//   deposit       entrada  sin sale_id (manual)             -> «Otras entradas»
//   deposit       entrada  «Cancelación de adelanto…»,
//                          «Abono a préstamo…», «Descuento…» (libro del equipo) -> «Regresos del equipo»
//   adjustment    entrada  con expense_id                   -> «Gastos cancelados» (el gasto se canceló con la caja abierta)
//   expense       salida   con expense_id (paid_from = cash_drawer) -> «Gastos pagados de la caja»
//   withdrawal    salida   con commission_settlement_id     -> «Pagos al equipo» (pago semanal: comisiones, propinas, sueldos)
//   withdrawal    salida   «Adelanto ·» / «Préstamo ·» (libro del equipo, pagado de la caja) -> «Pagos al equipo»
//   refund        salida   «Devolución de propina»          -> «Propinas devueltas»
//   withdrawal    salida   con sale_id (propina devuelta, versión anterior) -> «Propinas devueltas»
//   refund        salida   con sale_id                      -> «Reembolsos de ventas»
//   withdrawal    salida   manual                           -> «Otros retiros»
//   (cualquier otro movimiento de efectivo cae en «Otras entradas» u «Otros retiros»: nada se pierde)
// Los gastos «del sobre» o «de banco» NO generan movimiento de caja. El apartado y el retiro del cierre NO son movimientos:
// solo campos de la sesión (float_left, reserve_amount, withdrawn_amount), por eso aquí van en «¿A dónde se fue lo contado?».
// Tarjeta y transferencia no están en la caja.

import { buildSessionView, isTipMovement, type CashMovementRow, type CashSessionRow } from '@/lib/cash/session-view';
import { proposeSplit } from '@/lib/cash/closing';

export type FlowGroupId = 'sales' | 'tips' | 'otherIn' | 'teamBack' | 'expenseBack' | 'expenses' | 'team' | 'refunds' | 'tipRefunds' | 'otherOut';

export interface FlowItem { id: string; at: string | null; description: string; cents: number; by: string | null }
export interface FlowLine {
    id: FlowGroupId;
    side: 'in' | 'out';
    label: string;
    /** Aclaración corta bajo el rótulo (qué entra aquí). */
    hint: string | null;
    /** Siempre positivo; el signo lo da `side`. */
    cents: number;
    count: number;
    items: FlowItem[];
    /** Se muestra aunque esté en cero (el dueño pregunta por ellos). */
    always: boolean;
}

export interface FlowSplit {
    floatCents: number; reserveCents: number; withdrawnCents: number;
    deliveredTo: string | null;
    /** Nombre del apartado («Renta y gastos»). */
    reserveLabel: string;
    /** true = es la propuesta para una caja abierta, no lo que ya se hizo. */
    proposed: boolean;
    /** Motivo escrito al dejar menos del fondo recomendado (solo cajas cerradas). */
    floatNote: string | null;
}

export interface FlowCheck {
    /** Esperado de la Caja menos (fondo + entradas − salidas) de los renglones. */
    expectedDiffCents: number;
    /** Esperado guardado al cerrar menos el calculado; null si no hay esperado guardado. */
    storedExpectedDiffCents: number | null;
    /** (contado − esperado) menos la diferencia guardada; null si no aplica. */
    differenceDiffCents: number | null;
    /** fondo + apartado + retiro menos contado; null si la caja no tiene reparto guardado. */
    splitDiffCents: number | null;
    issues: string[];
    ok: boolean;
}

export interface CashFlow {
    id: string;
    open: boolean;
    openedBy: string;
    closedBy: string | null;
    openedAt: string;
    closedAt: string | null;
    openingCents: number;
    lines: FlowLine[];
    inCents: number;
    outCents: number;
    /** Efectivo que debe haber (el de la Caja: buildSessionView). */
    expectedCents: number;
    countedCents: number | null;
    /** Diferencia guardada al cerrar (contado − esperado); null mientras está abierta. */
    differenceCents: number | null;
    split: FlowSplit | null;
    /** Tarjeta y transferencia netas: no están en la caja. */
    cardCents: number;
    transferCents: number;
    check: FlowCheck;
}

export interface FlowTargets { floatTarget: number; reserveAmount: number; reserveLabel: string }

const cents = (v: number | string | null | undefined): number => {
    const n = Math.round(Number(v ?? 0) * 100);
    return Number.isFinite(n) ? n : 0;
};

const GROUPS: { id: FlowGroupId; side: 'in' | 'out'; label: string; hint: string | null; always: boolean }[] = [
    { id: 'sales', side: 'in', label: 'Cobros en efectivo', hint: null, always: true },
    { id: 'tips', side: 'in', label: 'Propinas cobradas en efectivo', hint: 'Entran a la caja y son del equipo', always: true },
    { id: 'otherIn', side: 'in', label: 'Otras entradas (con motivo)', hint: null, always: true },
    { id: 'teamBack', side: 'in', label: 'Regresos del equipo', hint: 'Adelantos cancelados, abonos a préstamos', always: false },
    { id: 'expenseBack', side: 'in', label: 'Gastos cancelados', hint: 'El dinero de un gasto cancelado regresó a la caja', always: false },
    { id: 'expenses', side: 'out', label: 'Gastos pagados de la caja', hint: null, always: true },
    { id: 'team', side: 'out', label: 'Pagos al equipo', hint: 'Pago semanal (comisiones, propinas, sueldos) y adelantos', always: true },
    { id: 'refunds', side: 'out', label: 'Reembolsos de ventas', hint: 'Ventas anuladas que se devolvieron en efectivo', always: false },
    { id: 'tipRefunds', side: 'out', label: 'Propinas devueltas', hint: 'Propina de una venta anulada', always: false },
    { id: 'otherOut', side: 'out', label: 'Otros retiros (con motivo)', hint: null, always: true },
];

const TEAM_IN = /^(Cancelación de (adelanto|préstamo|prestamo)|Abono a préstamo|Abono a prestamo|Descuento)\s*·/i;
const TEAM_OUT = /^(Adelanto|Préstamo|Prestamo)\s*·/i;
const TIP_REFUND = /^Devolución de propina/i;

type Classifiable = Pick<CashMovementRow, 'movement_type' | 'direction' | 'sale_id' | 'expense_id' | 'commission_settlement_id' | 'description'>;

/** En qué renglón cae un movimiento de efectivo. Todo movimiento cae en alguno. */
export function flowGroupOf(m: Classifiable): FlowGroupId {
    const text = (m.description ?? '').trim();
    if (m.direction === 'in') {
        if (m.movement_type === 'sale_payment') return 'sales';
        if (m.movement_type === 'deposit' && isTipMovement(m)) return 'tips';
        if (m.movement_type === 'adjustment' && m.expense_id) return 'expenseBack';
        if (m.movement_type === 'deposit' && TEAM_IN.test(text)) return 'teamBack';
        return 'otherIn';
    }
    if (m.movement_type === 'expense') return 'expenses';
    if (m.movement_type === 'withdrawal' && (m.commission_settlement_id || TEAM_OUT.test(text))) return 'team';
    if (m.movement_type === 'refund') return TIP_REFUND.test(text) ? 'tipRefunds' : 'refunds';
    if (m.movement_type === 'withdrawal' && m.sale_id) return 'tipRefunds';
    return 'otherOut';
}

const FALLBACK_TEXT: Record<FlowGroupId, string> = {
    sales: 'Cobro de venta', tips: 'Propina', otherIn: 'Entrada de caja', teamBack: 'Regreso del equipo', expenseBack: 'Gasto cancelado',
    expenses: 'Gasto', team: 'Pago al equipo', refunds: 'Reembolso de venta', tipRefunds: 'Devolución de propina', otherOut: 'Retiro de caja',
};

export interface BuildCashFlowOptions {
    /** Ajustes de la sucursal: con ellos, una caja abierta muestra «Al cerrar se propone…». */
    targets?: FlowTargets | null;
    /** Nombres por usuario para «quién lo registró». Sin ellos, los renglones salen sin autor (recepción). */
    authors?: ReadonlyMap<string, string> | null;
    unknownName?: string;
}

export function buildCashFlow(
    session: CashSessionRow, movements: CashMovementRow[], names: ReadonlyMap<string, string>, options: BuildCashFlowOptions = {},
): CashFlow {
    const unknown = options.unknownName ?? 'Usuario';
    const view = buildSessionView(session, movements, names.get(session.opened_by) ?? unknown, session.closed_by ? names.get(session.closed_by) ?? null : null);

    const lines: FlowLine[] = GROUPS.map((g) => ({ ...g, cents: 0, count: 0, items: [] }));
    const byId = new Map(lines.map((l) => [l.id, l]));
    const ordered = movements.filter((m) => m.method === 'cash')
        .slice().sort((a, b) => (a.created_at ?? '').localeCompare(b.created_at ?? '') || (a.id ?? '').localeCompare(b.id ?? ''));
    for (const m of ordered) {
        const line = byId.get(flowGroupOf(m))!;
        const c = cents(m.amount);
        line.cents += c;
        line.count += 1;
        line.items.push({
            id: m.id ?? '', at: m.created_at ?? null, description: m.description?.trim() || FALLBACK_TEXT[line.id], cents: c,
            by: m.created_by && options.authors ? options.authors.get(m.created_by) ?? null : null,
        });
    }

    const openingCents = cents(view.initial_amount);
    const inCents = lines.filter((l) => l.side === 'in').reduce((t, l) => t + l.cents, 0);
    const outCents = lines.filter((l) => l.side === 'out').reduce((t, l) => t + l.cents, 0);
    const expectedCents = cents(view.expected_cash);
    const countedCents = view.physical_count === null ? null : cents(view.physical_count);
    const differenceCents = view.difference === null ? null : cents(view.difference);
    const isOpen = session.status === 'open';

    let split: FlowSplit | null = null;
    const label = options.targets?.reserveLabel ?? 'Apartado';
    if (!isOpen && view.float_left != null && view.reserve_amount != null && view.withdrawn_amount != null) {
        split = {
            floatCents: cents(view.float_left), reserveCents: cents(view.reserve_amount), withdrawnCents: cents(view.withdrawn_amount),
            deliveredTo: view.withdrawal_delivered_to?.trim() || null, reserveLabel: label, proposed: false, floatNote: session.closing_note?.trim() || null,
        };
    } else if (isOpen && options.targets) {
        const p = proposeSplit(expectedCents / 100, options.targets.floatTarget, options.targets.reserveAmount);
        split = { floatCents: cents(p.float), reserveCents: cents(p.reserve), withdrawnCents: cents(p.withdrawn), deliveredTo: null, reserveLabel: label, proposed: true, floatNote: null };
    }

    // ── Comprobaciones (no se cuadra nada a la fuerza)
    const expectedDiffCents = expectedCents - (openingCents + inCents - outCents);
    const storedExpected = !isOpen && session.expected_cash != null ? cents(session.expected_cash) : null;
    const storedExpectedDiffCents = storedExpected === null ? null : storedExpected - expectedCents;
    const differenceDiffCents = !isOpen && countedCents !== null && differenceCents !== null ? (countedCents - expectedCents) - differenceCents : null;
    const splitDiffCents = split && !split.proposed && countedCents !== null ? split.floatCents + split.reserveCents + split.withdrawnCents - countedCents : null;
    const money = (c: number) => `${c < 0 ? '−' : '+'}$${(Math.abs(c) / 100).toLocaleString('es-MX', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const issues: string[] = [];
    if (expectedDiffCents !== 0) issues.push(`El efectivo que debe haber no coincide con el fondo más entradas menos salidas (${money(expectedDiffCents)}).`);
    if (storedExpectedDiffCents) issues.push(`El esperado guardado al cerrar no coincide con el calculado (${money(storedExpectedDiffCents)}).`);
    if (differenceDiffCents) issues.push(`La diferencia guardada no es contado menos esperado (${money(differenceDiffCents)}).`);
    if (splitDiffCents) issues.push(`El fondo, el apartado y el retiro no suman lo contado (${money(splitDiffCents)}).`);

    return {
        id: session.id, open: isOpen, openedBy: view.opened_by, closedBy: view.closed_by ?? null, openedAt: session.opened_at, closedAt: session.closed_at,
        openingCents, lines, inCents, outCents, expectedCents, countedCents, differenceCents, split,
        cardCents: cents(view.total_card), transferCents: cents(view.total_transfer),
        check: { expectedDiffCents, storedExpectedDiffCents, differenceDiffCents, splitDiffCents, issues, ok: issues.length === 0 },
    };
}

/** Arma el camino de varias cajas (las de un día) a partir de todas sus filas. */
export function buildCashFlows(
    sessions: CashSessionRow[], movements: CashMovementRow[], names: ReadonlyMap<string, string>, options: BuildCashFlowOptions = {},
): CashFlow[] {
    const bySession = new Map<string, CashMovementRow[]>();
    for (const m of movements) {
        const list = bySession.get(m.cash_session_id) ?? [];
        list.push(m); bySession.set(m.cash_session_id, list);
    }
    return sessions.slice().sort((a, b) => a.opened_at.localeCompare(b.opened_at))
        .map((s) => buildCashFlow(s, bySession.get(s.id) ?? [], names, options));
}

export const flowLine = (flow: CashFlow, id: FlowGroupId): FlowLine => flow.lines.find((l) => l.id === id)!;

/** Renglones que se muestran: los que tienen movimientos y los que el dueño siempre quiere ver. */
export const visibleLines = (flow: Pick<CashFlow, 'lines'>, side: 'in' | 'out'): FlowLine[] =>
    flow.lines.filter((l) => l.side === side && (l.always || l.count > 0 || l.cents !== 0));

/** Entradas y salidas de efectivo del día, de todas las cajas juntas (sin fondo ni esperado: cada caja arrastra el suyo). */
export interface DayFlowTotal {
    sessionCount: number;
    anyOpen: boolean;
    lines: { id: FlowGroupId; side: 'in' | 'out'; label: string; cents: number; count: number; always: boolean }[];
    inCents: number;
    outCents: number;
    /** Gastos pagados de la caja, de todas las cajas del día. */
    expensesCents: number;
    differenceCents: number;
    reserveCents: number;
    withdrawnCents: number;
    /** Fondo que quedó al cerrar la última caja cerrada del día; null si ninguna cerró. */
    floatLeftCents: number | null;
    issues: number;
}

export function buildDayFlowTotal(flows: CashFlow[]): DayFlowTotal {
    const lines = GROUPS.map((g) => {
        const own = flows.map((f) => flowLine(f, g.id));
        return { id: g.id, side: g.side, label: g.label, cents: own.reduce((t, l) => t + l.cents, 0), count: own.reduce((t, l) => t + l.count, 0), always: g.always };
    });
    const closed = flows.filter((f) => !f.open);
    const lastClosed = closed.length > 0 ? closed[closed.length - 1] : null;
    return {
        sessionCount: flows.length,
        anyOpen: flows.some((f) => f.open),
        lines,
        inCents: lines.filter((l) => l.side === 'in').reduce((t, l) => t + l.cents, 0),
        outCents: lines.filter((l) => l.side === 'out').reduce((t, l) => t + l.cents, 0),
        expensesCents: lines.find((l) => l.id === 'expenses')!.cents,
        differenceCents: closed.reduce((t, f) => t + (f.differenceCents ?? 0), 0),
        reserveCents: closed.reduce((t, f) => t + (f.split?.reserveCents ?? 0), 0),
        withdrawnCents: closed.reduce((t, f) => t + (f.split?.withdrawnCents ?? 0), 0),
        floatLeftCents: lastClosed?.split ? lastClosed.split.floatCents : null,
        issues: flows.reduce((t, f) => t + f.check.issues.length, 0),
    };
}

/** Gastos del día pagados del sobre o del banco (no tocan la caja). Solo para quien ve Gastos. */
export interface OtherExpenses { envelopeCents: number; bankCents: number; count: number }

/** Lo que entrega /api/cash/flow para una caja. */
export interface CashFlowPayload {
    flow: CashFlow;
    timezone: string;
    /** Día del negocio en que se abrió la caja (AAAA-MM-DD). */
    day: string;
    /** Gastos de ese día pagados del sobre o del banco; null = este puesto no los ve. */
    otherExpenses: OtherExpenses | null;
}
