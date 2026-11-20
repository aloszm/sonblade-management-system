import type { SupabaseClient } from '@supabase/supabase-js';

// Costo guardado al vender (sale_items.unit_cost_snapshot), leído con public.sale_item_costs
// (20261120100000_sale_item_costs_read): la base solo se lo entrega a dueño, gerencia y consulta.
// La columna se cerrará a la API (supabase/pending/close_sale_items_cost.sql), así que ninguna pantalla debe
// pedirla directo a sale_items.

const CHUNK = 150;
const PAGE = 1000;

/** Mapa renglón → costo unitario guardado (null si la venta no lo guardó). Solo renglones de producto. */
export async function loadSaleItemCosts(
    supabase: SupabaseClient,
    branchId: string,
    saleIds: string[],
): Promise<Map<string, number | string | null>> {
    const costs = new Map<string, number | string | null>();
    for (let i = 0; i < saleIds.length; i += CHUNK) {
        const chunk = saleIds.slice(i, i + CHUNK);
        for (let offset = 0; ; offset += PAGE) {
            const { data, error } = await supabase.rpc('sale_item_costs', { p_branch_id: branchId, p_sale_ids: chunk })
                .order('sale_item_id').range(offset, offset + PAGE - 1);
            if (error) throw error;
            const page = (data ?? []) as { sale_item_id: string; unit_cost_snapshot: number | string | null }[];
            for (const row of page) costs.set(row.sale_item_id, row.unit_cost_snapshot);
            if (page.length < PAGE) break;
        }
    }
    return costs;
}

/** Pone en cada renglón el costo guardado que devolvió la base (los que no son producto quedan en null). */
export function withSaleItemCosts<T extends { id: string }>(items: T[], costs: Map<string, number | string | null>): (T & { unit_cost_snapshot: number | string | null })[] {
    return items.map((item) => ({ ...item, unit_cost_snapshot: costs.get(item.id) ?? null }));
}
