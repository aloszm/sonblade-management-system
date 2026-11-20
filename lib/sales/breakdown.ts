// Desglose de una venta: cómo se repartió el dinero (base, % y monto de cada comisión, propina) y qué le queda
// a la barbería en ESA venta. Función pura: recibe filas ya leídas de la base y no toca la red ni cambia dinero.
//
// De dónde sale cada dato (los mismos que usa lib/admin/profit.ts, que es la utilidad del sistema):
// - Ingreso = suma de sale_items.line_total (ya neto del descuento del renglón). No incluye propinas.
// - Comisiones = commission_entries de la venta. En una venta cobrada cuentan las 'generated'; en una anulada,
//   reverse_sale las dejó en 'reversed' y se muestran como revertidas (así lo dejó la base, no se recalcula).
// - Propinas = sale_tips (100 % para quien atendió). Van al equipo; no son ingreso del negocio.
// - Costo de producto = cantidad × sale_items.unit_cost_snapshot (costo guardado al vender). Si el renglón no lo trae,
//   se usa el costo actual del catálogo que se haya podido leer; si tampoco hay, no se asume cero: se avisa.
// - Le queda a la barbería = ingreso − comisiones − costo de producto. NO incluye sueldos, bonos ni gastos: son del
//   periodo, no de la venta (docs/GLOSARIO.md §6 lo define a nivel periodo; aquí es la misma fórmula a nivel venta).
// - "En espera": renglón cobrado que no generó comisión (commission_holds abierta o sin beneficiario). No es $0.
// - Cortesía de producto (desde 20261120130000): renglón de producto cobrado en $0 (line_total = 0). No paga comisión:
//   la base guarda una comisión de $0 (o, si no tenía vendedor, la deja en commission_holds como a todo producto sin
//   vendedor). Se muestra "Cortesía · sin comisión", nunca "en espera". Si una venta vieja sí pagó comisión por un
//   producto regalado (antes de esa migración), se muestra lo que se pagó: no se reinterpreta.
// - Base de la comisión con descuento: se muestra la que GUARDÓ la base (commission_entries.basis y basis_amount),
//   no la regla vigente. Desde 20261120110000 servicio y producto usan el precio de lista (el descuento lo absorbe la
//   barbería); las ventas de producto anteriores conservan su base con descuento y así se explican.
//
// Quién ve qué: con `scope: 'front_desk'` (recepción) NO se calcula ni se entrega el costo de producto ni lo que
// le queda a la barbería; las claves ni siquiera existen en el resultado. Con `scope: 'full'` (cuenta principal,
// gerencia y consulta) sale todo. La ruta elige el alcance con canSeeSaleCost (lib/auth/roles.ts).

import { formatMoney } from '@/lib/utils/money';

export type BreakdownScope = 'full' | 'front_desk';

export type BreakdownSale = {
    id: string;
    folio: string;
    status: string;
    subtotal_amount: number | string;
    discount_amount: number | string;
    total_amount: number | string;
};
export type BreakdownItem = {
    id: string;
    item_type: 'service' | 'product';
    product_id?: string | null;
    item_name_snapshot: string;
    quantity: number | string;
    unit_price: number | string;
    discount_amount: number | string;
    line_total: number | string;
    employee_id: string | null;
    commission_employee_id: string | null;
    /** Solo se lee para quien puede ver costos; con alcance de recepción se ignora aunque llegue. */
    unit_cost_snapshot?: number | string | null;
};
export type BreakdownCommission = {
    sale_item_id: string;
    employee_id: string;
    basis: string;
    basis_amount: number | string;
    calculation_type: string;
    percentage_snapshot: number | string | null;
    fixed_amount_snapshot: number | string | null;
    commission_amount: number | string;
    status: string;
};
export type BreakdownTip = { employee_id: string; amount: number | string; method: string; status: string };
export type BreakdownPayment = { method: string; amount: number | string; status: string };
export type BreakdownHold = { sale_item_id: string; reason: string; resolved_at: string | null };

export type BreakdownInput = {
    sale: BreakdownSale;
    items: BreakdownItem[];
    commissions: BreakdownCommission[];
    tips: BreakdownTip[];
    payments: BreakdownPayment[];
    /** Comisiones en espera (solo las puede leer gerencia; recepción manda []). */
    holds?: BreakdownHold[];
    /** id de empleado → nombre completo. Se muestra solo el nombre de pila. */
    names: Record<string, string>;
    /** id de producto → costo actual del catálogo, solo como respaldo si el renglón no guardó el costo. */
    fallbackUnitCosts?: Record<string, number | string | null>;
};

export type BreakdownLine = {
    itemId: string;
    name: string;
    type: 'service' | 'product';
    quantity: number;
    /** Precio de lista del renglón (cantidad × precio unitario). */
    listAmount: number;
    discount: number;
    /** Monto sobre el que se calculó la comisión; null si está en espera. */
    base: number | null;
    /** true si hubo descuento: la base se explica en `baseNote`. */
    discounted: boolean;
    baseNote: string | null;
    percentage: number | null;
    fixedAmount: number | null;
    beneficiaryName: string | null;
    commission: number | null;
    /** Renglón cobrado sin comisión generada: se dice "en espera", no $0. */
    pending: boolean;
    /** Cortesía de producto (renglón en $0): no paga comisión. Nunca está "en espera". */
    courtesy: boolean;
    pendingReason: string | null;
    /** La venta se anuló y la comisión se revirtió. */
    reversed: boolean;
    /** Costo del renglón (solo alcance 'full' y solo productos). null si no se conoce. */
    cost?: number | null;
};
export type BreakdownTipRow = { name: string | null; amount: number; method: string; percentage: 100; reversed: boolean };

export type BreakdownSummary = {
    /** Lo que pagó el cliente: total de la venta + propinas. */
    charged: number;
    /** Por método: cobros de la venta más propinas (igual que el ticket). */
    paymentsByMethod: { method: string; amount: number }[];
    commissionsTotal: number;
    tipsTotal: number;
    /** Va al equipo: comisiones + propina. */
    toTeam: number;
    /** Ingreso de la venta (sin propina). */
    income: number;
};
export type BreakdownShop = {
    /** Costo de producto de la venta. */
    productCost: number;
    /** Unidades de producto sin costo conocido (el resultado no las descuenta). */
    unitsWithoutCost: number;
    /** Le queda a la barbería = ingreso − comisiones − costo de producto. */
    keeps: number;
    formula: string;
};

export type SaleBreakdown = {
    saleId: string;
    folio: string;
    scope: BreakdownScope;
    /** Venta anulada: comisiones y propinas revertidas; los montos son los que se revirtieron. */
    voided: boolean;
    lines: BreakdownLine[];
    tips: BreakdownTipRow[];
    /** Cuántas comisiones (o propinas) existen para esta venta. 0 = todavía no se generan. */
    generatedCount: number;
    pendingCount: number;
    /** Renglones de producto regalados (cortesía, sin comisión). */
    courtesyCount: number;
    summary: BreakdownSummary;
    /** Ausente para recepción. */
    shop?: BreakdownShop;
};

const toCents = (value: number | string | null | undefined): number => {
    const n = Number(value ?? 0);
    return Number.isFinite(n) ? Math.round(n * 100) : 0;
};
const fromCents = (cents: number) => cents / 100;
const money = (cents: number) => formatMoney(fromCents(cents), { cents: true });

/** Nombre de pila: la primera palabra del nombre. */
export function firstName(fullName: string | null | undefined): string | null {
    const first = (fullName ?? '').trim().split(/\s+/)[0];
    return first ? first : null;
}

export const HOLD_REASON_LABELS: Record<string, string> = {
    product_discount_rule_pending: 'Producto con descuento: falta decidir cómo se paga la comisión.',
    multiple_beneficiaries: 'Hay varios beneficiarios: falta repartir la comisión.',
    commission_rule_missing: 'No hay una regla de comisión para este renglón.',
    beneficiary_missing: 'No se indicó quién recibe la comisión.',
};
const PENDING_DEFAULT = 'Sin beneficiario o sin regla: la gerencia debe resolverla.';

export const FORMULA_TEXT = 'Ingreso (sin propina) − comisiones − costo de producto';

export function buildSaleBreakdown(input: BreakdownInput, scope: BreakdownScope): SaleBreakdown {
    const { sale } = input;
    const voided = sale.status === 'refunded' || sale.status === 'partially_refunded' || sale.status === 'cancelled';
    // Qué estado de comisión y de propina cuenta: las vigentes, o las revertidas si la venta se anuló.
    const live = voided ? 'reversed' : 'generated';
    const showCost = scope === 'full';

    const commissionByItem = new Map<string, BreakdownCommission>();
    for (const c of input.commissions) {
        if (c.status !== live) continue;
        // Una comisión por renglón (la base lo asegura); si hubiera dos, la primera manda y la otra se suma abajo.
        if (!commissionByItem.has(c.sale_item_id)) commissionByItem.set(c.sale_item_id, c);
    }
    const holdByItem = new Map<string, BreakdownHold>();
    for (const h of input.holds ?? []) if (!h.resolved_at) holdByItem.set(h.sale_item_id, h);

    let incomeCents = 0, commissionsCents = 0, costCents = 0, unitsWithoutCost = 0;
    let generatedCount = 0, pendingCount = 0, courtesyCount = 0;

    const lines: BreakdownLine[] = input.items.map((item) => {
        const quantity = Number(item.quantity);
        const listCents = Math.round(quantity * toCents(item.unit_price));
        const discountCents = toCents(item.discount_amount);
        incomeCents += toCents(item.line_total);

        const entry = commissionByItem.get(item.id);
        const beneficiaryId = entry?.employee_id ?? (item.item_type === 'service' ? item.employee_id : item.commission_employee_id);
        const base = entry ? toCents(entry.basis_amount) : null;
        const commissionCents = entry ? toCents(entry.commission_amount) : null;
        if (commissionCents !== null) { commissionsCents += commissionCents; generatedCount += 1; }

        // Cortesía de producto: renglón en $0 que no pagó comisión (la de $0 guardada o ninguna).
        const courtesy = item.item_type === 'product' && toCents(item.line_total) === 0 && (commissionCents === null || commissionCents === 0);
        if (courtesy) courtesyCount += 1;
        // Sin comisión en una venta vigente = en espera. En una anulada sin comisión revertida no hay nada que revertir.
        const pending = !entry && !voided && !courtesy;
        if (pending) pendingCount += 1;
        const hold = holdByItem.get(item.id);

        let baseNote: string | null = null;
        if (courtesy) {
            baseNote = `Producto regalado: precio de lista ${money(listCents)}, cobrado ${money(0)}. Las cortesías de producto no pagan comisión.`;
        } else if (discountCents > 0 && entry) {
            baseNote = entry.basis === 'price_before_discount'
                ? `Base sin descuento: precio de lista ${money(listCents)}; el descuento de ${money(discountCents)} no la reduce.`
                : `Base con descuento: se calculó sobre lo cobrado; el precio de lista era ${money(listCents)} (descuento ${money(discountCents)}). Así quedó guardada; las ventas nuevas usan el precio de lista.`;
        } else if (discountCents > 0) {
            baseNote = `Precio de lista ${money(listCents)}; descuento ${money(discountCents)}.`;
        }

        const line: BreakdownLine = {
            itemId: item.id,
            name: item.item_name_snapshot,
            type: item.item_type,
            quantity,
            listAmount: fromCents(listCents),
            discount: fromCents(discountCents),
            base: courtesy || base === null ? null : fromCents(base),
            discounted: discountCents > 0,
            baseNote,
            percentage: !courtesy && entry && entry.calculation_type === 'percentage' && entry.percentage_snapshot !== null ? Number(entry.percentage_snapshot) : null,
            fixedAmount: !courtesy && entry && entry.calculation_type === 'fixed_amount' ? Number(entry.fixed_amount_snapshot ?? entry.commission_amount) : null,
            // En espera no hay beneficiario: no se muestra un nombre que aún no tiene la comisión.
            beneficiaryName: pending ? null : firstName(input.names[beneficiaryId ?? '']),
            commission: courtesy ? 0 : commissionCents === null ? null : fromCents(commissionCents),
            pending,
            courtesy,
            pendingReason: pending ? (hold ? HOLD_REASON_LABELS[hold.reason] ?? PENDING_DEFAULT : PENDING_DEFAULT) : null,
            reversed: voided && !!entry,
        };

        if (showCost && item.item_type === 'product') {
            const unit = item.unit_cost_snapshot ?? (item.product_id ? input.fallbackUnitCosts?.[item.product_id] : undefined);
            if (unit === null || unit === undefined || unit === '') {
                unitsWithoutCost += quantity;
                line.cost = null;
            } else {
                const lineCost = Math.round(quantity * toCents(unit));
                costCents += lineCost;
                line.cost = fromCents(lineCost);
            }
        }
        return line;
    });

    let tipsCents = 0;
    const tips: BreakdownTipRow[] = [];
    const tipsByMethod = new Map<string, number>();
    for (const t of input.tips) {
        if (t.status !== live) continue;
        const cents = toCents(t.amount);
        tipsCents += cents;
        tips.push({ name: firstName(input.names[t.employee_id]), amount: fromCents(cents), method: t.method, percentage: 100, reversed: voided });
        tipsByMethod.set(t.method, (tipsByMethod.get(t.method) ?? 0) + cents);
    }
    generatedCount += tips.length;

    // Lo que pagó el cliente por método: cobros de la venta (confirmados, o revertidos si se anuló) más propinas.
    const paidByMethod = new Map<string, number>();
    for (const p of input.payments) {
        if (p.status !== (voided ? 'reversed' : 'confirmed')) continue;
        paidByMethod.set(p.method, (paidByMethod.get(p.method) ?? 0) + toCents(p.amount));
    }
    for (const [method, cents] of tipsByMethod) paidByMethod.set(method, (paidByMethod.get(method) ?? 0) + cents);
    const paymentsByMethod = [...paidByMethod].map(([method, cents]) => ({ method, amount: fromCents(cents) }));

    const summary: BreakdownSummary = {
        income: fromCents(incomeCents),
        charged: fromCents(incomeCents + tipsCents),
        paymentsByMethod,
        commissionsTotal: fromCents(commissionsCents),
        tipsTotal: fromCents(tipsCents),
        toTeam: fromCents(commissionsCents + tipsCents),
    };

    const result: SaleBreakdown = {
        saleId: sale.id, folio: sale.folio, scope, voided, lines, tips,
        generatedCount, pendingCount, courtesyCount, summary,
    };
    if (showCost) {
        result.shop = {
            productCost: fromCents(costCents),
            unitsWithoutCost,
            keeps: fromCents(incomeCents - commissionsCents - costCents),
            formula: FORMULA_TEXT,
        };
    }
    return result;
}
