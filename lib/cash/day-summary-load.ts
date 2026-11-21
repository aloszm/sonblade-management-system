import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { businessDayRange } from '@/lib/business/timezone';
import { fetchAll, loadCashFlows, loadOtherExpenses, type Query } from '@/lib/cash/cash-flow-load';
import {
    buildDaySummary, dayCashFromFlows, type DayEmployee, type DayItem, type DayPayment, type DaySale, type DaySummaryPayload, type DayTip,
} from '@/lib/cash/day-summary';
import { withFlowSessionColumns, type CashSessionRow } from '@/lib/cash/session-view';

// Lectura con el cliente del usuario (RLS): recepción, gerencia, consulta y dueño leen sales, sale_items, payments,
// sale_tips, cash_sessions y cash_movements de su sucursal. NUNCA se pide unit_cost_snapshot ni se usa select('*').
// PostgREST entrega como máximo 1000 filas por consulta: se pagina, y los filtros por venta van en bloques.

const CHUNK = 150;

async function fetchBySaleIds<T>(ids: string[], build: (chunk: string[]) => Query): Promise<T[]> {
    const rows: T[] = [];
    for (let i = 0; i < ids.length; i += CHUNK) rows.push(...(await fetchAll<T>(() => build(ids.slice(i, i + CHUNK)))));
    return rows;
}

export async function loadDaySummary(
    supabase: SupabaseClient,
    scope: { businessId: string; branchId: string },
    day: string,
    timezone: string,
    /**
     * Cuenta principal, gerencia y consulta (true) ven además quién registró cada movimiento y los gastos del sobre o del banco.
     * Recepción (false) ve solo lo que ya ve en la lista de movimientos de Caja.
     */
    managementView = false,
): Promise<Pick<DaySummaryPayload, 'summary' | 'cash'>> {
    const { businessId, branchId } = scope;
    const range = businessDayRange(day, day, timezone);

    const sales = await fetchAll<DaySale>(() => supabase.from('sales').select('id, folio, status, total_amount, paid_at')
        .eq('business_id', businessId).eq('branch_id', branchId).in('status', ['paid', 'refunded', 'partially_refunded', 'cancelled'])
        .gte('paid_at', range.from).lt('paid_at', range.to).order('paid_at').order('id'));
    const ids = sales.map((s) => s.id);

    const [items, payments, tips, employees, cutServices, sessions] = await Promise.all([
        fetchBySaleIds<DayItem>(ids, (chunk) => supabase.from('sale_items')
            .select('sale_id, item_type, item_name_snapshot, service_id, quantity, line_total, employee_id, commission_employee_id')
            .eq('business_id', businessId).eq('branch_id', branchId).in('sale_id', chunk).order('id')),
        fetchBySaleIds<DayPayment>(ids, (chunk) => supabase.from('payments')
            .select('sale_id, method, amount, status')
            .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'confirmed').in('sale_id', chunk).order('id')),
        fetchBySaleIds<DayTip>(ids, (chunk) => supabase.from('sale_tips')
            .select('sale_id, employee_id, amount, method, status')
            .eq('business_id', businessId).eq('branch_id', branchId).eq('status', 'generated').in('sale_id', chunk).order('id')),
        fetchAll<DayEmployee>(() => supabase.from('employees').select('id, display_name').eq('business_id', businessId).order('id')),
        fetchAll<{ id: string }>(() => supabase.from('services').select('id').eq('business_id', businessId).eq('category', 'cortes').order('id')),
        // Cajas del día: las que se ABRIERON ese día del negocio.
        withFlowSessionColumns((columns) => fetchAll<CashSessionRow>(() => supabase.from('cash_sessions').select(columns)
            .eq('business_id', businessId).eq('branch_id', branchId).gte('opened_at', range.from).lt('opened_at', range.to).order('opened_at').order('id'))),
    ]);

    const [flows, otherExpenses] = await Promise.all([
        loadCashFlows(supabase, scope, sessions, { showAuthors: managementView }),
        managementView ? loadOtherExpenses(supabase, scope, day, timezone) : Promise.resolve(null),
    ]);

    return {
        summary: buildDaySummary({ date: day, sales, items, payments, tips, employees, cutServiceIds: cutServices.map((s) => s.id) }),
        cash: dayCashFromFlows(flows, otherExpenses),
    };
}
