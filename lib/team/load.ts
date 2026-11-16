import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
    buildTeamSummary, type CommissionRow, type EmployeeRow, type ItemRow, type SaleRow, type TeamSummary, type TipRow,
} from '@/lib/team/summary';

// Lectura con el cliente del usuario (RLS). Recepción, caja, gerencia y dueño pueden leer sales, sale_items,
// commission_entries y sale_tips de su sucursal (políticas sales_select_finance, sale_items_select_finance_or_own,
// commission_entries_select_admin_or_own y sale_tips_select_front_desk_or_own); employees lo lee todo el equipo.
// PostgREST entrega como máximo 1000 filas por consulta: se pagina, y los filtros por venta van en bloques.

const PAGE = 1000;
const CHUNK = 150;

type Query = { range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }> };

async function fetchAll<T>(build: () => Query): Promise<T[]> {
    const rows: T[] = [];
    for (let offset = 0; ; offset += PAGE) {
        const { data, error } = await build().range(offset, offset + PAGE - 1);
        if (error) throw error;
        const page = (data ?? []) as T[];
        rows.push(...page);
        if (page.length < PAGE) return rows;
    }
}

async function fetchBySaleIds<T>(ids: string[], build: (chunk: string[]) => Query): Promise<T[]> {
    const rows: T[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) rows.push(...(await fetchAll<T>(() => build(ids.slice(i, i + CHUNK)))));
    return rows;
}

export async function loadEmployees(supabase: SupabaseClient, businessId: string): Promise<EmployeeRow[]> {
    return fetchAll<EmployeeRow>(() => supabase.from('employees').select('id, display_name, is_barber, is_active')
        .eq('business_id', businessId).order('id'));
}

/** Resumen del equipo en [window.start, window.end): solo ventas cobradas (no anuladas) de la sucursal. */
export async function loadTeamSummary(
    supabase: SupabaseClient,
    scope: { businessId: string; branchId: string },
    window: { start: string; end: string },
    employees: EmployeeRow[],
): Promise<TeamSummary> {
    const { businessId, branchId } = scope;
    const sales = await fetchAll<SaleRow>(() => supabase.from('sales').select('id, status')
        .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'paid')
        .gte('paid_at', window.start).lt('paid_at', window.end).order('paid_at').order('id'));
    const ids = sales.map((s) => s.id);
    const [items, commissions, tips] = await Promise.all([
        fetchBySaleIds<ItemRow>(ids, (chunk) => supabase.from('sale_items')
            .select('id, sale_id, item_type, item_name_snapshot, quantity, line_total, employee_id, commission_employee_id')
            .eq('business_id', businessId).eq('branch_id', branchId).in('sale_id', chunk).order('id')),
        fetchBySaleIds<CommissionRow>(ids, (chunk) => supabase.from('commission_entries')
            .select('sale_id, sale_item_id, commission_amount, status, employee_id')
            .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'generated').in('sale_id', chunk).order('id')),
        fetchBySaleIds<TipRow>(ids, (chunk) => supabase.from('sale_tips')
            .select('sale_id, amount, status, employee_id')
            .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'generated').in('sale_id', chunk).order('id')),
    ]);
    return buildTeamSummary({ sales, items, commissions, tips, employees });
}
