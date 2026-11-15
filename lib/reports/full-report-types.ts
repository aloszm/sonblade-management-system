// Forma del jsonb que entrega public.business_full_report (los importes llegan como number).

export type Audience = 'interno' | 'contador';

export type FullKpis = {
    revenue: number; cuts: number; products: number; tickets: number; tips: number; commissions: number;
    expenses: number; avg_ticket: number; net: number;
    discounts_total: number; discounts_count: number; reversals_total: number; reversals_count: number;
};

export type CashSessionReport = {
    id: string; status: 'open' | 'closed';
    opened_at: string; opened_by: string | null; opening_cash: number; opening_expected: number | null;
    closed_at: string | null; closed_by: string | null;
    sales: number; sales_cash: number; sales_card: number; sales_transfer: number; refunds: number; tips: number;
    expenses: number; withdrawals: number; commission_payouts: number; deposits: number;
    expected_cash: number | null; counted_cash: number | null; difference: number | null;
    counted_breakdown: Record<string, number> | null;
    float_left: number | null; reserve_amount: number | null; reserve_label: string | null; withdrawn_amount: number | null;
    movements: { at: string; type: string; direction: 'in' | 'out'; method: string; amount: number; description: string | null; by: string | null }[];
};

export type AuditEntry = {
    at: string; action: string; entity: string; entity_id: string | null; actor: string; role: string | null; reason: string | null;
    details: { changes?: Record<string, { from: unknown; to: unknown }>; before?: Record<string, unknown>; after?: Record<string, unknown> };
};

export type MethodTotals = { cash: number; card: number; transfer: number; other: number };

/** Persona del equipo en el resultado financiero (barbero o recepción). */
export type FinancialPerson = {
    id: string | null; name: string; is_barber: boolean;
    services: number; products: number; revenue: number; service_count: number; product_count: number;
    /** Comisión que ganó esta persona. */
    commission: number;
    tips: number; tip_count: number;
    /** Costo de los productos que vendió. */
    product_cost: number;
    /** Comisiones pagadas por las ventas de esta persona (a ella o a quien vendió el producto). */
    sales_commissions: number;
    /** Lo que deja al negocio antes de gastos: lo vendido − sales_commissions − product_cost. */
    contribution: number;
};

/** Estado de resultados de un periodo; mismas reglas que lib/admin/profit.ts. */
export type FinancialPeriod = {
    revenue: { services: number; products: number; total: number; discounts: number };
    commissions: { services: number; products: number; total: number };
    product_cost: { total: number; source: string; units_without_cost: number; missing: { product_id: string | null; name: string; units: number }[] };
    expenses: { total: number; by_category: { category: string; total: number; count: number }[]; by_method: MethodTotals };
    tips: { total: number; count: number; by_method: MethodTotals };
    profit: number;
    /** null si no hubo ingresos. */
    margin_pct: number | null;
    counts: { sales: number; voided_excluded: number; service_units: number; product_units: number };
    /** Solo en el periodo actual. */
    by_person: FinancialPerson[] | null;
};

export type FullReport = {
    version: number;
    audience: Audience;
    cover: {
        business: { id: string; name: string };
        branch: { id: string; name: string; address: string | null };
        timezone: string;
        period: { from: string; to: string; days: number; previous_from: string; previous_to: string };
        generated_at: string;
        generated_by: { id: string; name: string; role: string | null };
        folio?: string;
    };
    summary: { kpis: FullKpis; previous: FullKpis };
    sales: {
        daily: { day: string; revenue: number; cuts: number; tickets: number }[];
        payments: { cash: number; card: number; transfer: number; other: number };
        by_person: { id: string; name: string; is_barber: boolean; cuts: number; products: number; revenue: number; tickets: number; tips: number; commission: number }[];
        by_item: { name: string; type: 'service' | 'product'; count: number; revenue: number }[];
        discounts: { at: string; sale: string; subtotal: number; discount: number; total: number; reason: string | null; status: string; authorized_by: string | null; sold_by: string | null }[];
        reversals: { at: string; sale: string; sold_at: string | null; amount: number; reason: string | null; reversed_by: string | null; sold_by: string | null }[];
    };
    cash: { sessions: CashSessionReport[]; reserve_label: string | null };
    expenses: { at: string; incurred_at: string | null; category: string | null; concept: string | null; amount: number; method: string; status: string; by: string | null }[];
    payouts: {
        settlements: { receipt: string | null; employee: string | null; period_start: string; period_end: string; total: number; cash: number; transfer: number; other: number; paid_at: string; paid_by: string | null; reference: string | null }[];
        adjustments: { at: string; employee: string | null; amount: number; remaining: number; reason: string | null; status: string; created_by: string | null; reviewed_by: string | null; reviewed_at: string | null; review_note: string | null }[];
    };
    inventory: {
        stock: { product: string; sku: string | null; quantity: number; minimum: number; unit_cost: number | null; value: number; low: boolean }[];
        movements: { at: string; product: string; type: string; quantity: number; unit_cost: number | null; reference: string | null; note: string | null; by: string | null }[];
    };
    agenda: {
        by_status: { status: string; count: number }[];
        cancelled: { at: string; barber: string | null; reason: string | null; client?: string | null; phone?: string | null }[];
        no_show: { at: string; barber: string | null; client?: string | null; phone?: string | null }[];
    };
    audit: AuditEntry[];
    annex: { at: string; sale: string; type: 'service' | 'product'; item: string; quantity: number; unit_price: number; discount: number; amount: number; employee: string | null; methods: string | null; client?: string | null }[];
    /** Resultado financiero. Falta en los reportes emitidos antes de la migración 20261115195335. */
    financial?: { current: FinancialPeriod; previous: FinancialPeriod };
};

/** Lo que entrega public.register_report_export: el reporte con su folio y su código de verificación. */
export type ExportedReport = { folio: string; sha256: string; generated_at: string; report: FullReport };

export type VerifyResult =
    | { valid: true; folio: string; period_from: string; period_to: string; audience: Audience; branch: string | null; generated_by: string | null; generated_at: string; timezone: string | null }
    | { valid: false; reason: 'format' | 'not_found' | 'code_mismatch' | 'altered' };
