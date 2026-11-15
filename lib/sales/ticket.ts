// Ticket de venta para el cliente. Todo sale de lo que la base guardó al cobrar
// (precios, descuentos y pagos de ese momento), nunca del catálogo actual.

export type TicketSaleRow = {
    id: string;
    /** Folio corto que la base asigna al cobrar (V2611-0042: año, mes y consecutivo del mes). */
    folio: string;
    created_at: string;
    status: string;
    subtotal_amount: number | string;
    discount_amount: number | string;
    total_amount: number | string;
    client_id: string | null;
    created_by: string | null;
    sale_items: {
        item_type: 'service' | 'product';
        item_name_snapshot: string;
        quantity: number | string;
        unit_price: number | string;
        discount_amount: number | string;
        line_total: number | string;
        employee_id: string | null;
    }[];
    payments: { method: string; amount: number | string; status: string }[];
    sale_tips?: { amount: number | string; method: string; status: string }[] | null;
};

export type Ticket = {
    id: string;
    folio: string;
    created_at: string;
    cancelled: boolean;
    client_name: string | null;
    attended_by: string[];
    cashier_name: string | null;
    lines: { name: string; quantity: number; unit_price: number; discount: number; total: number }[];
    subtotal: number;
    discount: number;
    total: number;
    tip: number;
    grand_total: number;
    payments: { method: string; amount: number }[];
};

const num = (value: number | string | null | undefined) => Number(value ?? 0);
const cents = (value: number) => Math.round(value * 100);

export function toTicket(
    row: TicketSaleRow,
    names: { employees: Map<string, string>; client: string | null; cashier: string | null },
): Ticket {
    // Lo que pagó el cliente por método: cobros de la venta más propinas.
    const byMethod = new Map<string, number>();
    const add = (method: string, amount: number) => byMethod.set(method, (byMethod.get(method) ?? 0) + cents(amount));
    for (const p of row.payments) if (p.status === 'confirmed') add(p.method, num(p.amount));
    let tipCents = 0;
    for (const t of row.sale_tips ?? []) {
        if (t.status !== 'generated') continue;
        tipCents += cents(num(t.amount));
        add(t.method, num(t.amount));
    }
    const attended = Array.from(new Set(row.sale_items
        .map((i) => (i.employee_id ? names.employees.get(i.employee_id) : undefined))
        .filter((name): name is string => Boolean(name))));
    const total = num(row.total_amount);

    return {
        id: row.id,
        folio: row.folio,
        created_at: row.created_at,
        cancelled: row.status === 'refunded' || row.status === 'cancelled',
        client_name: names.client,
        attended_by: attended,
        cashier_name: names.cashier,
        lines: row.sale_items.map((i) => ({
            name: i.item_name_snapshot,
            quantity: num(i.quantity),
            unit_price: num(i.unit_price),
            discount: num(i.discount_amount),
            total: num(i.line_total),
        })),
        subtotal: num(row.subtotal_amount),
        discount: num(row.discount_amount),
        total,
        tip: tipCents / 100,
        grand_total: (cents(total) + tipCents) / 100,
        payments: Array.from(byMethod, ([method, amount]) => ({ method, amount: amount / 100 })),
    };
}
