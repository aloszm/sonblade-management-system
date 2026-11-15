import type { Sale, SaleItem } from '@/types';

// Filas tal como las devuelve la base (esquema v2).
export type SaleRow = {
    id: string;
    created_at: string;
    status: string;
    total_amount: number | string;
    notes: string | null;
    client_id: string | null;
    sale_items: {
        id: string;
        item_type: 'service' | 'product';
        item_name_snapshot: string;
        unit_price: number | string;
        quantity: number | string;
        service_id: string | null;
        product_id: string | null;
        employee_id: string | null;
        commission_employee_id: string | null;
    }[];
    payments: { method: string; amount: number | string; status: string }[];
    sale_tips?: { amount: number | string; status: string }[] | null;
};

const num = (value: number | string | null | undefined) => Number(value ?? 0);

/** Traduce una venta del modelo nuevo a la forma que usa el historial de ventas. */
export function toSaleView(row: SaleRow, employees: Map<string, string>, clients: Map<string, string>): Sale & { status: string } {
    let cash = 0;
    let card = 0;
    let transfer = 0;
    for (const p of row.payments) {
        if (p.method === 'cash') cash += num(p.amount);
        else if (p.method === 'card') card += num(p.amount);
        else if (p.method === 'transfer') transfer += num(p.amount);
    }
    const used = [cash > 0, card > 0, transfer > 0].filter(Boolean).length;
    const paymentMethod: Sale['payment_method'] = used > 1 ? 'mixed' : card > 0 ? 'card' : transfer > 0 ? 'transfer' : 'cash';

    const barberId = row.sale_items.find((i) => i.employee_id)?.employee_id
        ?? row.sale_items.find((i) => i.commission_employee_id)?.commission_employee_id
        ?? null;

    return {
        id: row.id,
        status: row.status,
        barber_id: barberId,
        client_id: row.client_id,
        total: num(row.total_amount),
        // Propinas vigentes de la venta. No forman parte del total: son del barbero.
        tip: (row.sale_tips ?? []).filter((t) => t.status === 'generated').reduce((sum, t) => sum + num(t.amount), 0),
        cash_amount: cash,
        card_amount: card,
        transfer_amount: transfer,
        payment_method: paymentMethod,
        notes: row.notes ?? '',
        commission_type: 'flat_50',
        created_at: row.created_at,
        barber: barberId ? ({ id: barberId, name: employees.get(barberId) ?? 'Barbero' } as Sale['barber']) : undefined,
        client: row.client_id ? ({ id: row.client_id, name: clients.get(row.client_id) ?? 'Cliente' } as Sale['client']) : undefined,
        items: row.sale_items.map((i) => ({
            id: i.id,
            item_type: i.item_type,
            item_name: i.item_name_snapshot,
            item_price: num(i.unit_price),
            quantity: num(i.quantity),
            service_id: i.service_id,
            product_id: i.product_id,
        }) as unknown as SaleItem),
    };
}
